import { safeName } from './encoding.js';
import { badRequest, HttpError } from './http-error.js';

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const SPKI_SHA256_BYTES = 32;

export function normalizePairingBody(body) {
    if (body.pairingUri) {
        return pairingBodyFromUri(body);
    }
    return {
        deviceName: pairingDeviceName(body),
        endpoint: directPairingEndpoint(body),
        namespace: safeName(body.namespace || 'default', 'namespace'),
        token: body.token,
    };
}

export function pairingEndpoint(body) {
    const value = String(body.endpoint || process.env.TT_SYNC_PUBLIC_URL || '').trim();
    if (!value) {
        throw badRequest('endpoint is required for account pairing URI');
    }
    return normalizedHttpUrl(value, 'endpoint');
}

export function pairingSpki(body) {
    const value = String(body.spki || '').trim();
    if (!value) {
        throw badRequest('spki is required for account pairing URI');
    }
    if (!BASE64URL_PATTERN.test(value)) {
        throw badRequest('spki must be base64url');
    }
    if (Buffer.from(value, 'base64url').length !== SPKI_SHA256_BYTES) {
        throw badRequest('spki must be a base64url SHA-256 pin');
    }
    return value;
}

export function requestDeviceId(value) {
    if (value === undefined || value === null || value === '') {
        return '';
    }
    if (typeof value !== 'string') {
        throw badRequest('deviceId must be a string');
    }
    return value.trim();
}

export function pairedDevice(record, deviceId) {
    const devices = namespaceDevices(record);
    const device = devices.find(item => item.deviceId === deviceId);
    if (!device?.publicKey) {
        throw badRequest(`Paired Tauri device not found: ${deviceId}`);
    }
    return device;
}

function directPairingEndpoint(body) {
    const value = String(body.endpoint || '').trim();
    return value ? normalizedHttpUrl(value, 'endpoint') : '';
}

function pairingBodyFromUri(body) {
    const uri = parsePairingUri(body.pairingUri);
    if (uri.protocol !== 'tt-sync:') {
        throw badRequest('Pairing URI must use tt-sync://');
    }
    return {
        deviceName: pairingDeviceName(body),
        endpoint: pairingUriEndpoint(uri),
        namespace: safeName(uri.searchParams.get('namespace') || 'default', 'namespace'),
        token: uri.searchParams.get('token') || '',
    };
}

function pairingUriEndpoint(uri) {
    const value = uri.searchParams.get('endpoint') || '';
    return value ? normalizedHttpUrl(value, 'endpoint') : '';
}

function normalizedHttpUrl(value, label) {
    return parseHttpUrl(value, label).toString().replace(/\/$/, '');
}

function parseHttpUrl(value, label) {
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:' && url.protocol !== 'http:') {
            throw badRequest(`${label} must use http or https`);
        }
        if (url.username || url.password || url.hash) {
            throw badRequest(`${label} must not include credentials or fragments`);
        }
        return url;
    } catch (error) {
        if (error instanceof HttpError) {
            throw error;
        }
        throw badRequest(`${label} must be a valid URL`);
    }
}

function pairingDeviceName(body) {
    const value = body.deviceName;
    if (value === undefined || value === null || value === '') {
        return '';
    }
    if (typeof value !== 'string') {
        throw badRequest('deviceName must be a string');
    }
    return value.trim();
}

function parsePairingUri(value) {
    try {
        return new URL(String(value || ''));
    } catch {
        throw badRequest('Pairing URI must be a valid tt-sync:// URI');
    }
}

function namespaceDevices(record) {
    if (!Array.isArray(record.devices)) {
        throw new Error('Invalid namespace devices');
    }
    return record.devices;
}
