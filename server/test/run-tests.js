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
const IMAGE_PATH = 'default-user/files/avatar.png';
const BASE_MTIME = 1778500000000;
const BULK_FILE_COUNT = 128;

const tests = [
    ['pair, push, pull, and empty diff', testPushPullEmptyDiff],
    ['only changed files transfer and bundle endpoints work', testChangedFilesAndBundle],
    ['bulk first sync completes', testBulkFirstSync],
    ['uncommitted push plan does not delete remote files', testUncommittedPushKeepsRemote],
    ['conflict blocks commit until decision is provided', testConflictDecision],
    ['excluded sync state paths are rejected', testExcludedStatePath],
    ['invalid manifest entries are rejected', testInvalidManifestEntries],
    ['invalid pairing URIs return bad request', testInvalidPairingUris],
    ['protected endpoints reject missing auth', testProtectedEndpointsRejectMissingAuth],
    ['account device history and rollback endpoints work', testAccountDeviceHistoryRollback],
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

async function testPushPullEmptyDiff() {
    await withServer(async context => {
        const pair = await pairDevice(context);
        const entry = entryFor('hello', BASE_MTIME);
        const createdPlan = await pushPlan({ baseManifest: [], context, localManifest: [entry], pair });
        assert.equal(createdPlan.uploads.length, 1);
        await assertProgressLifecycle({ content: 'hello', context, entry, pair, pushPlan: createdPlan });

        const pullPlan = await pullPlanFor(context, pair, []);
        assert.equal(pullPlan.downloads.length, 1);
        const downloaded = await getFile({ context, planId: pullPlan.id, syncPath: entry.path, token: pair.authToken });
        assert.equal(downloaded.text, 'hello');
        assert.equal(downloaded.modifiedMs, String(BASE_MTIME));

        const emptyPlan = await pullPlanFor(context, pair, [entry]);
        assert.equal(emptyPlan.downloads.length, 0);
    });
}

async function assertProgressLifecycle(options) {
    assert.deepEqual(await getProgress(options.context, options.pushPlan.id, options.pair.authToken), {
        bytesTransferred: 0,
        currentPath: FILE_PATH,
        filesTransferred: 0,
        phase: 'planned',
        totalBytes: options.entry.sizeBytes,
        totalFiles: 1,
    });
    await putFile({
        content: options.content,
        context: options.context,
        planId: options.pushPlan.id,
        syncPath: options.entry.path,
        token: options.pair.authToken,
    });
    assert.equal((await getProgress(options.context, options.pushPlan.id, options.pair.authToken)).filesTransferred, 1);
    await postJson({ context: options.context, route: `/v2/plans/${options.pushPlan.id}/commit`, body: {}, token: options.pair.authToken });
    assert.equal((await getProgress(options.context, options.pushPlan.id, options.pair.authToken)).phase, 'committed');
}

async function testConflictDecision() {
    await withServer(async context => {
        const { conflictPlan, localEntry, pair, remoteEntry } = await prepareConflictScenario(context);
        assert.equal(conflictPlan.conflicts.length, 1);
        await putFile({ content: 'local', context, planId: conflictPlan.id, syncPath: localEntry.path, token: pair.authToken });
        await assert.rejects(
            postJson({ context, route: `/v2/plans/${conflictPlan.id}/commit`, body: {}, token: pair.authToken }),
            /Missing conflict decision/,
        );
        await postJson({
            context,
            route: `/v2/plans/${conflictPlan.id}/commit`,
            body: {
                conflictDecisions: { [FILE_PATH]: 'local' },
            },
            token: pair.authToken,
        });
        const pullPlan = await pullPlanFor(context, pair, [remoteEntry]);
        const downloaded = await getFile({ context, planId: pullPlan.id, syncPath: FILE_PATH, token: pair.authToken });
        assert.equal(downloaded.text, 'local');
    });
}

async function prepareConflictScenario(context) {
    const pair = await pairDevice(context);
    const baseEntry = await commitSingleFile({ content: 'hello', context, modifiedMs: BASE_MTIME, pair });
    const remoteEntry = await commitSingleFile({
        baseManifest: [baseEntry],
        content: 'remote',
        context,
        modifiedMs: BASE_MTIME + 1,
        pair,
    });
    const localEntry = entryFor('local', BASE_MTIME + 2);
    const conflictPlan = await pushPlan({ baseManifest: [baseEntry], context, localManifest: [localEntry], pair });
    return { conflictPlan, localEntry, pair, remoteEntry };
}

async function testChangedFilesAndBundle() {
    await withServer(async context => {
        const pair = await pairDevice(context);
        const baseManifest = await commitBundle(context, pair, [
            fileSpec(FILE_PATH, 'hello', BASE_MTIME),
            fileSpec(IMAGE_PATH, 'image', BASE_MTIME),
        ]);
        const changedChat = entryForPath(FILE_PATH, 'hello2', BASE_MTIME + 1);
        const unchangedImage = entryForPath(IMAGE_PATH, 'image', BASE_MTIME);
        const plan = await pushPlan({ baseManifest, context, localManifest: [changedChat, unchangedImage], pair });
        assert.deepEqual(plan.uploads.map(entry => entry.path), [FILE_PATH]);
        await putFile({ content: 'hello2', context, planId: plan.id, syncPath: FILE_PATH, token: pair.authToken });
        await postJson({ context, route: `/v2/plans/${plan.id}/commit`, body: {}, token: pair.authToken });

        const pullPlan = await pullPlanFor(context, pair, []);
        const bundle = await getBundle(context, pullPlan.id, pair.authToken);
        assert.deepEqual(bundle.files.map(file => file.path).sort(), [FILE_PATH, IMAGE_PATH].sort());
    });
}

async function testBulkFirstSync() {
    await withServer(async context => {
        const pair = await pairDevice(context);
        const specs = Array.from({ length: BULK_FILE_COUNT }, bulkFileSpec);
        await commitBundle(context, pair, specs);
        const pullPlan = await pullPlanFor(context, pair, []);
        assert.equal(pullPlan.downloads.length, BULK_FILE_COUNT);
        const bundle = await getBundle(context, pullPlan.id, pair.authToken);
        assert.equal(bundle.files.length, BULK_FILE_COUNT);
    });
}

async function testUncommittedPushKeepsRemote() {
    await withServer(async context => {
        const pair = await pairDevice(context);
        const baseManifest = await commitBundle(context, pair, [
            fileSpec(FILE_PATH, 'hello', BASE_MTIME),
            fileSpec(IMAGE_PATH, 'image', BASE_MTIME),
        ]);
        const plan = await pushPlan({ baseManifest, context, localManifest: [baseManifest[0]], pair });
        assert.deepEqual(plan.remoteDeletes, [IMAGE_PATH]);
        const pullPlan = await pullPlanFor(context, pair, []);
        assert.deepEqual(pullPlan.downloads.map(entry => entry.path).sort(), [FILE_PATH, IMAGE_PATH].sort());
    });
}

async function testExcludedStatePath() {
    await withServer(async context => {
        const pair = await pairDevice(context);
        await assert.rejects(
            pushPlan({
                baseManifest: [],
                context,
                localManifest: [entryForPath('default-user/user/lan-sync/state.json', '{}', BASE_MTIME)],
                pair,
            }),
            /excluded from TT-Sync/,
        );
    });
}

async function testInvalidManifestEntries() {
    await withServer(async context => {
        const pair = await pairDevice(context);
        await assert.rejects(
            pushPlan({ baseManifest: [], context, localManifest: [entryFor('a', BASE_MTIME), entryFor('b', BASE_MTIME)], pair }),
            /Duplicate manifest path/,
        );
        await assert.rejects(
            pushPlan({ baseManifest: [], context, localManifest: [{ ...entryFor('a', BASE_MTIME), modifiedMs: 1.5 }], pair }),
            /Invalid modifiedMs/,
        );
    });
}

async function testInvalidPairingUris() {
    await withServer(async context => {
        await postJsonExpectError({
            body: { deviceName: 'bad-device', pairingUri: 'not a uri' },
            context,
            message: /Pairing URI must be a valid tt-sync:\/\/ URI/,
            route: '/v2/pair/complete',
            status: 400,
        });
        await postJsonExpectError({
            body: { deviceName: 'bad-device', pairingUri: 'https://example.test/?token=x' },
            context,
            message: /Pairing URI must use tt-sync:\/\//,
            route: '/v2/pair/complete',
            status: 400,
        });
    });
}

async function testProtectedEndpointsRejectMissingAuth() {
    await withServer(async context => {
        const pair = await pairDevice(context);
        await assert.rejects(
            postJson({
                context,
                route: '/v2/session/open',
                body: { deviceId: pair.deviceId, namespace: pair.namespace },
            }),
            /Missing bearer token/,
        );
        await assert.rejects(
            getJson({ context, route: '/v2/devices?namespace=default' }),
            /Missing bearer token/,
        );
    });
}

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
    const dataDir = await mkdtemp(path.join(tmpdir(), 'tt-sync-test-'));
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
        context,
        route: '/v2/account/login',
        body: { namespace: 'default', password: TEST_PASSWORD, username: TEST_USERNAME },
    });
}

async function refreshAccountToken(context, refreshToken) {
    return postJson({
        context,
        route: '/v2/account/token/refresh',
        body: { namespace: 'default', refreshToken },
    });
}

async function openDeviceSession(context, pair, token) {
    return postJson({
        context,
        route: '/v2/session/open',
        body: { deviceId: pair.deviceId, namespace: pair.namespace },
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
        context,
        route: `/v2/rollback-points/${rollbackId}/restore?namespace=default`,
        body: {},
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
        context,
        route: '/v2/pair/complete',
        body: {
            deviceName: 'test-device',
            pairingUri,
        },
    });
}

async function commitSingleFile(options) {
    const baseManifest = options.baseManifest || [];
    const { content, context, modifiedMs, pair } = options;
    const entry = entryFor(content, modifiedMs);
    const plan = await postJson({
        context,
        route: '/v2/sync/push-plan',
        body: {
        baseManifest,
        deviceId: pair.deviceId,
        localManifest: [entry],
        namespace: pair.namespace,
        },
        token: pair.authToken,
    });
    await putFile({ content, context, planId: plan.id, syncPath: entry.path, token: pair.authToken });
    await postJson({ context, route: `/v2/plans/${plan.id}/commit`, body: {}, token: pair.authToken });
    return entry;
}

async function commitBundle(context, pair, specs) {
    const manifest = specs.map(spec => entryForPath(spec.path, spec.content, spec.modifiedMs));
    const plan = await pushPlan({ baseManifest: [], context, localManifest: manifest, pair });
    await putBundle({ context, planId: plan.id, specs, token: pair.authToken });
    await postJson({ context, route: `/v2/plans/${plan.id}/commit`, body: {}, token: pair.authToken });
    return manifest;
}

async function pushPlan(options) {
    return postJson({
        context: options.context,
        route: '/v2/sync/push-plan',
        body: {
            baseManifest: options.baseManifest,
            deviceId: options.pair.deviceId,
            localManifest: options.localManifest,
            namespace: options.pair.namespace,
        },
        token: options.pair.authToken,
    });
}

async function pullPlanFor(context, pair, localManifest) {
    return postJson({
        context,
        route: '/v2/sync/pull-plan',
        body: {
            deviceId: pair.deviceId,
            localManifest,
            namespace: pair.namespace,
        },
        token: pair.authToken,
    });
}

function fileSpec(syncPath, content, modifiedMs) {
    return { content, modifiedMs, path: syncPath };
}

function bulkFileSpec(_value, index) {
    return fileSpec(
        `default-user/chats/bulk-${String(index).padStart(3, '0')}.jsonl`,
        `message-${index}`,
        BASE_MTIME + index,
    );
}

function entryFor(content, modifiedMs) {
    return entryForPath(FILE_PATH, content, modifiedMs);
}

function entryForPath(syncPath, content, modifiedMs) {
    const buffer = Buffer.from(content);
    return {
        modifiedMs,
        path: syncPath,
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

async function postJsonExpectError(options) {
    const response = await fetch(`${options.context.baseUrl}${options.route}`, {
        body: JSON.stringify(options.body),
        headers: requestHeaders(options.token || ''),
        method: 'POST',
    });
    const payload = await response.json();
    assert.equal(response.status, options.status);
    assert.match(payload.error, options.message);
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

async function putBundle(options) {
    const response = await fetch(`${options.context.baseUrl}/v2/plans/${options.planId}/bundle`, {
        body: JSON.stringify({
            files: options.specs.map(spec => ({
                contentBase64: Buffer.from(spec.content).toString('base64'),
                path: spec.path,
            })),
        }),
        headers: requestHeaders(options.token),
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

async function getBundle(context, planId, token) {
    const response = await fetch(`${context.baseUrl}/v2/plans/${planId}/bundle`, {
        headers: requestHeaders(token),
    });
    return parseJsonResponse(response);
}

async function getProgress(context, planId, token) {
    const response = await fetch(`${context.baseUrl}/v2/plans/${planId}/events?once=1`, {
        headers: requestHeaders(token),
    });
    if (!response.ok) {
        throw new Error((await response.json()).error);
    }
    return parseSseProgress(await response.text());
}

function parseSseProgress(text) {
    const dataLine = text.split('\n').find(line => line.startsWith('data: '));
    assert.ok(dataLine, 'SSE progress data line is required');
    return JSON.parse(dataLine.slice('data: '.length));
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
