import { createHash, createPublicKey, verify } from 'node:crypto';
import { badRequest, unauthorized } from './http-error.js';
import { safeName } from './encoding.js';

const DEFAULT_NAMESPACE = 'default';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const SESSION_TIMESTAMP_WINDOW_MS = 5 * 60 * 1000;
const TAURI_SESSION_HEADERS = Object.freeze([
    'tt-device-id',
    'tt-timestamp-ms',
    'tt-nonce',
    'tt-signature',
]);

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

export function tauriNamespace() {
    return safeName(process.env.TT_SYNC_NAMESPACE || DEFAULT_NAMESPACE, 'namespace');
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

export function isTauriSessionRequest(request) {
    return TAURI_SESSION_HEADERS.every(header => typeof request.headers[header] === 'string');
}

export function normalizeTauriSessionBody(body) {
    return {
        deviceId: uuidField(body.device_id, 'device_id'),
    };
}

export function verifyTauriSessionRequest(options) {
    const headers = sessionHeaders(options.request);
    if (headers.deviceId !== options.body.deviceId) {
        throw unauthorized('Session device id does not match signed header');
    }
    assertFreshTimestamp(headers.timestampMs);
    const canonical = canonicalSessionRequest({
        bodyBuffer: options.bodyBuffer,
        deviceId: headers.deviceId,
        nonce: headers.nonce,
        timestampMs: headers.timestampMs,
    });
    const key = publicKeyFromRaw(options.device.publicKey);
    const signature = Buffer.from(headers.signature, 'base64url');
    if (!verify(null, Buffer.from(canonical), key, signature)) {
        throw unauthorized('Invalid TT-Sync session signature');
    }
}

export function tauriSessionResponse(opened) {
    return {
        expires_at_ms: Date.parse(opened.session.expiresAt),
        granted_permissions: {
            mirror_delete: true,
            read: true,
            write: true,
        },
        session_token: opened.session.accessToken,
    };
}

export function isTauriPlanRequest(body, kind) {
    return kind === 'push'
        ? Boolean(body?.source_manifest)
        : Boolean(body?.target_manifest);
}

export function normalizeTauriPlanInput(options) {
    return {
        deviceId: uuidField(options.deviceId, 'deviceId'),
        localManifest: tauriManifestEntries(options.body[options.manifestKey]),
        mode: syncMode(options.body.mode),
        namespace: tauriNamespace(),
    };
}

export function tauriPlanResponse(plan) {
    const transfer = plan.kind === 'push' ? plan.uploads : plan.downloads;
    const deletePaths = plan.mode === 'Mirror'
        ? (plan.kind === 'push' ? plan.remoteDeletes : plan.localDeletes)
        : [];
    return {
        bytes_total: sumBytes(transfer),
        delete: deletePaths,
        files_total: transfer.length,
        plan_id: plan.id,
        transfer: transfer.map(tauriManifestEntry),
    };
}

function uuidField(value, label) {
    const text = textField(value, label);
    if (!UUID_PATTERN.test(text)) {
        throw badRequest(`${label} must be a UUID`);
    }
    return text.toLowerCase();
}

function sessionHeaders(request) {
    return {
        deviceId: uuidField(request.headers['tt-device-id'], 'TT-Device-Id'),
        nonce: textField(request.headers['tt-nonce'], 'TT-Nonce'),
        signature: base64urlField(request.headers['tt-signature'], 'TT-Signature'),
        timestampMs: integerTextField(request.headers['tt-timestamp-ms'], 'TT-Timestamp-Ms'),
    };
}

function canonicalSessionRequest(options) {
    const bodyHash = createHash('sha256').update(options.bodyBuffer).digest('base64url');
    return [
        'TT-SYNC-V2',
        options.deviceId,
        options.timestampMs,
        options.nonce,
        'POST',
        '/v2/session/open',
        bodyHash,
    ].join('\n');
}

function assertFreshTimestamp(timestampMs) {
    const timestamp = Number(timestampMs);
    const deltaMs = Math.abs(Date.now() - timestamp);
    if (!Number.isSafeInteger(timestamp) || deltaMs > SESSION_TIMESTAMP_WINDOW_MS) {
        throw unauthorized('TT-Sync session timestamp is outside the allowed window');
    }
}

function publicKeyFromRaw(publicKey) {
    const raw = Buffer.from(base64urlField(publicKey, 'device public key'), 'base64url');
    if (raw.length !== 32) {
        throw unauthorized('TT-Sync device public key must be 32 bytes');
    }
    return createPublicKey({
        format: 'der',
        key: Buffer.concat([ED25519_SPKI_PREFIX, raw]),
        type: 'spki',
    });
}

function tauriManifestEntries(manifest) {
    if (!Array.isArray(manifest?.entries)) {
        throw badRequest('Tauri manifest entries must be an array');
    }
    return manifest.entries.map(entry => ({
        modifiedMs: nonNegativeInteger(entry?.modified_ms, 'modified_ms'),
        path: entry?.path,
        sizeBytes: nonNegativeInteger(entry?.size_bytes, 'size_bytes'),
    }));
}

function tauriManifestEntry(entry) {
    return {
        modified_ms: entry.modifiedMs,
        path: entry.path,
        size_bytes: entry.sizeBytes,
    };
}

function syncMode(value) {
    const text = String(value || 'Incremental').trim();
    if (text !== 'Incremental' && text !== 'Mirror') {
        throw badRequest('mode must be Incremental or Mirror');
    }
    return text;
}

function sumBytes(entries) {
    return entries.reduce((total, entry) => total + Number(entry.sizeBytes || 0), 0);
}

function nonNegativeInteger(value, label) {
    if (!isNumericInput(value)) {
        throw badRequest(`${label} must be a non-negative integer`);
    }
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < 0) {
        throw badRequest(`${label} must be a non-negative integer`);
    }
    return number;
}

function isNumericInput(value) {
    return typeof value === 'number' || (typeof value === 'string' && value.trim().length > 0);
}

function integerTextField(value, label) {
    const text = textField(value, label);
    if (!/^[0-9]+$/.test(text)) {
        throw badRequest(`${label} must be an integer`);
    }
    return text;
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
