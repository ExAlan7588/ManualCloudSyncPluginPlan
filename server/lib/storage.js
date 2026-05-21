import { mkdir, readFile, rename, rm, stat, utimes } from 'node:fs/promises';
import path from 'node:path';
import { decodeBase64Content } from './base64-content.js';
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
    randomToken,
    sessionResponse,
} from './account.js';
import { safeName } from './encoding.js';
import { badRequest, forbidden, notFound, unauthorized } from './http-error.js';
import { compareEntries, normalizeManifest, sha256 } from './manifest.js';
import { readJson, uploadEntry, validateStagedBuffer, writeFileAtomic, writeJsonAtomic } from './storage-io.js';
import { createPlanLockStore } from './storage-locks.js';
import { createNamespaceRecord, namespaceRecordForWrite } from './storage-namespace.js';
import { createStoragePaths } from './storage-paths.js';
import {
    addDevice,
    affectedPaths,
    cappedList,
    historyEntry,
    pairingResponse,
    rollbackPointSummary,
    touchDevice,
    upsertDevice,
    withoutConflictFlag,
} from './storage-records.js';
import {
    assertConflictDecisions,
    assertNamespaceCommitRecord,
    assertPlanHistoryShape,
    assertPlanOpen,
    assertPlanStaged,
    assertPushUploadMetadata,
    conflictDecisions,
    normalizeRollbackFile,
    optionalRecordArray,
    sessionDeviceId,
} from './storage-validation.js';
import { writeRequestStreamAtomic } from './stream-io.js';

const MAX_HISTORY_ITEMS = 100;
const MAX_ROLLBACK_POINTS = 20;

export class TtSyncStorage {
    constructor(options) {
        this.paths = createStoragePaths(options.rootDir);
        this.planLocks = createPlanLockStore();
        this.rootDir = this.paths.rootDir;
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
        const normalizedDeviceId = sessionDeviceId(deviceId);
        touchDevice(record, normalizedDeviceId, { lastSeenAt: new Date().toISOString() });
        const session = addSession(record, normalizedDeviceId);
        await this.writeNamespace(namespace, record);
        return {
            namespace,
            deviceId: normalizedDeviceId,
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
            assertPlanOpen(latest);
            assertPlanStaged(latest);
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

    async stageFileStream(options) {
        const latest = await this.readPlan(options.plan.id);
        assertPlanOpen(latest);
        assertPlanStaged(latest);
        const latestEntry = uploadEntry(latest, options.entry.path);
        const stagedPath = this.stagedFilePath(latest.id, latestEntry.path);
        const result = await writeRequestStreamAtomic({
            expectedBytes: latestEntry.sizeBytes,
            expectedSha256: latestEntry.sha256 || '',
            filePath: stagedPath,
            maxBytes: options.maxBytes,
            stream: options.stream,
            syncPath: latestEntry.path,
        });
        return this.withPlanLock(options.plan.id, async () => {
            const locked = await this.readPlan(options.plan.id);
            if (locked.committedAt) {
                await rm(stagedPath, { force: true });
                assertPlanOpen(locked);
            }
            assertPlanStaged(locked);
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
        return this.withPlanLock(plan.id, async () => {
            const latest = await this.readPlan(plan.id);
            if (latest.committedAt) {
                throw forbidden(`Plan already committed: ${latest.id}`);
            }
            assertPlanHistoryShape(latest);
            assertPushUploadMetadata(latest);
            await this.assertNamespaceCommitShape(latest);
            let rollbackPoint = null;
            if (latest.kind === 'push') {
                const decisions = conflictDecisions(body);
                rollbackPoint = await this.createRollbackPoint(latest);
                await this.commitPushPlan(latest, decisions);
            }
            const committed = { ...latest, committedAt: new Date().toISOString() };
            await this.writePlan(committed);
            await this.recordCommittedPlan(committed, rollbackPoint || null);
            return committed;
        });
    }

    async listDevices(namespace) {
        return optionalRecordArray((await this.readNamespace(namespace)).devices, 'namespace devices');
    }

    async listHistory(namespace) {
        return optionalRecordArray((await this.readNamespace(namespace)).syncHistory, 'namespace syncHistory');
    }

    async listRollbackPoints(namespace) {
        return optionalRecordArray((await this.readNamespace(namespace)).rollbackPoints, 'namespace rollbackPoints');
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
        return this.paths.namespaceDir(namespace);
    }

    planDir(planId) {
        return this.paths.planDir(planId);
    }

    manifestPath(namespace) {
        return this.paths.manifestPath(namespace);
    }

    namespacePath(namespace) {
        return this.paths.namespacePath(namespace);
    }

    planPath(planId) {
        return this.paths.planPath(planId);
    }

    stagedFilePath(planId, syncPath) {
        return this.paths.stagedFilePath(planId, syncPath);
    }

    remoteFilePath(namespace, syncPath) {
        return this.paths.remoteFilePath(namespace, syncPath);
    }

    rollbackPointPath(namespace, rollbackId) {
        return this.paths.rollbackPointPath(namespace, rollbackId);
    }

    async withPlanLock(planId, operation) {
        return this.planLocks.run(planId, operation);
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
        return createNamespaceRecord(namespace);
    }

    async writeNamespace(namespace, record) {
        const normalizedRecord = namespaceRecordForWrite(record);
        await mkdir(path.join(this.namespaceDir(namespace), 'files'), { recursive: true });
        await writeJsonAtomic(this.namespacePath(namespace), normalizedRecord);
        await writeJsonAtomic(this.manifestPath(namespace), await this.readManifest(namespace));
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
            await this.applyConflictDelete({
                conflictItem,
                decisions,
                manifest,
                namespace: plan.namespace,
            });
        }
        await this.writeManifest(plan.namespace, Array.from(manifest.values()).sort(compareEntries));
    }

    async commitUpload(plan, entry, manifest) {
        const stagedPath = this.stagedFilePath(plan.id, entry.path);
        await stat(stagedPath).catch(error => {
            if (error.code === 'ENOENT') {
                throw forbidden(`Missing staged upload for ${entry.path}`);
            }
            throw error;
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

    async applyConflictDelete(options) {
        if (options.decisions[options.conflictItem.path] !== 'local' || options.conflictItem.local) {
            return;
        }
        await this.deleteRemote(options.namespace, options.conflictItem.path, options.manifest);
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
        if (!Array.isArray(point.files)) {
            throw badRequest('Rollback point files must be an array');
        }
        for (const file of point.files) {
            const rollbackFile = normalizeRollbackFile(file);
            if (!rollbackFile.entry) {
                await this.deleteRemote(namespace, rollbackFile.path, manifest);
                continue;
            }
            const content = decodeBase64Content(rollbackFile.contentBase64, 'Rollback file contentBase64');
            await writeFileAtomic(this.remoteFilePath(namespace, rollbackFile.path), content);
            await utimes(this.remoteFilePath(namespace, rollbackFile.path), new Date(), new Date(rollbackFile.entry.modifiedMs));
            manifest.set(rollbackFile.path, rollbackFile.entry);
        }
    }

    async recordCommittedPlan(plan, rollbackPoint) {
        const record = await this.readNamespace(plan.namespace);
        assertNamespaceCommitRecord(record, rollbackPoint);
        const committedAt = plan.committedAt;
        touchDevice(record, plan.deviceId, { lastSyncAt: committedAt });
        record.syncHistory = cappedList([historyEntry(plan), ...optionalRecordArray(record.syncHistory, 'namespace syncHistory')], MAX_HISTORY_ITEMS);
        if (rollbackPoint) {
            const points = optionalRecordArray(record.rollbackPoints, 'namespace rollbackPoints');
            record.rollbackPoints = cappedList([rollbackPoint, ...points], MAX_ROLLBACK_POINTS);
        }
        await this.writeNamespace(plan.namespace, record);
    }

    async assertNamespaceCommitShape(plan) {
        const record = await this.readNamespace(plan.namespace);
        assertNamespaceCommitRecord(record, plan.kind === 'push');
    }
}
