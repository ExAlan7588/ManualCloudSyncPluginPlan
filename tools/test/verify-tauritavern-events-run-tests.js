import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
    REQUIRED_TT_SYNC_EVENTS,
    REQUIRED_TT_SYNC_EVENT_FIELDS,
    verifyTauriTavernTtSyncEventSurface,
} from '../verify-tauritavern-tt-sync-events.js';

const LISTENER_PATH = 'src/scripts/tauri/setting/setting-panel/sync-listeners.js';
const MODEL_PATH = 'src-tauri/src/domain/models/tt_sync.rs';

const tests = [
    ['TauriTavern event verifier accepts required events and fields', testVerifierAcceptsEvents],
    ['TauriTavern event verifier reports absent diff conflict surface', testVerifierReportsMissingDiffConflictSurface],
    ['TauriTavern event verifier rejects missing required event', testVerifierRejectsMissingEvent],
    ['TauriTavern event verifier rejects missing payload field', testVerifierRejectsMissingField],
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

async function testVerifierAcceptsEvents() {
    await withEventFixture(async root => {
        await writeEventFixture({ root });
        const report = await verifyTauriTavernTtSyncEventSurface({ source: root });
        assert.equal(report.ok, true);
        assert.deepEqual(report.missingEvents, []);
        assert.deepEqual(report.missingPayloadFields, []);
    });
}

async function testVerifierReportsMissingDiffConflictSurface() {
    await withEventFixture(async root => {
        await writeEventFixture({ root });
        const report = await verifyTauriTavernTtSyncEventSurface({ source: root });
        assert.equal(report.diffConflictSurface.preTransferDiffEvent.found, false);
        assert.equal(report.diffConflictSurface.conflictEvent.found, false);
        assert.equal(report.diffConflictSurface.conflictDecisionPayload.found, false);
    });
}

async function testVerifierRejectsMissingEvent() {
    await withEventFixture(async root => {
        const events = REQUIRED_TT_SYNC_EVENTS.filter(name => name !== 'tt_sync:error');
        await writeEventFixture({ events, root });
        const report = await verifyTauriTavernTtSyncEventSurface({ source: root });
        assert.equal(report.ok, false);
        assert.deepEqual(report.missingEvents, ['tt_sync:error']);
    });
}

async function testVerifierRejectsMissingField() {
    await withEventFixture(async root => {
        const fields = {
            completed: REQUIRED_TT_SYNC_EVENT_FIELDS.completed,
            progress: REQUIRED_TT_SYNC_EVENT_FIELDS.progress.filter(name => name !== 'current_path'),
        };
        await writeEventFixture({ fields, root });
        const report = await verifyTauriTavernTtSyncEventSurface({ source: root });
        assert.equal(report.ok, false);
        assert.ok(report.missingPayloadFields.includes('progress.current_path'));
    });
}

async function withEventFixture(callback) {
    const root = await mkdtemp(path.join(tmpdir(), 'tt-sync-events-'));
    try {
        await callback(root);
    } finally {
        await rm(root, { force: true, recursive: true });
    }
}

async function writeEventFixture(options) {
    const events = options.events || REQUIRED_TT_SYNC_EVENTS;
    const fields = options.fields || REQUIRED_TT_SYNC_EVENT_FIELDS;
    await writeFixtureFile({ content: listenerSourceFor(events), relativePath: LISTENER_PATH, root: options.root });
    await writeFixtureFile({ content: modelSourceFor(fields), relativePath: MODEL_PATH, root: options.root });
}

async function writeFixtureFile(options) {
    const filePath = path.join(options.root, options.relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, options.content);
}

function listenerSourceFor(events) {
    return events.map(eventName => `await listen('${eventName}', () => {});\n`).join('');
}

function modelSourceFor(fields) {
    return [
        structSourceFor('TtSyncProgressEvent', fields.progress),
        structSourceFor('TtSyncCompletedEvent', fields.completed),
    ].join('\n');
}

function structSourceFor(name, fields) {
    const body = fields.map(field => `    pub ${field}: String,`).join('\n');
    return `pub struct ${name} {\n${body}\n}`;
}
