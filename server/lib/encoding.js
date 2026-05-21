import { badRequest } from './http-error.js';

const EXCLUDED_PREFIXES = [
    'default-user/user/incremental-cloud-sync/',
    'default-user/user/lan-sync/',
    'default-user/user/manual-cloud-sync/',
];
const EXCLUDED_FILES = new Set([
    '_tauritavern/.ios-policy.json',
]);
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });

export function encodePath(value) {
    return Buffer.from(validateSyncPath(value), 'utf8').toString('base64url');
}

export function decodePath(value) {
    try {
        const encoded = String(value || '');
        if (!BASE64URL_PATTERN.test(encoded)) {
            throw badRequest('Invalid encoded sync path');
        }
        return validateSyncPath(UTF8_DECODER.decode(Buffer.from(encoded, 'base64url')));
    } catch (error) {
        if (error?.status) {
            throw error;
        }
        throw badRequest('Invalid encoded sync path');
    }
}

export function validateSyncPath(value) {
    const path = syncPathText(value);
    assertPortableSyncPath(path);
    assertAllowedSyncPath(path);
    return path;
}

function syncPathText(value) {
    if (value === undefined || value === null || value === '') {
        throw badRequest('Sync path is required');
    }
    if (typeof value !== 'string') {
        throw badRequest('Sync path must be a string');
    }
    const path = value.trim();
    if (!path) {
        throw badRequest('Sync path is required');
    }
    return path;
}

function assertPortableSyncPath(path) {
    if (path.startsWith('/') || path.includes('\\') || path.includes('\0')) {
        throw badRequest(`Invalid sync path: ${path}`);
    }
    if (path.split('/').some(segment => segment === '..' || segment === '')) {
        throw badRequest(`Invalid sync path: ${path}`);
    }
}

function assertAllowedSyncPath(path) {
    if (isExcludedSyncPath(path)) {
        throw badRequest(`Sync path is excluded from TT-Sync: ${path}`);
    }
}

export function safeName(value, label) {
    const text = String(value || '').trim();
    if (!/^[A-Za-z0-9._-]{1,128}$/.test(text)) {
        throw badRequest(`${label} must use A-Z, a-z, 0-9, dot, underscore, or dash`);
    }
    return text;
}

export function isExcludedSyncPath(path) {
    return EXCLUDED_FILES.has(path) || EXCLUDED_PREFIXES.some(prefix => path.startsWith(prefix));
}
