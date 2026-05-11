import { mkdir, readFile, rename, rm, stat, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { encodePath, safeName } from './encoding.js';
import { forbidden, notFound, serverError, unauthorized } from './http-error.js';
import { compareEntries, normalizeManifest, sha256 } from './manifest.js';

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

    async requireAuth(namespace, authHeader) {
        const record = await this.readNamespace(namespace);
        const token = String(authHeader || '').replace(/^Bearer\s+/i, '').trim();
        if (!token) {
            throw unauthorized('Missing bearer token');
        }
        if (!constantTimeEqual(token, record.authToken)) {
            throw forbidden('Invalid bearer token');
        }
        return record;
    }

    async openSession(namespace, deviceId) {
        const record = await this.readNamespace(namespace);
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
        if (plan.kind === 'push') {
            await this.commitPushPlan(plan, body.conflictDecisions || {});
        }
        plan.committedAt = new Date().toISOString();
        await this.writePlan(plan);
        return plan;
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

    async readNamespace(namespace) {
        return readJson(this.namespacePath(namespace)).catch(error => {
            if (error.code === 'ENOENT') {
                throw notFound(`Namespace not found: ${namespace}`);
            }
            throw error;
        });
    }

    async createNamespace(namespace) {
        return {
            namespace,
            serverId: `minimal-${namespace}`,
            authToken: randomToken(),
            devices: [],
            createdAt: new Date().toISOString(),
        };
    }

    async writeNamespace(namespace, record) {
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
        deviceId: randomToken(12),
        deviceName: String(deviceName || '').trim(),
        pairedAt: new Date().toISOString(),
    };
    record.devices.push(device);
    return device;
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
