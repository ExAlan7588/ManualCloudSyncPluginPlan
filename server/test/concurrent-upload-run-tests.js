import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { encodePath } from '../lib/encoding.js';
import { sha256 } from '../lib/manifest.js';
import { buildPairingUri, startServer } from '../tt-sync-server.js';

const TEST_TOKEN = 'test-pairing-token';
const BASE_MTIME = 1778500000000;
const CONCURRENT_FILE_COUNT = 48;

await testConcurrentPlanUploadsKeepStagedProgress();
console.log('ok - concurrent plan uploads keep staged progress');

async function testConcurrentPlanUploadsKeepStagedProgress() {
    await withServer(async context => {
        const pair = await pairDevice(context);
        const specs = Array.from({ length: CONCURRENT_FILE_COUNT }, fileSpec);
        const manifest = specs.map(spec => entryFor(spec.path, spec.content, spec.modifiedMs));
        const plan = await pushPlan({ context, localManifest: manifest, pair });
        await Promise.all(specs.map(spec => putFile({
            content: spec.content,
            context,
            planId: plan.id,
            syncPath: spec.path,
            token: pair.authToken,
        })));
        const progress = await getProgress(context, plan.id, pair.authToken);
        assert.equal(progress.filesTransferred, CONCURRENT_FILE_COUNT);
        await postJson({ body: {}, context, route: `/v2/plans/${plan.id}/commit`, token: pair.authToken });
        const pullPlan = await pullPlanFor(context, pair, []);
        assert.equal(pullPlan.downloads.length, CONCURRENT_FILE_COUNT);
    });
}

async function withServer(callback) {
    const dataDir = await mkdtemp(path.join(tmpdir(), 'tt-sync-concurrent-test-'));
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
        body: { deviceName: 'concurrent-test-device', pairingUri },
        context,
        route: '/v2/pair/complete',
    });
}

async function pushPlan(options) {
    return postJson({
        body: {
            baseManifest: [],
            deviceId: options.pair.deviceId,
            localManifest: options.localManifest,
            namespace: options.pair.namespace,
        },
        context: options.context,
        route: '/v2/sync/push-plan',
        token: options.pair.authToken,
    });
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

function fileSpec(_value, index) {
    return {
        content: `message-${index}`,
        modifiedMs: BASE_MTIME + index,
        path: `default-user/chats/concurrent-${String(index).padStart(3, '0')}.jsonl`,
    };
}

function entryFor(syncPath, content, modifiedMs) {
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

async function putFile(options) {
    const response = await fetch(`${options.context.baseUrl}/v2/plans/${options.planId}/files/${encodePath(options.syncPath)}`, {
        body: Buffer.from(options.content),
        headers: requestHeaders(options.token, 'application/octet-stream'),
        method: 'PUT',
    });
    await parseJsonResponse(response);
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
