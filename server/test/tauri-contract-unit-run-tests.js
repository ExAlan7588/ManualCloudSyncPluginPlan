import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import {
    normalizeTauriPlanInput,
    tauriPairingResponse,
    tauriPlanResponse,
    tauriSessionResponse,
    verifyTauriSessionRequest,
} from '../lib/tauri-contract.js';

const DEVICE_ID = '550e8400-e29b-41d4-a716-446655440000';
const SESSION_WINDOW_MS = 5 * 60 * 1000;
const OUTSIDE_WINDOW_MARGIN_MS = 60 * 1000;

await testCurrentSignedSessionRequestPasses();
await testStaleSignedSessionRequestFails();
await testFutureSignedSessionRequestFails();
await testTauriPairingResponseRejectsMalformedServerIds();
await testTauriSessionResponseRejectsMalformedFields();
await testTauriManifestRejectsMalformedPaths();
await testTauriManifestRejectsNullNumericFields();
await testTauriManifestRejectsNonDecimalNumericStrings();
await testTauriPlanInputRejectsMalformedMode();
await testTauriPlanResponseRejectsMalformedSizeBytes();
await testTauriPlanResponseRejectsMalformedArrays();
await testTauriPlanResponseRejectsMalformedPaths();
await testTauriPlanResponseRejectsMalformedDiscriminants();
await testTauriPlanResponseRejectsMalformedPlanIds();
console.log('ok - Tauri session timestamp freshness is enforced');

async function testCurrentSignedSessionRequestPasses() {
    const fixture = signedSessionFixture(Date.now());
    verifyTauriSessionRequest(fixture);
}

async function testStaleSignedSessionRequestFails() {
    const fixture = signedSessionFixture(Date.now() - SESSION_WINDOW_MS - OUTSIDE_WINDOW_MARGIN_MS);
    assert.throws(
        () => verifyTauriSessionRequest(fixture),
        /timestamp is outside the allowed window/,
    );
}

async function testFutureSignedSessionRequestFails() {
    const fixture = signedSessionFixture(Date.now() + SESSION_WINDOW_MS + OUTSIDE_WINDOW_MARGIN_MS);
    assert.throws(
        () => verifyTauriSessionRequest(fixture),
        /timestamp is outside the allowed window/,
    );
}

async function testTauriPairingResponseRejectsMalformedServerIds() {
    assert.throws(
        () => tauriPairingResponse({ serverId: { value: DEVICE_ID } }),
        /server_device_id must be a UUID/,
    );
    assert.throws(
        () => tauriPairingResponse({ serverId: 'not-a-uuid' }),
        /server_device_id must be a UUID/,
    );
}

async function testTauriSessionResponseRejectsMalformedFields() {
    assert.throws(
        () => tauriSessionResponse({ session: { accessToken: { value: 'token' }, expiresAt: '2026-05-17T00:00:00.000Z' } }),
        /Invalid Tauri session token/,
    );
    assert.throws(
        () => tauriSessionResponse({ session: { accessToken: 'token', expiresAt: 'not-a-date' } }),
        /Invalid Tauri session expiration/,
    );
}

async function testTauriManifestRejectsMalformedPaths() {
    assert.throws(
        () => normalizeTauriPlanInput(tauriPlanInput({ path: { value: 'default-user/chats/example.jsonl' } })),
        /Tauri manifest path must be a string/,
    );
    assert.throws(
        () => normalizeTauriPlanInput(tauriPlanInput({ path: '../secret.txt' })),
        /Invalid sync path/,
    );
}

async function testTauriManifestRejectsNullNumericFields() {
    assert.throws(
        () => normalizeTauriPlanInput(tauriPlanInput({ size_bytes: null })),
        /size_bytes must be a non-negative integer/,
    );
    assert.throws(
        () => normalizeTauriPlanInput(tauriPlanInput({ modified_ms: null })),
        /modified_ms must be a non-negative integer/,
    );
}

async function testTauriManifestRejectsNonDecimalNumericStrings() {
    assert.throws(
        () => normalizeTauriPlanInput(tauriPlanInput({ size_bytes: '0x10' })),
        /size_bytes must be a non-negative integer/,
    );
    assert.throws(
        () => normalizeTauriPlanInput(tauriPlanInput({ modified_ms: '0x10' })),
        /modified_ms must be a non-negative integer/,
    );
}

async function testTauriPlanInputRejectsMalformedMode() {
    assert.throws(
        () => normalizeTauriPlanInput(tauriPlanInput({}, { mode: 0 })),
        /mode must be Incremental or Mirror/,
    );
}

async function testTauriPlanResponseRejectsMalformedSizeBytes() {
    assert.throws(
        () => tauriPlanResponse({
            downloads: [],
            id: 'plan-1',
            kind: 'push',
            localDeletes: [],
            mode: 'Incremental',
            remoteDeletes: [],
            uploads: [{ modifiedMs: 1, path: 'default-user/chats/example.jsonl', sizeBytes: '0x10' }],
        }),
        /Invalid Tauri plan sizeBytes/,
    );
}

async function testTauriPlanResponseRejectsMalformedArrays() {
    assert.throws(
        () => tauriPlanResponse({
            downloads: [],
            id: 'plan-1',
            kind: 'push',
            localDeletes: [],
            mode: 'Incremental',
            remoteDeletes: [],
            uploads: {},
        }),
        /Invalid Tauri plan uploads/,
    );
    assert.throws(
        () => tauriPlanResponse({
            downloads: null,
            id: 'plan-1',
            kind: 'pull',
            localDeletes: [],
            mode: 'Incremental',
            remoteDeletes: [],
            uploads: [],
        }),
        /Invalid Tauri plan downloads/,
    );
}

async function testTauriPlanResponseRejectsMalformedPaths() {
    assert.throws(
        () => tauriPlanResponse({
            downloads: [],
            id: 'plan-1',
            kind: 'push',
            localDeletes: [],
            mode: 'Incremental',
            remoteDeletes: [],
            uploads: [{ modifiedMs: 1, path: { value: 'default-user/chats/example.jsonl' }, sizeBytes: 1 }],
        }),
        /Invalid Tauri plan uploads path/,
    );
    assert.throws(
        () => tauriPlanResponse({
            downloads: [],
            id: 'plan-1',
            kind: 'push',
            localDeletes: [],
            mode: 'Mirror',
            remoteDeletes: [''],
            uploads: [],
        }),
        /Invalid Tauri plan remoteDeletes path/,
    );
}

async function testTauriPlanResponseRejectsMalformedDiscriminants() {
    assert.throws(
        () => tauriPlanResponse({
            downloads: [],
            id: 'plan-1',
            kind: 'mirror',
            localDeletes: [],
            mode: 'Incremental',
            remoteDeletes: [],
            uploads: [],
        }),
        /Invalid Tauri plan kind/,
    );
    assert.throws(
        () => tauriPlanResponse({
            downloads: [],
            id: 'plan-1',
            kind: 'push',
            localDeletes: [],
            mode: 'Full',
            remoteDeletes: [],
            uploads: [],
        }),
        /Invalid Tauri plan mode/,
    );
}

async function testTauriPlanResponseRejectsMalformedPlanIds() {
    assert.throws(
        () => tauriPlanResponse({
            downloads: [],
            id: { value: 'plan-1' },
            kind: 'push',
            localDeletes: [],
            mode: 'Incremental',
            remoteDeletes: [],
            uploads: [],
        }),
        /Invalid Tauri plan id/,
    );
    assert.throws(
        () => tauriPlanResponse({
            downloads: [],
            id: '',
            kind: 'push',
            localDeletes: [],
            mode: 'Incremental',
            remoteDeletes: [],
            uploads: [],
        }),
        /Invalid Tauri plan id/,
    );
}

function tauriPlanInput(entry, bodyPatch = {}) {
    return {
        body: {
            mode: 'Incremental',
            source_manifest: {
                entries: [{
                    modified_ms: 1,
                    path: 'default-user/chats/example.jsonl',
                    size_bytes: 1,
                    ...entry,
                }],
            },
            ...bodyPatch,
        },
        deviceId: DEVICE_ID,
        manifestKey: 'source_manifest',
    };
}

function signedSessionFixture(timestampMs) {
    const keys = tauriDeviceKeys();
    const bodyText = JSON.stringify({ device_id: DEVICE_ID });
    const nonce = `nonce-${timestampMs}`;
    const timestampText = String(timestampMs);
    const canonical = canonicalSessionRequest({ bodyText, nonce, timestampMs: timestampText });
    return {
        body: { deviceId: DEVICE_ID },
        bodyBuffer: Buffer.from(bodyText),
        device: { publicKey: keys.publicKey },
        request: {
            headers: {
                'tt-device-id': DEVICE_ID,
                'tt-nonce': nonce,
                'tt-signature': sign(null, Buffer.from(canonical), keys.privateKey).toString('base64url'),
                'tt-timestamp-ms': timestampText,
            },
        },
    };
}

function canonicalSessionRequest(options) {
    const bodyHash = createHash('sha256').update(options.bodyText).digest('base64url');
    return [
        'TT-SYNC-V2',
        DEVICE_ID,
        options.timestampMs,
        options.nonce,
        'POST',
        '/v2/session/open',
        bodyHash,
    ].join('\n');
}

function tauriDeviceKeys() {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const der = publicKey.export({ format: 'der', type: 'spki' });
    return {
        privateKey,
        publicKey: Buffer.from(der).subarray(-32).toString('base64url'),
    };
}
