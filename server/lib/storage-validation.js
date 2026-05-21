import { validateSyncPath } from './encoding.js';
import { badRequest, forbidden } from './http-error.js';
import { normalizeEntry } from './manifest.js';
import { historyEntry } from './storage-records.js';

export function assertConflictDecisions(plan, decisions) {
    for (const item of plan.conflicts) {
        if (decisions[item.path] !== 'local' && decisions[item.path] !== 'remote') {
            throw forbidden(`Missing conflict decision for ${item.path}`);
        }
    }
}

export function conflictDecisions(body) {
    const value = body?.conflictDecisions;
    if (value === undefined || value === null) {
        return {};
    }
    if (Array.isArray(value) || typeof value !== 'object') {
        throw badRequest('Invalid conflict decisions');
    }
    return value;
}

export function assertPushUploadMetadata(plan) {
    if (plan.kind !== 'push') {
        return;
    }
    for (const entry of plan.uploads) {
        assertCommitInteger(entry, 'modifiedMs');
        assertCommitInteger(entry, 'sizeBytes');
    }
}

export function sessionDeviceId(value) {
    if (value === undefined || value === null || value === '') {
        return '';
    }
    if (typeof value !== 'string') {
        throw badRequest('deviceId must be a string');
    }
    return value.trim();
}

export function assertPlanOpen(plan) {
    if (plan.committedAt) {
        throw forbidden(`Plan already committed: ${plan.id}`);
    }
}

export function assertPlanHistoryShape(plan) {
    assertPlanKind(plan);
    historyEntry(plan);
}

export function assertPlanStaged(plan) {
    if (plan.staged === undefined || plan.staged === null) {
        return;
    }
    if (Array.isArray(plan.staged) || typeof plan.staged !== 'object') {
        throw forbidden('Invalid plan staged');
    }
}

export function assertNamespaceCommitRecord(record, rollbackPoint) {
    recordArray(record.devices, 'namespace devices');
    optionalRecordArray(record.syncHistory, 'namespace syncHistory');
    if (rollbackPoint) {
        optionalRecordArray(record.rollbackPoints, 'namespace rollbackPoints');
    }
}

export function optionalRecordArray(value, label) {
    if (value === undefined || value === null) {
        return [];
    }
    return recordArray(value, label);
}

export function normalizeRollbackFile(file) {
    const syncPath = validateSyncPath(file?.path);
    if (!file.entry) {
        return { entry: null, path: syncPath };
    }
    const entry = normalizeEntry(file.entry);
    if (entry.path !== syncPath) {
        throw badRequest('Rollback file entry path must match rollback file path');
    }
    return {
        contentBase64: file.contentBase64,
        entry,
        path: syncPath,
    };
}

function assertCommitInteger(entry, field) {
    const value = entry?.[field];
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
        throw badRequest(`Invalid ${field} for ${entry?.path}`);
    }
}

function assertPlanKind(plan) {
    if (plan.kind !== 'push' && plan.kind !== 'pull') {
        throw new Error('Invalid plan kind');
    }
}

function recordArray(value, label) {
    if (!Array.isArray(value)) {
        throw new Error(`Invalid ${label}`);
    }
    return value;
}
