import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { encodePath } from '../lib/encoding.js';
import { sha256 } from '../lib/manifest.js';
import { buildPairingUri, startServer } from '../tt-sync-server.js';

const TEST_TOKEN = 'test-pairing-token';
const TEST_USERNAME = 'test-user';
const TEST_PASSWORD = 'test-password';
const FILE_PATH = 'default-user/chats/example.jsonl';
const BASE_MTIME = 1778500000000;

await testAccountDeviceHistoryRollback();
console.log('ok - account device history and rollback endpoints work');

async function testAccountDeviceHistoryRollback() {
    await withServer(async context => {
        const account = await loginAccount(context);
        const refreshed = await refreshAccountToken(context, account.refreshToken);
        assert.notEqual(refreshed.accessToken, account.accessToken);
        const pair = await pairDevice(context);
        await openDeviceSession(context, pair, refreshed.accessToken);
        const baseEntry = await commitSingleFile({ content: 'hello', context, modifiedMs: BASE_MTIME, pair });
        await commitSingleFile({ baseManifest: [baseEntry], content: 'new', context, modifiedMs: BASE_MTIME + 1, pair });
        await assertDeviceAndHistory(context, pair, refreshed.accessToken);
        const rollbackPoint = await latestRollbackPoint(context, refreshed.accessToken);
        await restoreRollbackPoint(context, rollbackPoint.id, refreshed.accessToken);
        const pullPlan = await pullPlanFor(context, pair, []);
        const downloaded = await getFile({ context, planId: pullPlan.id, syncPath: FILE_PATH, token: pair.authToken });
        assert.equal(downloaded.text, 'hello');
    });
}

async function withServer(callback) {
    const dataDir = await mkdtemp(path.join(tmpdir(), 'tt-sync-account-test-'));
    process.env.TT_SYNC_PAIRING_TOKEN = TEST_TOKEN;
    process.env.TT_SYNC_ACCOUNT_USERNAME = TEST_USERNAME;
    process.env.TT_SYNC_ACCOUNT_PASSWORD = TEST_PASSWORD;
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

async function loginAccount(context) {
    return postJson({
        body: { namespace: 'default', password: TEST_PASSWORD, username: TEST_USERNAME },
        context,
        route: '/v2/account/login',
    });
}

async function refreshAccountToken(context, refreshToken) {
    return postJson({
        body: { namespace: 'default', refreshToken },
        context,
        route: '/v2/account/token/refresh',
    });
}

async function openDeviceSession(context, pair, token) {
    return postJson({
        body: { deviceId: pair.deviceId, namespace: pair.namespace },
        context,
        route: '/v2/session/open',
        token,
    });
}

async function assertDeviceAndHistory(context, pair, token) {
    const devices = await getJson({ context, route: '/v2/devices?namespace=default', token });
    const device = devices.devices.find(item => item.deviceId === pair.deviceId);
    assert.ok(device?.lastSyncAt, 'device lastSyncAt is required');
    const history = await getJson({ context, route: '/v2/history?namespace=default', token });
    assert.ok(history.history.length >= 2, 'sync history should record commits');
}

async function latestRollbackPoint(context, token) {
    const payload = await getJson({ context, route: '/v2/rollback-points?namespace=default', token });
    assert.ok(payload.rollbackPoints.length > 0, 'rollback point should exist');
    return payload.rollbackPoints[0];
}

async function restoreRollbackPoint(context, rollbackId, token) {
    return postJson({
        body: {},
        context,
        route: `/v2/rollback-points/${rollbackId}/restore?namespace=default`,
        token,
    });
}

async function pairDevice(context) {
    const pairingUri = buildPairingUri({
        endpoint: context.baseUrl,
        namespace: 'default',
        token: TEST_TOKEN,
    });
    return postJson({
        body: { deviceName: 'account-test-device', pairingUri },
        context,
        route: '/v2/pair/complete',
    });
}

async function commitSingleFile(options) {
    const baseManifest = options.baseManifest || [];
    const { content, context, modifiedMs, pair } = options;
    const entry = entryFor(content, modifiedMs);
    const plan = await postJson({
        body: {
            baseManifest,
            deviceId: pair.deviceId,
            localManifest: [entry],
            namespace: pair.namespace,
        },
        context,
        route: '/v2/sync/push-plan',
        token: pair.authToken,
    });
    await putFile({ content, context, planId: plan.id, syncPath: entry.path, token: pair.authToken });
    await postJson({ body: {}, context, route: `/v2/plans/${plan.id}/commit`, token: pair.authToken });
    return entry;
}

async function pullPlanFor(context, pair, localManifest) {
    return postJson({
        body: {
            deviceId: pair.deviceId,
            localManifest,
            namespace: pair.namespace,
        },
        context,
        route: '/v2/sync/pull-plan',
        token: pair.authToken,
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

async function postJson(options) {
    const response = await fetch(`${options.context.baseUrl}${options.route}`, {
        body: JSON.stringify(options.body),
        headers: requestHeaders(options.token || ''),
        method: 'POST',
    });
    return parseJsonResponse(response);
}

async function getJson(options) {
    const response = await fetch(`${options.context.baseUrl}${options.route}`, {
        headers: requestHeaders(options.token),
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
