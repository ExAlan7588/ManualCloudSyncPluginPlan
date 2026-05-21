#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { buildPairingUri } from '../server/tt-sync-server.js';
import {
    EXIT_FAILURE,
    EXIT_SUCCESS,
    isCliEntry,
    writeFormattedOutput,
    writeOptionalJsonFile,
} from './cli-helpers.js';
import { commitPlan, getFile, getJson, getProgress, postJson, pullPlan, pushPlan, putFile } from './smoke-api.js';
import { smokeFixture } from './smoke-fixture.js';
import { parseSseProgress } from './smoke-http.js';
import { cleanupRuntime, createRuntime } from './smoke-runtime.js';
import { assertAllPaths, assertCondition, formatSmokeReport, recordCheck, smokeReport } from './smoke-report.js';
export { parseSseProgress } from './smoke-http.js';

export async function smokeTtSyncServer(input = {}) {
    const runtime = await createRuntime(input);
    try {
        return await runSmoke(runtime);
    } finally {
        await cleanupRuntime(runtime);
    }
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
        await writeOptionalJsonFile({ filePath: options.manifest, value: report });
        writeFormattedOutput({ format: formatSmokeReport, json: options.json, value: report });
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

if (isCliEntry(import.meta.url)) {
    process.exitCode = await runCli();
}
