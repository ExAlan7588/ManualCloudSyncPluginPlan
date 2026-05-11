import { createHash } from 'node:crypto';
import { badRequest } from './http-error.js';
import { validateSyncPath } from './encoding.js';

export function normalizeManifest(input) {
    if (!Array.isArray(input)) {
        throw badRequest('Manifest must be an array');
    }

    return input.map(normalizeEntry).sort(compareEntries);
}

export function normalizeEntry(input) {
    const path = validateSyncPath(input?.path);
    const sizeBytes = Number(input?.sizeBytes);
    const modifiedMs = Number(input?.modifiedMs);
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) {
        throw badRequest(`Invalid sizeBytes for ${path}`);
    }
    if (!Number.isFinite(modifiedMs) || modifiedMs < 0) {
        throw badRequest(`Invalid modifiedMs for ${path}`);
    }

    return {
        path,
        sizeBytes,
        modifiedMs,
        sha256: optionalSha256(input?.sha256),
    };
}

export function manifestMap(manifest) {
    return new Map(normalizeManifest(manifest).map(entry => [entry.path, entry]));
}

export function entriesEqual(left, right) {
    if (!left || !right) {
        return false;
    }
    if (left.path !== right.path || left.sizeBytes !== right.sizeBytes) {
        return false;
    }
    if (left.modifiedMs !== right.modifiedMs) {
        return false;
    }
    return !left.sha256 || !right.sha256 || left.sha256 === right.sha256;
}

export function sha256(buffer) {
    return createHash('sha256').update(buffer).digest('hex');
}

export function compareEntries(left, right) {
    return left.path.localeCompare(right.path);
}

function optionalSha256(value) {
    const text = String(value || '').trim().toLowerCase();
    if (!text) {
        return '';
    }
    if (!/^[a-f0-9]{64}$/.test(text)) {
        throw badRequest('sha256 must be a 64-character lowercase hex digest');
    }
    return text;
}
