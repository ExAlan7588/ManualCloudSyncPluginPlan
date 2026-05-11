#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { encodePath } from '../server/lib/encoding.js';
import { sha256 } from '../server/lib/manifest.js';
import { buildPairingUri, startServer } from '../server/tt-sync-server.js';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_FIXTURE_FILE_BYTES = null;
const DEFAULT_FIXTURE_FILE_COUNT = 1;
const DEFAULT_DEVICE_PREFIX = 'smoke-device';
const DEFAULT_NAMESPACE_PREFIX = 'smoke';
const EXIT_FAILURE = 1;
const EXIT_SUCCESS = 0;
const FIXTURE_INDEX_PAD = 4;
const JSON_INDENT = 2;
const LOCAL_PORT = 0;
const MIN_FIXTURE_FILE_BYTES = 0;
const MIN_FIXTURE_FILE_COUNT = 1;
const SMOKE_CONTENT_PREFIX = 'tt-sync-smoke';
const SMOKE_PATH_PREFIX = 'default-user/chats/tt-sync-smoke';
const SMOKE_RUN_ID_LENGTH = 12;
const TOKEN_ENV_NAME = 'TT_SYNC_PAIRING_TOKEN';

export async function smokeTtSyncServer(input = {}) {
    const runtime = await createRuntime(input);
    try {
        return await runSmoke(runtime);
    } finally {
        await cleanupRuntime(runtime);
    }
}

export function formatSmokeReport(report) {
    const lines = [
        `TT-Sync server smoke ${report.ok ? 'passed' : 'failed'}`,
        `mode: ${report.mode}`,
        `endpoint: ${report.endpoint}`,
        `namespace: ${report.namespace}`,
        `smoke path: ${report.smokePath}`,
        `fixture: ${report.fixture.fileCount} files / ${report.fixture.totalBytes} bytes`,
        'checks:',
    ];
    lines.push(...report.checks.map(check => `- ${check.name}: ${check.detail}`));
    return lines.join('\n');
}

async function createRuntime(input) {
    const runId = randomRunId();
    const options = normalizeOptions({ ...input, runId });
    if (options.local) {
        return createLocalRuntime(options);
    }
    return { ...options, endpoint: normalizeEndpoint(options.endpoint), mode: 'remote' };
}

function normalizeOptions(input) {
    const bulkFiles = parseIntegerOption({
        defaultValue: DEFAULT_FIXTURE_FILE_COUNT,
        label: '--bulk-files',
        minimum: MIN_FIXTURE_FILE_COUNT,
        value: input.bulkFiles,
    });
    const bulkFileBytes = parseIntegerOption({
        defaultValue: DEFAULT_FIXTURE_FILE_BYTES,
        label: '--bulk-file-bytes',
        minimum: MIN_FIXTURE_FILE_BYTES,
        value: input.bulkFileBytes,
    });
    const namespace = input.namespace || `${DEFAULT_NAMESPACE_PREFIX}-${input.runId}`;
    const deviceName = input.deviceName || `${DEFAULT_DEVICE_PREFIX}-${input.runId}`;
    const pairingToken = input.local ? '' : input.pairingToken || process.env[TOKEN_ENV_NAME] || '';
    if (input.local && input.endpoint) {
        throw new Error('Use either --local or --endpoint, not both');
    }
    if (!input.local && !input.endpoint) {
        throw new Error('Either --endpoint <url> or --local is required');
    }
    if (!input.local && !pairingToken) {
        throw new Error('--pairing-token or TT_SYNC_PAIRING_TOKEN is required for remote smoke');
    }
    return { ...input, bulkFileBytes, bulkFiles, deviceName, namespace, pairingToken, startedAt: new Date().toISOString() };
}

function parseIntegerOption(options) {
    if (options.value === undefined || options.value === null) {
        return options.defaultValue;
    }
    const value = Number(options.value);
    if (!Number.isInteger(value) || value < options.minimum) {
        throw new Error(`${options.label} must be an integer >= ${options.minimum}`);
    }
    return value;
}

async function createLocalRuntime(options) {
    const dataDir = await mkdtemp(path.join(tmpdir(), 'tt-sync-smoke-'));
    const previousToken = process.env[TOKEN_ENV_NAME];
    const pairingToken = randomUUID();
    process.env[TOKEN_ENV_NAME] = pairingToken;
    const started = await startServer({ dataDir, host: DEFAULT_HOST, port: LOCAL_PORT });
    return {
        ...options,
        cleanup: { dataDir, previousToken, server: started.server },
        endpoint: `http://${started.host}:${started.port}`,
        mode: 'local',
        pairingToken,
    };
}

async function cleanupRuntime(runtime) {
    if (!runtime.cleanup) {
        return;
    }
    await new Promise(resolve => runtime.cleanup.server.close(resolve));
    await rm(runtime.cleanup.dataDir, { force: true, recursive: true });
    restorePairingToken(runtime.cleanup.previousToken);
}

function restorePairingToken(previousToken) {
    if (previousToken === undefined) {
        delete process.env[TOKEN_ENV_NAME];
        return;
    }
    process.env[TOKEN_ENV_NAME] = previousToken;
}

async function runSmoke(runtime) {
    const fixture = smokeFixture(runtime);
    const checks = [];
    const status = await assertStatus(runtime, checks);
    const pair = await pairDevice({ checks, runtime });
    await openSession({ checks, pair, runtime });
    const pushed = await pushSmokeFile({ checks, fixture, pair, runtime });
    const pulled = await pullSmokeFile({ checks, fixture, pair, runtime });
    await assertEmptyDiff({ checks, localManifest: pulled.remoteManifest, pair, runtime });
    await assertDeviceAndHistory({ checks, pair, planId: pushed.plan.id, runtime });
    return smokeReport({ checks, fixture, pair, pulled, pushed, runtime, status });
}

async function assertStatus(runtime, checks) {
    const status = await getJson({ route: '/v2/status', runtime });
    assertCondition(status.ok === true, 'Status endpoint must return ok=true');
    recordCheck({ checks, detail: String(status.service || 'ok'), name: 'status' });
    return status;
}

async function pairDevice(options) {
    const pairingUri = buildPairingUri({
        endpoint: options.runtime.endpoint,
        namespace: options.runtime.namespace,
        token: options.runtime.pairingToken,
    });
    const pair = await postJson({
        body: { deviceName: options.runtime.deviceName, pairingUri },
        route: '/v2/pair/complete',
        runtime: options.runtime,
    });
    assertCondition(Boolean(pair.authToken && pair.deviceId), 'Pairing response must include authToken and deviceId');
    recordCheck({ checks: options.checks, detail: pair.deviceId, name: 'pair' });
    return pair;
}

async function openSession(options) {
    const session = await postJson({
        body: { deviceId: options.pair.deviceId, namespace: options.pair.namespace },
        route: '/v2/session/open',
        runtime: options.runtime,
        token: options.pair.authToken,
    });
    assertCondition(session.deviceId === options.pair.deviceId, 'Session endpoint must echo the paired device id');
    recordCheck({ checks: options.checks, detail: session.openedAt, name: 'session' });
}

async function pushSmokeFile(options) {
    const plan = await pushPlan({ baseManifest: [], localManifest: options.fixture.entries, pair: options.pair, runtime: options.runtime });
    assertAllPaths({ entries: plan.uploads, expectedPaths: options.fixture.paths, label: 'push uploads' });
    await assertProgress({ checks: options.checks, expectedPhase: 'planned', name: 'progress planned', pair: options.pair, planId: plan.id, runtime: options.runtime });
    await uploadFixtureFiles({ fixture: options.fixture, pair: options.pair, planId: plan.id, runtime: options.runtime });
    await assertProgress({ checks: options.checks, expectedPhase: 'transferring', name: 'progress transferring', pair: options.pair, planId: plan.id, runtime: options.runtime });
    const committed = await commitPlan({ pair: options.pair, planId: plan.id, runtime: options.runtime });
    await assertProgress({ checks: options.checks, expectedPhase: 'committed', name: 'progress committed', pair: options.pair, planId: plan.id, runtime: options.runtime });
    recordCheck({ checks: options.checks, detail: committed.id, name: 'push commit' });
    return { plan: committed };
}

async function uploadFixtureFiles(options) {
    for (const file of options.fixture.files) {
        await putFile({ content: file.content, pair: options.pair, planId: options.planId, runtime: options.runtime, syncPath: file.path });
    }
}

async function pullSmokeFile(options) {
    const plan = await pullPlan({ localManifest: [], pair: options.pair, runtime: options.runtime });
    assertAllPaths({ entries: plan.downloads, expectedPaths: options.fixture.paths, label: 'pull downloads' });
    await assertDownloadedFiles({ checks: options.checks, fixture: options.fixture, pair: options.pair, plan, runtime: options.runtime });
    return { plan, remoteManifest: plan.downloads };
}

async function assertDownloadedFiles(options) {
    for (const file of options.fixture.files) {
        const downloaded = await getFile({ pair: options.pair, planId: options.plan.id, runtime: options.runtime, syncPath: file.path });
        assertCondition(downloaded.text === file.content, `Downloaded content must match ${file.path}`);
        assertCondition(downloaded.modifiedMs === String(file.entry.modifiedMs), `Downloaded mtime header must match ${file.path}`);
    }
    recordCheck({ checks: options.checks, detail: `${options.fixture.files.length} files / ${options.fixture.totalBytes} bytes`, name: 'pull mtime header' });
}

async function assertEmptyDiff(options) {
    const plan = await pullPlan({ localManifest: options.localManifest, pair: options.pair, runtime: options.runtime });
    assertCondition(plan.downloads.length === 0, 'Pull plan must be empty for the full remote manifest snapshot');
    assertCondition(plan.conflicts.length === 0, 'Empty diff must not contain conflicts');
    recordCheck({ checks: options.checks, detail: plan.id, name: 'empty diff' });
}

async function assertDeviceAndHistory(options) {
    const devices = await getJson({ route: `/v2/devices?namespace=${options.pair.namespace}`, runtime: options.runtime, token: options.pair.authToken });
    const device = devices.devices.find(item => item.deviceId === options.pair.deviceId);
    assertCondition(Boolean(device?.lastSyncAt), 'Device list must show lastSyncAt after commit');
    const history = await getJson({ route: `/v2/history?namespace=${options.pair.namespace}`, runtime: options.runtime, token: options.pair.authToken });
    assertCondition(history.history.some(item => item.planId === options.planId), 'History must include the committed push plan');
    recordCheck({ checks: options.checks, detail: device.lastSyncAt, name: 'device history' });
}

async function assertProgress(options) {
    const progress = await getProgress({ pair: options.pair, planId: options.planId, runtime: options.runtime });
    assertCondition(progress.phase === options.expectedPhase, `${options.name} expected ${options.expectedPhase}`);
    recordCheck({ checks: options.checks, detail: `${progress.filesTransferred}/${progress.totalFiles}`, name: options.name });
}

async function pushPlan(options) {
    return postJson({
        body: {
            baseManifest: options.baseManifest,
            deviceId: options.pair.deviceId,
            localManifest: options.localManifest,
            namespace: options.pair.namespace,
        },
        route: '/v2/sync/push-plan',
        runtime: options.runtime,
        token: options.pair.authToken,
    });
}

async function pullPlan(options) {
    return postJson({
        body: {
            deviceId: options.pair.deviceId,
            localManifest: options.localManifest,
            namespace: options.pair.namespace,
        },
        route: '/v2/sync/pull-plan',
        runtime: options.runtime,
        token: options.pair.authToken,
    });
}

async function putFile(options) {
    const response = await fetch(`${options.runtime.endpoint}/v2/plans/${options.planId}/files/${encodePath(options.syncPath)}`, {
        body: Buffer.from(options.content),
        headers: requestHeaders(options.pair.authToken, 'application/octet-stream'),
        method: 'PUT',
    });
    await parseJsonResponse(response);
}

async function commitPlan(options) {
    return postJson({
        body: {},
        route: `/v2/plans/${options.planId}/commit`,
        runtime: options.runtime,
        token: options.pair.authToken,
    });
}

async function getFile(options) {
    const response = await fetch(`${options.runtime.endpoint}/v2/plans/${options.planId}/files/${encodePath(options.syncPath)}`, {
        headers: requestHeaders(options.pair.authToken),
    });
    if (!response.ok) {
        throw new Error(await responseErrorText(response));
    }
    return {
        modifiedMs: response.headers.get('x-tt-sync-modified-ms'),
        text: await response.text(),
    };
}

async function getProgress(options) {
    const response = await fetch(`${options.runtime.endpoint}/v2/plans/${options.planId}/events?once=1`, {
        headers: requestHeaders(options.pair.authToken),
    });
    if (!response.ok) {
        throw new Error(await responseErrorText(response));
    }
    return parseSseProgress(await response.text());
}

async function getJson(options) {
    const response = await fetch(`${options.runtime.endpoint}${options.route}`, {
        headers: requestHeaders(options.token || ''),
    });
    return parseJsonResponse(response);
}

async function postJson(options) {
    const response = await fetch(`${options.runtime.endpoint}${options.route}`, {
        body: JSON.stringify(options.body),
        headers: requestHeaders(options.token || ''),
        method: 'POST',
    });
    return parseJsonResponse(response);
}

async function parseJsonResponse(response) {
    const payload = await response.json().catch(async () => {
        throw new Error(await responseErrorText(response));
    });
    if (!response.ok) {
        throw new Error(payload.error || `HTTP ${response.status}`);
    }
    return payload;
}

async function responseErrorText(response) {
    return `HTTP ${response.status}: ${await response.text()}`;
}

function requestHeaders(token, contentType = 'application/json') {
    const headers = { 'Content-Type': contentType };
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }
    return headers;
}

function parseSseProgress(text) {
    const dataLine = text.split(/\r?\n/).find(line => line.startsWith('data: '));
    assertCondition(Boolean(dataLine), 'SSE progress response must include a data line');
    return JSON.parse(dataLine.slice('data: '.length));
}

function smokeFixture(runtime) {
    const files = Array.from({ length: runtime.bulkFiles }, (_value, index) => smokeFixtureFile({ index, runtime }));
    const entries = files.map(file => file.entry);
    const paths = files.map(file => file.path);
    const totalBytes = entries.reduce((sum, entry) => sum + entry.sizeBytes, 0);
    return {
        content: files[0].content,
        entries,
        entry: files[0].entry,
        files,
        path: files[0].path,
        paths,
        totalBytes,
    };
}

function smokeFixtureFile(options) {
    const content = fixtureContent({
        bytes: options.runtime.bulkFileBytes,
        index: options.index,
        runId: options.runtime.runId,
    });
    const buffer = Buffer.from(content);
    const smokePath = `${SMOKE_PATH_PREFIX}-${fixturePathSuffix(options)}.jsonl`;
    return {
        content,
        entry: {
            modifiedMs: Date.now(),
            path: smokePath,
            sha256: sha256(buffer),
            sizeBytes: buffer.length,
        },
        path: smokePath,
    };
}

function fixtureContent(options) {
    const seed = `${SMOKE_CONTENT_PREFIX}:${options.runId}:${options.index}\n`;
    if (options.bytes === DEFAULT_FIXTURE_FILE_BYTES) {
        return seed;
    }
    return repeatedAscii({ bytes: options.bytes, seed });
}

function repeatedAscii(options) {
    let output = options.seed;
    while (output.length < options.bytes) {
        output += output;
    }
    return output.slice(0, options.bytes);
}

function fixturePathSuffix(options) {
    if (options.runtime.bulkFiles === DEFAULT_FIXTURE_FILE_COUNT) {
        return options.runtime.runId;
    }
    return `${options.runtime.runId}-${String(options.index + 1).padStart(FIXTURE_INDEX_PAD, '0')}`;
}

function smokeReport(options) {
    return {
        checks: options.checks,
        completedAt: new Date().toISOString(),
        deviceId: options.pair.deviceId,
        endpoint: options.runtime.endpoint,
        fixture: {
            fileCount: options.fixture.files.length,
            totalBytes: options.fixture.totalBytes,
        },
        mode: options.runtime.mode,
        namespace: options.pair.namespace,
        ok: true,
        planIds: {
            pull: options.pulled.plan.id,
            push: options.pushed.plan.id,
        },
        serverId: options.pair.serverId,
        smokePath: options.fixture.path,
        smokePaths: options.fixture.paths,
        startedAt: options.runtime.startedAt,
        status: options.status,
    };
}

function assertAllPaths(options) {
    const paths = new Set(options.entries.map(entry => entry.path));
    const missing = options.expectedPaths.filter(expectedPath => !paths.has(expectedPath));
    assertCondition(missing.length === 0, `${options.label} missing ${missing.join(', ')}`);
}

function assertCondition(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function recordCheck(options) {
    options.checks.push({ detail: options.detail, name: options.name, ok: true });
}

function normalizeEndpoint(endpoint) {
    const parsed = new URL(endpoint);
    return parsed.toString().replace(/\/$/, '');
}

function randomRunId() {
    return randomUUID().replaceAll('-', '').slice(0, SMOKE_RUN_ID_LENGTH);
}

function parseCliOptions() {
    return parseArgs({
        allowPositionals: false,
        options: {
            'bulk-file-bytes': { type: 'string' },
            'bulk-files': { type: 'string' },
            'device-name': { type: 'string' },
            endpoint: { short: 'e', type: 'string' },
            help: { short: 'h', type: 'boolean' },
            json: { type: 'boolean' },
            local: { type: 'boolean' },
            manifest: { type: 'string' },
            namespace: { short: 'n', type: 'string' },
            'pairing-token': { type: 'string' },
        },
    }).values;
}

function usageText() {
    return [
        'Usage: node tools/smoke-tt-sync-server.js --endpoint <url> --pairing-token <token> [--namespace <name>]',
        '       node tools/smoke-tt-sync-server.js --local',
        '       node tools/smoke-tt-sync-server.js --endpoint <url> --pairing-token <token> --bulk-files <count> --bulk-file-bytes <bytes>',
        '',
        'Runs a real TT-Sync v2 smoke test: status, pair, session, push, progress, pull, mtime, empty diff, devices, and history.',
        'Remote mode leaves unique smoke files in the selected namespace as deployment evidence.',
    ].join('\n');
}

async function runCli() {
    try {
        const options = parseCliOptions();
        if (options.help) {
            console.log(usageText());
            return EXIT_SUCCESS;
        }
        const report = await smokeTtSyncServer(cliInput(options));
        await writeManifest({ manifestPath: options.manifest, report });
        writeCliOutput({ json: options.json, report });
        return EXIT_SUCCESS;
    } catch (error) {
        console.error(error.message);
        return EXIT_FAILURE;
    }
}

function cliInput(options) {
    return {
        bulkFileBytes: options['bulk-file-bytes'],
        bulkFiles: options['bulk-files'],
        deviceName: options['device-name'],
        endpoint: options.endpoint,
        local: options.local,
        namespace: options.namespace,
        pairingToken: options['pairing-token'],
    };
}

async function writeManifest(options) {
    if (!options.manifestPath) {
        return;
    }
    await writeFile(options.manifestPath, `${JSON.stringify(options.report, null, JSON_INDENT)}\n`);
}

function writeCliOutput(options) {
    if (options.json) {
        console.log(JSON.stringify(options.report, null, JSON_INDENT));
        return;
    }
    console.log(formatSmokeReport(options.report));
}

function isCliEntry() {
    return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isCliEntry()) {
    process.exitCode = await runCli();
}
