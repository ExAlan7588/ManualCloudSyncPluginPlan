import { badRequest } from './http-error.js';

export function encodePath(value) {
    return Buffer.from(validateSyncPath(value), 'utf8').toString('base64url');
}

export function decodePath(value) {
    try {
        return validateSyncPath(Buffer.from(String(value || ''), 'base64url').toString('utf8'));
    } catch (error) {
        if (error?.status) {
            throw error;
        }
        throw badRequest('Invalid encoded sync path');
    }
}

export function validateSyncPath(value) {
    const path = String(value || '').trim();
    if (!path) {
        throw badRequest('Sync path is required');
    }
    if (path.startsWith('/') || path.includes('\\') || path.includes('\0')) {
        throw badRequest(`Invalid sync path: ${path}`);
    }
    if (path.split('/').some(segment => segment === '..' || segment === '')) {
        throw badRequest(`Invalid sync path: ${path}`);
    }
    return path;
}

export function safeName(value, label) {
    const text = String(value || '').trim();
    if (!/^[A-Za-z0-9._-]{1,128}$/.test(text)) {
        throw badRequest(`${label} must use A-Z, a-z, 0-9, dot, underscore, or dash`);
    }
    return text;
}
