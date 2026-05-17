import { createHash } from 'node:crypto';
import { badRequest } from './http-error.js';
import { validateSyncPath } from './encoding.js';

export function normalizeManifest(input) {
    if (!Array.isArray(input)) {
        throw badRequest('Manifest must be an array');
    }

    const entries = input.map(normalizeEntry).sort(compareEntries);
    assertUniquePaths(entries);
    return entries;
}

export function normalizeEntry(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw badRequest('Manifest entry must be an object');
    }
    const path = validateSyncPath(input?.path);
    const sizeBytes = nonNegativeInteger(input?.sizeBytes, `Invalid sizeBytes for ${path}`);
    const modifiedMs = nonNegativeInteger(input?.modifiedMs, `Invalid modifiedMs for ${path}`);

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
    const text = String(value || '').trim();
    if (!text) {
        return '';
    }
    if (!/^[a-f0-9]{64}$/.test(text)) {
        throw badRequest('sha256 must be a 64-character lowercase hex digest');
    }
    return text;
}

function nonNegativeInteger(value, message) {
    if (!isNumericInput(value)) {
        throw badRequest(message);
    }
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < 0) {
        throw badRequest(message);
    }
    return number;
}

function isNumericInput(value) {
    return typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value.trim()));
}

function assertUniquePaths(entries) {
    const seen = new Set();
    for (const entry of entries) {
        if (seen.has(entry.path)) {
            throw badRequest(`Duplicate manifest path: ${entry.path}`);
        }
        seen.add(entry.path);
    }
}
