import { mkdir, readFile, rename, rm, stat, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { encodePath, safeName } from './encoding.js';
import { forbidden, notFound, serverError, unauthorized } from './http-error.js';
import { compareEntries, normalizeManifest, sha256 } from './manifest.js';

const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_HISTORY_ITEMS = 100;
const MAX_ROLLBACK_POINTS = 20;

export class TtSyncStorage {
    constructor(options) {
        this.rootDir = path.resolve(options.rootDir);
    }

    async status() {
        await mkdir(this.rootDir, { recursive: true });
        return { ok: true, service: 'minimal-tt-sync', version: '1.0.0' };
    }

    async completePairing(options) {
        assertPairingToken(options.token, process.env.TT_SYNC_PAIRING_TOKEN);
        const namespace = safeName(options.namespace || 'default', 'namespace');
        const record = await this.readNamespace(namespace).catch(error => {
            if (error.status === 404) {
                return this.createNamespace(namespace);
            }
            throw error;
        });
        const device = addDevice(record, options.deviceName);
        await this.writeNamespace(namespace, record);
        return pairingResponse(record, device, options.endpoint);
    }

    async completeTauriPairing(options) {
        assertPairingToken(options.token, process.env.TT_SYNC_PAIRING_TOKEN);
        const namespace = safeName(options.namespace || 'default', 'namespace');
        const record = await this.readOrCreateNamespace(namespace);
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
        await this.writeNamespace(namespace, record);
        return {
            namespace,
            deviceId: String(deviceId || '').trim(),
            openedAt: new Date().toISOString(),
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
        validateStagedBuffer(entry, buffer);
        const stagedPath = this.stagedFilePath(plan.id, entry.path);
        await writeFileAtomic(stagedPath, buffer);
        plan.staged[entry.path] = { sizeBytes: buffer.length, sha256: sha256(buffer) };
        await this.writePlan(plan);
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
            rollbackPoints: [],
            sessions: [],
            syncHistory: [],
            createdAt: new Date().toISOString(),
        };
    }

    async writeNamespace(namespace, record) {
        record.sessions = pruneExpiredSessions(record.sessions || []);
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

async function readJson(filePath, fallback) {
    try {
        return JSON.parse(await readFile(filePath, 'utf8'));
    } catch (error) {
        if (error.code === 'ENOENT' && fallback !== undefined) {
            return fallback;
        }
        throw error;
    }
}

async function writeJsonAtomic(filePath, value) {
    await writeFileAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeFileAtomic(filePath, value) {
    await mkdir(path.dirname(filePath), { recursive: true });
    const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmpPath, value);
    await rename(tmpPath, filePath);
}

function validateStagedBuffer(entry, buffer) {
    if (buffer.length !== Number(entry.sizeBytes)) {
        throw forbidden(`Uploaded size does not match manifest for ${entry.path}`);
    }
    if (entry.sha256 && sha256(buffer) !== entry.sha256) {
        throw forbidden(`Uploaded sha256 does not match manifest for ${entry.path}`);
    }
}

function assertPairingToken(actual, expected) {
    if (!expected) {
        throw serverError('TT_SYNC_PAIRING_TOKEN is required for pairing');
    }
    if (!constantTimeEqual(String(actual || ''), expected)) {
        throw unauthorized('Invalid pairing token');
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

function addSession(record) {
    const now = Date.now();
    const session = {
        accessToken: randomToken(),
        expiresAt: new Date(now + ACCESS_TOKEN_TTL_MS).toISOString(),
        refreshExpiresAt: new Date(now + REFRESH_TOKEN_TTL_MS).toISOString(),
        refreshToken: randomToken(),
    };
    record.sessions = [session, ...pruneExpiredSessions(record.sessions || [])];
    return session;
}

function activeAccessToken(record, token) {
    const now = Date.now();
    return (record.sessions || []).some(session => {
        return Date.parse(session.expiresAt) > now && constantTimeEqual(token, session.accessToken);
    });
}

function activeRefreshSession(record, refreshToken) {
    const now = Date.now();
    return (record.sessions || []).find(session => {
        return Date.parse(session.refreshExpiresAt) > now && constantTimeEqual(String(refreshToken || ''), session.refreshToken);
    });
}

function pruneExpiredSessions(sessions) {
    const now = Date.now();
    return sessions.filter(session => Date.parse(session.expiresAt) > now || Date.parse(session.refreshExpiresAt) > now);
}

function sessionResponse(record, session) {
    return {
        accessToken: session.accessToken,
        expiresAt: session.expiresAt,
        namespace: record.namespace,
        refreshExpiresAt: session.refreshExpiresAt,
        refreshToken: session.refreshToken,
        serverId: record.serverId,
    };
}

function assertAccountLogin(options) {
    if (!process.env.TT_SYNC_ACCOUNT_USERNAME || !process.env.TT_SYNC_ACCOUNT_PASSWORD) {
        throw serverError('TT_SYNC_ACCOUNT_USERNAME and TT_SYNC_ACCOUNT_PASSWORD are required for account login');
    }
    if (options.username !== process.env.TT_SYNC_ACCOUNT_USERNAME) {
        throw unauthorized('Invalid account credentials');
    }
    if (options.password !== process.env.TT_SYNC_ACCOUNT_PASSWORD) {
        throw unauthorized('Invalid account credentials');
    }
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

function randomToken(size = 32) {
    return randomBytes(size).toString('base64url');
}

function constantTimeEqual(left, right) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function withoutConflictFlag(entry) {
    const { conflict: _conflict, ...rest } = entry;
    return rest;
}
