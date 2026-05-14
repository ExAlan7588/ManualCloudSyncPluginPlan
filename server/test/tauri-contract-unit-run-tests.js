import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { verifyTauriSessionRequest } from '../lib/tauri-contract.js';

const DEVICE_ID = '550e8400-e29b-41d4-a716-446655440000';
const SESSION_WINDOW_MS = 5 * 60 * 1000;
const OUTSIDE_WINDOW_MARGIN_MS = 60 * 1000;

await testCurrentSignedSessionRequestPasses();
await testStaleSignedSessionRequestFails();
await testFutureSignedSessionRequestFails();
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
