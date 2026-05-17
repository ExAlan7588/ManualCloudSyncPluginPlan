import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { normalizeTauriPlanInput, tauriPlanResponse, verifyTauriSessionRequest } from '../lib/tauri-contract.js';

const DEVICE_ID = '550e8400-e29b-41d4-a716-446655440000';
const SESSION_WINDOW_MS = 5 * 60 * 1000;
const OUTSIDE_WINDOW_MARGIN_MS = 60 * 1000;

await testCurrentSignedSessionRequestPasses();
await testStaleSignedSessionRequestFails();
await testFutureSignedSessionRequestFails();
await testTauriManifestRejectsNullNumericFields();
await testTauriManifestRejectsNonDecimalNumericStrings();
await testTauriPlanResponseRejectsMalformedSizeBytes();
await testTauriPlanResponseRejectsMalformedArrays();
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

function tauriPlanInput(entry) {
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
