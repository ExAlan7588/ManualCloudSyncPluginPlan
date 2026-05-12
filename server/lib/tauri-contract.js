import { badRequest } from './http-error.js';
import { safeName } from './encoding.js';

const DEFAULT_NAMESPACE = 'default';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

export function isTauriPairingRequest(body, url) {
    return url.searchParams.has('token') || typeof body.device_id === 'string' || typeof body.device_pubkey === 'string';
}

export function normalizeTauriPairingBody(body, url) {
    return {
        deviceId: uuidField(body.device_id, 'device_id'),
        deviceName: textField(body.device_name, 'device_name'),
        endpoint: '',
        namespace: safeName(process.env.TT_SYNC_NAMESPACE || DEFAULT_NAMESPACE, 'namespace'),
        publicKey: base64urlField(body.device_pubkey, 'device_pubkey'),
        token: textField(url.searchParams.get('token'), 'token'),
    };
}

export function tauriPairingResponse(record) {
    return {
        granted_permissions: {
            mirror_delete: true,
            read: true,
            write: true,
        },
        server_device_id: record.serverId,
        server_device_name: 'Minimal TT-Sync',
    };
}

function uuidField(value, label) {
    const text = textField(value, label);
    if (!UUID_PATTERN.test(text)) {
        throw badRequest(`${label} must be a UUID`);
    }
    return text.toLowerCase();
}

function base64urlField(value, label) {
    const text = textField(value, label);
    if (!BASE64URL_PATTERN.test(text)) {
        throw badRequest(`${label} must be base64url`);
    }
    return text;
}

function textField(value, label) {
    const text = String(value || '').trim();
    if (!text) {
        throw badRequest(`${label} is required`);
    }
    return text;
}
