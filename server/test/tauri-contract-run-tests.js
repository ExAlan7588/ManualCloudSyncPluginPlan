import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { encodePath } from '../lib/encoding.js';
import { sha256 } from '../lib/manifest.js';
import { startServer } from '../tt-sync-server.js';

const TEST_TOKEN = 'test-pairing-token';
const FILE_PATH = 'default-user/chats/example.jsonl';
const BASE_MTIME = 1778500000000;
const TAURI_DEVICE_ID = '550e8400-e29b-41d4-a716-446655440000';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const tests = [
    ['TauriTavern pair contract returns v2 response', testTauriPairContract],
    ['TauriTavern session and sync plan contract works', testTauriSessionSyncContract],
];

for (const [name, test] of tests) {
    try {
        await test();
        console.log(`ok - ${name}`);
    } catch (error) {
        console.error(`not ok - ${name}`);
        console.error(error);
        process.exitCode = 1;
        break;
    }
}

async function testTauriPairContract() {
    await withServer(async context => {
        const keys = tauriDeviceKeys();
        const paired = await pairTauriDevice(context, keys.publicKey, 'android-emulator');
        assert.match(paired.server_device_id, UUID_PATTERN);
        assert.equal(paired.server_device_name, 'Minimal TT-Sync');
        assert.deepEqual(paired.granted_permissions, {
            mirror_delete: true,
            read: true,
            write: true,
        });
    });
}

async function testTauriSessionSyncContract() {
    await withServer(async context => {
        const keys = tauriDeviceKeys();
        await pairTauriDevice(context, keys.publicKey, 'tauri-device');
        const session = await openTauriSession(context, keys.privateKey);
        assert.match(session.session_token, /^[A-Za-z0-9_-]+$/);
        assert.equal(session.granted_permissions.write, true);

        const entry = tauriEntryFor('hello', BASE_MTIME);
        const pushPlan = await tauriPushPlan(context, session.session_token, [entry]);
        assert.equal(pushPlan.files_total, 1);
        assert.deepEqual(pushPlan.transfer, [entry]);

        await putFile({
            content: 'hello',
            context,
            planId: pushPlan.plan_id,
            syncPath: entry.path,
            token: session.session_token,
        });
        const committed = await postJson({
            body: {},
            context,
            route: `/v2/plans/${pushPlan.plan_id}/commit`,
            token: session.session_token,
        });
        assert.equal(committed.ok, true);

        const pullPlan = await tauriPullPlan(context, session.session_token, []);
        assert.equal(pullPlan.files_total, 1);
        assert.deepEqual(pullPlan.transfer, [entry]);
        const downloaded = await getFile({
            context,
            planId: pullPlan.plan_id,
            syncPath: entry.path,
            token: session.session_token,
        });
        assert.equal(downloaded.modifiedMs, String(BASE_MTIME));
        assert.equal(downloaded.text, 'hello');
    });
}

async function withServer(callback) {
    const dataDir = await mkdtemp(path.join(tmpdir(), 'tt-sync-tauri-test-'));
    process.env.TT_SYNC_PAIRING_TOKEN = TEST_TOKEN;
    const started = await startServer({ dataDir, port: 0 });
    const context = {
        baseUrl: `http://${started.host}:${started.port}`,
        server: started.server,
    };
    try {
        await callback(context);
    } finally {
        await new Promise(resolve => started.server.close(resolve));
        await rm(dataDir, { force: true, recursive: true });
    }
}

async function pairTauriDevice(context, publicKey, deviceName) {
    return postJson({
        body: {
            device_id: TAURI_DEVICE_ID,
            device_name: deviceName,
            device_pubkey: publicKey,
        },
        context,
        route: `/v2/pair/complete?token=${TEST_TOKEN}`,
    });
}

async function openTauriSession(context, privateKey) {
    const bodyText = JSON.stringify({ device_id: TAURI_DEVICE_ID });
    const timestampMs = String(Date.now());
    const nonce = 'test-nonce';
    const canonical = canonicalSessionRequest({ bodyText, nonce, timestampMs });
    const signature = sign(null, Buffer.from(canonical), privateKey).toString('base64url');
    return postRawJson({
        bodyText,
        context,
        headers: {
            'TT-Device-Id': TAURI_DEVICE_ID,
            'TT-Nonce': nonce,
            'TT-Signature': signature,
            'TT-Timestamp-Ms': timestampMs,
        },
        route: '/v2/session/open',
    });
}

function canonicalSessionRequest(options) {
    const bodyHash = createHash('sha256').update(options.bodyText).digest('base64url');
    return [
        'TT-SYNC-V2',
        TAURI_DEVICE_ID,
        options.timestampMs,
        options.nonce,
        'POST',
        '/v2/session/open',
        bodyHash,
    ].join('\n');
}

async function tauriPushPlan(context, token, entries) {
    return postJson({
        body: { mode: 'Incremental', source_manifest: { entries } },
        context,
        route: '/v2/sync/push-plan',
        token,
    });
}

async function tauriPullPlan(context, token, entries) {
    return postJson({
        body: { mode: 'Incremental', target_manifest: { entries } },
        context,
        route: '/v2/sync/pull-plan',
        token,
    });
}

function entryFor(content, modifiedMs) {
    const buffer = Buffer.from(content);
    return {
        modifiedMs,
        path: FILE_PATH,
        sha256: sha256(buffer),
        sizeBytes: buffer.length,
    };
}

function tauriEntryFor(content, modifiedMs) {
    const entry = entryFor(content, modifiedMs);
    return {
        modified_ms: entry.modifiedMs,
        path: entry.path,
        size_bytes: entry.sizeBytes,
    };
}

function tauriDeviceKeys() {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const der = publicKey.export({ format: 'der', type: 'spki' });
    return {
        privateKey,
        publicKey: Buffer.from(der).subarray(-32).toString('base64url'),
    };
}

async function postJson(options) {
    const response = await fetch(`${options.context.baseUrl}${options.route}`, {
        body: JSON.stringify(options.body),
        headers: requestHeaders(options.token || ''),
        method: 'POST',
    });
    return parseJsonResponse(response);
}

async function postRawJson(options) {
    const response = await fetch(`${options.context.baseUrl}${options.route}`, {
        body: options.bodyText,
        headers: { 'Content-Type': 'application/json', ...options.headers },
        method: 'POST',
    });
    return parseJsonResponse(response);
}

async function putFile(options) {
    const response = await fetch(`${options.context.baseUrl}/v2/plans/${options.planId}/files/${encodePath(options.syncPath)}`, {
        body: Buffer.from(options.content),
        headers: requestHeaders(options.token, 'application/octet-stream'),
        method: 'PUT',
    });
    await parseJsonResponse(response);
}

async function getFile(options) {
    const response = await fetch(`${options.context.baseUrl}/v2/plans/${options.planId}/files/${encodePath(options.syncPath)}`, {
        headers: requestHeaders(options.token),
    });
    if (!response.ok) {
        throw new Error((await response.json()).error);
    }
    return {
        modifiedMs: response.headers.get('x-tt-sync-modified-ms'),
        text: await response.text(),
    };
}

async function parseJsonResponse(response) {
    const payload = await response.json();
    if (!response.ok) {
        throw new Error(payload.error || `HTTP ${response.status}`);
    }
    return payload;
}

function requestHeaders(token, contentType = 'application/json') {
    const headers = { 'Content-Type': contentType };
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }
    return headers;
}
