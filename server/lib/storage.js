import { mkdir, readFile, rename, rm, stat, utimes } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
    accountPairingResponse,
    activeAccessSession,
    activeAccessToken,
    activeRefreshSession,
    addPairingToken,
    addSession,
    assertAccountLogin,
    constantTimeEqual,
    consumePairingToken,
    pruneExpiredSessions,
    prunePairingTokens,
    randomToken,
    sessionResponse,
} from './account.js';
import { encodePath, safeName } from './encoding.js';
import { forbidden, notFound, unauthorized } from './http-error.js';
import { compareEntries, normalizeManifest, sha256 } from './manifest.js';
import { readJson, uploadEntry, validateStagedBuffer, writeFileAtomic, writeJsonAtomic } from './storage-io.js';
import { writeRequestStreamAtomic } from './stream-io.js';

const MAX_HISTORY_ITEMS = 100;
const MAX_ROLLBACK_POINTS = 20;

export class TtSyncStorage {
    constructor(options) {
        this.rootDir = path.resolve(options.rootDir);
        this.planLocks = new Map();
    }

    async status() {
        await mkdir(this.rootDir, { recursive: true });
        return { ok: true, service: 'minimal-tt-sync', version: '1.0.0' };
    }

    async completePairing(options) {
        const namespace = safeName(options.namespace || 'default', 'namespace');
        const record = await this.readOrCreateNamespace(namespace);
        consumePairingToken(record, options.token);
        const device = addDevice(record, options.deviceName);
        await this.writeNamespace(namespace, record);
        return pairingResponse(record, device, options.endpoint);
    }

    async completeTauriPairing(options) {
        const namespace = safeName(options.namespace || 'default', 'namespace');
        const record = await this.readOrCreateNamespace(namespace);
        consumePairingToken(record, options.token);
        upsertDevice(record, {
            deviceId: options.deviceId,
            deviceName: options.deviceName,
            publicKey: options.publicKey,
        });
        await this.writeNamespace(namespace, record);
        return record;
    }

    async requireAuth(namespace, authHeader) {
        const record = await this.readNamespace(namespace);
        const token = String(authHeader || '').replace(/^Bearer\s+/i, '').trim();
        if (!token) {
            throw unauthorized('Missing bearer token');
        }
        if (!constantTimeEqual(token, record.authToken) && !activeAccessToken(record, token)) {
            throw forbidden('Invalid bearer token');
        }
        return record;
    }

    async requireAuthSession(namespace, authHeader) {
        const record = await this.requireAuth(namespace, authHeader);
        const token = String(authHeader || '').replace(/^Bearer\s+/i, '').trim();
        const session = activeAccessSession(record, token);
        if (!session?.deviceId) {
            throw forbidden('A device session token is required');
        }
        return { record, session };
    }

    async loginAccount(options) {
        assertAccountLogin(options);
        const namespace = safeName(options.namespace || 'default', 'namespace');
        const record = await this.readNamespace(namespace).catch(error => {
            if (error.status === 404) {
                return this.createNamespace(namespace);
            }
            throw error;
        });
        record.account = { username: process.env.TT_SYNC_ACCOUNT_USERNAME };
        const session = addSession(record);
        await this.writeNamespace(namespace, record);
        return sessionResponse(record, session);
    }

    async createAccountPairing(options) {
        const namespace = safeName(options.namespace || 'default', 'namespace');
        await this.requireAuth(namespace, options.authHeader);
        const record = await this.readNamespace(namespace);
        const token = addPairingToken(record);
        await this.writeNamespace(namespace, record);
        return accountPairingResponse({
            endpoint: String(options.endpoint || '').trim(),
            namespace,
            spki: String(options.spki || '').trim(),
            token,
        });
    }

    async refreshAccountToken(namespace, refreshToken) {
        const record = await this.readNamespace(namespace);
        const existing = activeRefreshSession(record, refreshToken);
        if (!existing) {
            throw unauthorized('Invalid refresh token');
        }
        record.sessions = record.sessions.filter(session => session.refreshToken !== refreshToken);
        const session = addSession(record);
        await this.writeNamespace(namespace, record);
        return sessionResponse(record, session);
    }

    async openSession(namespace, deviceId) {
        const record = await this.readNamespace(namespace);
        touchDevice(record, String(deviceId || '').trim(), { lastSeenAt: new Date().toISOString() });
        const session = addSession(record, String(deviceId || '').trim());
        await this.writeNamespace(namespace, record);
        return {
            namespace,
            deviceId: String(deviceId || '').trim(),
            openedAt: new Date().toISOString(),
            session,
            serverId: record.serverId,
        };
    }

    async readManifest(namespace) {
        return readJson(this.manifestPath(namespace), []).then(normalizeManifest);
    }

    async writeManifest(namespace, manifest) {
        await writeJsonAtomic(this.manifestPath(namespace), normalizeManifest(manifest));
    }

    async savePlan(plan) {
        await writeJsonAtomic(this.planPath(plan.id), plan);
        return plan;
    }

    async readPlan(planId) {
        return readJson(this.planPath(planId)).catch(error => {
            if (error.code === 'ENOENT') {
                throw notFound(`Plan not found: ${planId}`);
            }
            throw error;
        });
    }

    async writePlan(plan) {
        await writeJsonAtomic(this.planPath(plan.id), plan);
    }

    async stageFile(plan, entry, buffer) {
        return this.withPlanLock(plan.id, async () => {
            const latest = await this.readPlan(plan.id);
            const latestEntry = uploadEntry(latest, entry.path);
            validateStagedBuffer(latestEntry, buffer);
            await writeFileAtomic(this.stagedFilePath(latest.id, latestEntry.path), buffer);
            const staged = { ...(latest.staged || {}) };
            staged[latestEntry.path] = { sizeBytes: buffer.length, sha256: sha256(buffer) };
            const updated = { ...latest, staged };
            await this.writePlan(updated);
            return updated;
        });
    }

    async stageFileStream(plan, entry, stream, maxBytes) {
        const latest = await this.readPlan(plan.id);
        const latestEntry = uploadEntry(latest, entry.path);
        const result = await writeRequestStreamAtomic({
            expectedBytes: Number(latestEntry.sizeBytes),
            expectedSha256: latestEntry.sha256 || '',
            filePath: this.stagedFilePath(latest.id, latestEntry.path),
            maxBytes,
            stream,
            syncPath: latestEntry.path,
        });
        return this.withPlanLock(plan.id, async () => {
            const locked = await this.readPlan(plan.id);
            const lockedEntry = uploadEntry(locked, latestEntry.path);
            const staged = { ...(locked.staged || {}) };
            staged[lockedEntry.path] = result;
            const updated = { ...locked, staged };
            await this.writePlan(updated);
            return updated;
        });
    }

    async remoteFileStat(namespace, entry) {
        return stat(this.remoteFilePath(namespace, entry.path)).catch(error => {
            if (error.code === 'ENOENT') {
                throw notFound(`Remote file not found: ${entry.path}`);
            }
            throw error;
        });
    }

    async readRemoteFile(namespace, entry) {
        return readFile(this.remoteFilePath(namespace, entry.path)).catch(error => {
            if (error.code === 'ENOENT') {
                throw notFound(`Remote file not found: ${entry.path}`);
            }
            throw error;
        });
    }

    async commitPlan(plan, body = {}) {
        if (plan.committedAt) {
            throw forbidden(`Plan already committed: ${plan.id}`);
        }
        let rollbackPoint = null;
        if (plan.kind === 'push') {
            rollbackPoint = await this.createRollbackPoint(plan);
            await this.commitPushPlan(plan, body.conflictDecisions || {});
        }
        plan.committedAt = new Date().toISOString();
        await this.writePlan(plan);
        await this.recordCommittedPlan(plan, rollbackPoint || null);
        return plan;
    }

    async listDevices(namespace) {
        return (await this.readNamespace(namespace)).devices || [];
    }

    async listHistory(namespace) {
        return (await this.readNamespace(namespace)).syncHistory || [];
    }

    async listRollbackPoints(namespace) {
        return (await this.readNamespace(namespace)).rollbackPoints || [];
    }

    async restoreRollbackPoint(namespace, rollbackId) {
        const point = await readJson(this.rollbackPointPath(namespace, rollbackId)).catch(error => {
            if (error.code === 'ENOENT') {
                throw notFound(`Rollback point not found: ${rollbackId}`);
            }
            throw error;
        });
        const manifest = new Map((await this.readManifest(namespace)).map(entry => [entry.path, entry]));
        await this.restoreRollbackFiles(namespace, point, manifest);
        await this.writeManifest(namespace, Array.from(manifest.values()).sort(compareEntries));
        return { restoredAt: new Date().toISOString(), rollbackId };
    }

    namespaceDir(namespace) {
        return path.join(this.rootDir, 'namespaces', safeName(namespace, 'namespace'));
    }

    planDir(planId) {
        return path.join(this.rootDir, 'plans', safeName(planId, 'plan id'));
    }

    manifestPath(namespace) {
        return path.join(this.namespaceDir(namespace), 'manifest.json');
    }

    namespacePath(namespace) {
        return path.join(this.namespaceDir(namespace), 'namespace.json');
    }

    planPath(planId) {
        return path.join(this.planDir(planId), 'plan.json');
    }

    stagedFilePath(planId, syncPath) {
        return path.join(this.planDir(planId), 'staged', encodePath(syncPath));
    }

    remoteFilePath(namespace, syncPath) {
        return path.join(this.namespaceDir(namespace), 'files', encodePath(syncPath));
    }

    rollbackPointPath(namespace, rollbackId) {
        return path.join(this.namespaceDir(namespace), 'rollback', `${safeName(rollbackId, 'rollback id')}.json`);
    }

    async withPlanLock(planId, operation) {
        const key = safeName(planId, 'plan id');
        const previous = this.planLocks.get(key) || Promise.resolve();
        let release;
        const next = new Promise(resolve => {
            release = resolve;
        });
        const chained = previous.catch(() => {}).then(() => next);
        this.planLocks.set(key, chained);
        await previous.catch(() => {});
        try {
            return await operation();
        } finally {
            release();
            if (this.planLocks.get(key) === chained) {
                this.planLocks.delete(key);
            }
        }
    }

    async readNamespace(namespace) {
        return readJson(this.namespacePath(namespace)).catch(error => {
            if (error.code === 'ENOENT') {
                throw notFound(`Namespace not found: ${namespace}`);
            }
            throw error;
        });
    }

    async readOrCreateNamespace(namespace) {
        return this.readNamespace(namespace).catch(error => {
            if (error.status === 404) {
                return this.createNamespace(namespace);
            }
            throw error;
        });
    }

    async createNamespace(namespace) {
        return {
            namespace,
            serverId: randomUUID(),
            authToken: randomToken(),
            devices: [],
            pairingTokens: [],
            rollbackPoints: [],
            sessions: [],
            syncHistory: [],
            createdAt: new Date().toISOString(),
        };
    }

    async writeNamespace(namespace, record) {
        record.sessions = pruneExpiredSessions(record.sessions || []);
        record.pairingTokens = prunePairingTokens(record.pairingTokens || []);
        await mkdir(path.join(this.namespaceDir(namespace), 'files'), { recursive: true });
        await writeJsonAtomic(this.namespacePath(namespace), record);
        await writeJsonAtomic(this.manifestPath(namespace), await this.readManifest(namespace).catch(() => []));
    }

    async commitPushPlan(plan, decisions) {
        assertConflictDecisions(plan, decisions);
        const manifest = new Map((await this.readManifest(plan.namespace)).map(entry => [entry.path, entry]));
        for (const entry of plan.uploads) {
            if (entry.conflict && decisions[entry.path] !== 'local') {
                continue;
            }
            await this.commitUpload(plan, entry, manifest);
        }
        for (const syncPath of plan.remoteDeletes) {
            await this.deleteRemote(plan.namespace, syncPath, manifest);
        }
        for (const conflictItem of plan.conflicts) {
            await this.applyConflictDelete(plan.namespace, conflictItem, decisions, manifest);
        }
        await this.writeManifest(plan.namespace, Array.from(manifest.values()).sort(compareEntries));
    }

    async commitUpload(plan, entry, manifest) {
        const stagedPath = this.stagedFilePath(plan.id, entry.path);
        await stat(stagedPath).catch(() => {
            throw forbidden(`Missing staged upload for ${entry.path}`);
        });
        await mkdir(path.dirname(this.remoteFilePath(plan.namespace, entry.path)), { recursive: true });
        await rename(stagedPath, this.remoteFilePath(plan.namespace, entry.path));
        await utimes(this.remoteFilePath(plan.namespace, entry.path), new Date(), new Date(entry.modifiedMs));
        manifest.set(entry.path, withoutConflictFlag(entry));
    }

    async deleteRemote(namespace, syncPath, manifest) {
        await rm(this.remoteFilePath(namespace, syncPath), { force: true });
        manifest.delete(syncPath);
    }

    async applyConflictDelete(namespace, conflictItem, decisions, manifest) {
        if (decisions[conflictItem.path] !== 'local' || conflictItem.local) {
            return;
        }
        await this.deleteRemote(namespace, conflictItem.path, manifest);
    }

    async createRollbackPoint(plan) {
        const snapshot = await this.buildRollbackSnapshot(plan);
        await writeJsonAtomic(this.rollbackPointPath(plan.namespace, snapshot.id), snapshot);
        return rollbackPointSummary(snapshot);
    }

    async buildRollbackSnapshot(plan) {
        const manifest = new Map((await this.readManifest(plan.namespace)).map(entry => [entry.path, entry]));
        const files = [];
        for (const syncPath of affectedPaths(plan)) {
            files.push(await this.rollbackFileSnapshot(plan.namespace, syncPath, manifest.get(syncPath)));
        }
        return {
            id: randomToken(10),
            createdAt: new Date().toISOString(),
            files,
            planId: plan.id,
        };
    }

    async rollbackFileSnapshot(namespace, syncPath, entry) {
        if (!entry) {
            return { entry: null, path: syncPath };
        }
        const content = await this.readRemoteFile(namespace, entry);
        return { contentBase64: content.toString('base64'), entry, path: syncPath };
    }

    async restoreRollbackFiles(namespace, point, manifest) {
        for (const file of point.files) {
            if (!file.entry) {
                await this.deleteRemote(namespace, file.path, manifest);
                continue;
            }
            await writeFileAtomic(this.remoteFilePath(namespace, file.path), Buffer.from(file.contentBase64, 'base64'));
            await utimes(this.remoteFilePath(namespace, file.path), new Date(), new Date(file.entry.modifiedMs));
            manifest.set(file.path, file.entry);
        }
    }

    async recordCommittedPlan(plan, rollbackPoint) {
        const record = await this.readNamespace(plan.namespace);
        const committedAt = plan.committedAt;
        touchDevice(record, plan.deviceId, { lastSyncAt: committedAt });
        record.syncHistory = cappedList([historyEntry(plan), ...(record.syncHistory || [])], MAX_HISTORY_ITEMS);
        if (rollbackPoint) {
            record.rollbackPoints = cappedList([rollbackPoint, ...(record.rollbackPoints || [])], MAX_ROLLBACK_POINTS);
        }
        await this.writeNamespace(plan.namespace, record);
    }
}

function assertConflictDecisions(plan, decisions) {
    for (const item of plan.conflicts) {
        if (decisions[item.path] !== 'local' && decisions[item.path] !== 'remote') {
            throw forbidden(`Missing conflict decision for ${item.path}`);
        }
    }
}

function addDevice(record, deviceName) {
    const device = {
        deviceId: randomUUID(),
        deviceName: String(deviceName || '').trim(),
        pairedAt: new Date().toISOString(),
    };
    record.devices.push(device);
    return device;
}

function upsertDevice(record, input) {
    const existing = record.devices.find(device => device.deviceId === input.deviceId);
    if (existing) {
        Object.assign(existing, {
            deviceName: input.deviceName,
            publicKey: input.publicKey,
            pairedAt: existing.pairedAt || new Date().toISOString(),
        });
        return existing;
    }
    const device = { ...input, pairedAt: new Date().toISOString() };
    record.devices.push(device);
    return device;
}

function touchDevice(record, deviceId, patch) {
    if (!deviceId) {
        return;
    }
    const existing = record.devices.find(device => device.deviceId === deviceId);
    if (existing) {
        Object.assign(existing, patch);
        return;
    }
    record.devices.push({ deviceId, deviceName: '', pairedAt: new Date().toISOString(), ...patch });
}

function affectedPaths(plan) {
    return Array.from(new Set([
        ...plan.uploads.map(entry => entry.path),
        ...plan.remoteDeletes,
        ...plan.conflicts.map(item => item.path),
    ]));
}

function rollbackPointSummary(snapshot) {
    return {
        affectedFiles: snapshot.files.length,
        createdAt: snapshot.createdAt,
        id: snapshot.id,
        planId: snapshot.planId,
    };
}

function historyEntry(plan) {
    return {
        committedAt: plan.committedAt,
        conflicts: plan.conflicts.length,
        deviceId: plan.deviceId,
        downloads: plan.downloads.length,
        kind: plan.kind,
        planId: plan.id,
        remoteDeletes: plan.remoteDeletes.length,
        uploads: plan.uploads.length,
    };
}

function cappedList(items, limit) {
    return items.slice(0, limit);
}

function pairingResponse(record, device, endpoint) {
    return {
        authToken: record.authToken,
        deviceId: device.deviceId,
        endpoint: String(endpoint || ''),
        namespace: record.namespace,
        serverId: record.serverId,
    };
}

function withoutConflictFlag(entry) {
    const { conflict: _conflict, ...rest } = entry;
    return rest;
}
