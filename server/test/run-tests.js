import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { encodePath } from '../lib/encoding.js';
import { sha256 } from '../lib/manifest.js';
import { buildPairingUri, startServer } from '../tt-sync-server.js';

const TEST_TOKEN = 'test-pairing-token';
const FILE_PATH = 'default-user/chats/example.jsonl';
const IMAGE_PATH = 'default-user/files/avatar.png';
const STREAM_INVALID_PATH = 'default-user/chats/stream-invalid.jsonl';
const BASE_MTIME = 1778500000000;
const BULK_FILE_COUNT = 128;

const tests = [
    ['pair, push, pull, and empty diff', testPushPullEmptyDiff],
    ['only changed files transfer and bundle endpoints work', testChangedFilesAndBundle],
    ['single file transfer streams without buffered route body', testStreamingSingleFileTransfer],
    ['bundle upload validates file payload', testBundleValidatesFilePayload],
    ['bulk first sync completes', testBulkFirstSync],
    ['uncommitted push plan does not delete remote files', testUncommittedPushKeepsRemote],
    ['incremental push commit keeps remote-only files', testIncrementalPushKeepsRemoteOnlyFiles],
    ['conflict blocks commit until decision is provided', testConflictDecision],
    ['excluded sync state paths are rejected', testExcludedStatePath],
    ['invalid manifest entries are rejected', testInvalidManifestEntries],
    ['invalid pairing URIs return bad request', testInvalidPairingUris],
    ['protected endpoints reject missing auth', testProtectedEndpointsRejectMissingAuth],
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
        committed: false,
        currentPath: FILE_PATH,
        filesTransferred: 0,
        partial_upload_safe: true,
        pending_files: 1,
        phase: 'planned',
        staged_files: 0,
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

async function testStreamingSingleFileTransfer() {
    await withServer(async context => {
        const pair = await pairDevice(context);
        const content = 'streamed-content';
        const entry = entryForPath(FILE_PATH, content, BASE_MTIME);
        const plan = await pushPlan({ baseManifest: [], context, localManifest: [entry], pair });
        await putFileStream({ content, context, planId: plan.id, syncPath: FILE_PATH, token: pair.authToken });
        await postJson({ context, route: `/v2/plans/${plan.id}/commit`, body: {}, token: pair.authToken });
        const downloaded = await getFile({ context, planId: (await pullPlanFor(context, pair, [])).id, syncPath: FILE_PATH, token: pair.authToken });
        assert.equal(downloaded.text, content);
        const invalidEntry = entryForPath(STREAM_INVALID_PATH, content, BASE_MTIME);
        const invalidPlan = await pushPlan({ baseManifest: [], context, localManifest: [invalidEntry], pair });
        await assert.rejects(
            putFileStream({ content: `${content}-too-large`, context, planId: invalidPlan.id, syncPath: invalidEntry.path, token: pair.authToken }),
            /Uploaded size does not match manifest/,
        );
        assert.equal((await getProgress(context, invalidPlan.id, pair.authToken)).filesTransferred, 0);
    });
}

async function testBundleValidatesFilePayload() {
    await withServer(async context => {
        const pair = await pairDevice(context);
        const entry = entryFor('', BASE_MTIME);
        const plan = await pushPlan({ baseManifest: [], context, localManifest: [entry], pair });
        await putBundleExpectError({
            context,
            files: [{ contentBase64: '' }],
            message: /Bundle file path must be a string/,
            planId: plan.id,
            status: 400,
            token: pair.authToken,
        });
        await putBundleExpectError({
            context,
            files: [{ path: entry.path }],
            message: /contentBase64 must be a base64 string/,
            planId: plan.id,
            status: 400,
            token: pair.authToken,
        });
        await putBundleExpectError({
            context,
            files: [{ contentBase64: '!!!!', path: entry.path }],
            message: /contentBase64 must be valid base64/,
            planId: plan.id,
            status: 400,
            token: pair.authToken,
        });
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
        const plan = await pushPlan({ baseManifest, context, localManifest: [baseManifest[0]], mode: 'Mirror', pair });
        assert.deepEqual(plan.remoteDeletes, [IMAGE_PATH]);
        const pullPlan = await pullPlanFor(context, pair, []);
        assert.deepEqual(pullPlan.downloads.map(entry => entry.path).sort(), [FILE_PATH, IMAGE_PATH].sort());
    });
}

async function testIncrementalPushKeepsRemoteOnlyFiles() {
    await withServer(async context => {
        const pair = await pairDevice(context);
        const baseManifest = await commitBundle(context, pair, [
            fileSpec(FILE_PATH, 'hello', BASE_MTIME),
            fileSpec(IMAGE_PATH, 'image', BASE_MTIME),
        ]);
        const plan = await pushPlan({ baseManifest, context, localManifest: [baseManifest[0]], pair });
        assert.deepEqual(plan.remoteDeletes, []);
        await postJson({ context, route: `/v2/plans/${plan.id}/commit`, body: {}, token: pair.authToken });
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

async function withServer(callback) {
    const dataDir = await mkdtemp(path.join(tmpdir(), 'tt-sync-test-'));
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
            mode: options.mode || 'Incremental',
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

async function putFileStream(options) {
    const response = await fetch(`${options.context.baseUrl}/v2/plans/${options.planId}/files/${encodePath(options.syncPath)}`, {
        body: Readable.from([Buffer.from(options.content)]),
        duplex: 'half',
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

async function putBundleExpectError(options) {
    const response = await fetch(`${options.context.baseUrl}/v2/plans/${options.planId}/bundle`, {
        body: JSON.stringify({ files: options.files }),
        headers: requestHeaders(options.token),
        method: 'PUT',
    });
    const payload = await response.json();
    assert.equal(response.status, options.status);
    assert.match(payload.error, options.message);
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
