import assert from 'node:assert/strict';
import { createDeviceEvidenceTemplate } from '../create-device-evidence-template.js';
import { smokeTtSyncServer } from '../smoke-tt-sync-server.js';
import { REQUIRED_TT_SYNC_COMMANDS } from '../verify-tauritavern-tt-sync.js';
import {
    REQUIRED_DEVICE_CHECKS,
    REQUIRED_SMOKE_CHECKS,
    verifyIncrementalCloudSyncEvidence,
} from '../verify-incremental-cloud-sync-evidence.js';

const PAIRING_TOKEN_ENV = 'TT_SYNC_PAIRING_TOKEN';

const tests = [
    ['server smoke verifier passes against explicit local server', testLocalSmoke],
    ['server smoke verifier requires endpoint or local mode', testRequiresTarget],
    ['server smoke verifier requires remote pairing token', testRequiresRemotePairingToken],
    ['incremental evidence verifier accepts complete external evidence', testCompleteEvidence],
    ['incremental evidence verifier rejects missing device evidence', testMissingDeviceEvidence],
    ['incremental evidence verifier rejects local smoke as final evidence', testLocalSmokeEvidence],
    ['device evidence template starts incomplete', testDeviceEvidenceTemplateIncomplete],
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

async function testLocalSmoke() {
    const previousToken = process.env[PAIRING_TOKEN_ENV];
    process.env[PAIRING_TOKEN_ENV] = 'preserve-this-token';
    const report = await smokeTtSyncServer({ local: true }).finally(() => {
        assert.equal(process.env[PAIRING_TOKEN_ENV], 'preserve-this-token');
        restorePairingToken(previousToken);
    });
    assert.equal(report.ok, true);
    assert.equal(report.mode, 'local');
    assert.match(report.endpoint, /^http:\/\/127\.0\.0\.1:/);
    assert.match(report.namespace, /^smoke-/);
    assert.match(report.smokePath, /^default-user\/chats\/tt-sync-smoke-/);
    assertCheckNames(report);
}

async function testRequiresTarget() {
    await assert.rejects(
        smokeTtSyncServer({ pairingToken: 'token-without-endpoint' }),
        /Either --endpoint <url> or --local is required/,
    );
}

async function testRequiresRemotePairingToken() {
    const previousToken = process.env[PAIRING_TOKEN_ENV];
    delete process.env[PAIRING_TOKEN_ENV];
    try {
        await assert.rejects(
            smokeTtSyncServer({ endpoint: 'http://127.0.0.1:9' }),
            /--pairing-token or TT_SYNC_PAIRING_TOKEN is required/,
        );
    } finally {
        restorePairingToken(previousToken);
    }
}

function assertCheckNames(report) {
    const names = report.checks.map(check => check.name);
    assert.deepEqual(names, [
        'status',
        'pair',
        'session',
        'progress planned',
        'progress transferring',
        'progress committed',
        'push commit',
        'pull mtime header',
        'empty diff',
        'device history',
    ]);
}

async function testCompleteEvidence() {
    const report = await verifyIncrementalCloudSyncEvidence(completeEvidence());
    assert.equal(report.ok, true);
    assert.deepEqual(report.failed, []);
}

async function testMissingDeviceEvidence() {
    const evidence = completeEvidence();
    delete evidence.deviceEvidence.checks.pullInterruptionSafe;
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('pull interruption keeps existing local files safe'));
}

async function testLocalSmokeEvidence() {
    const evidence = completeEvidence();
    evidence.smokeReport.mode = 'local';
    evidence.smokeReport.endpoint = 'http://127.0.0.1:8787';
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('smoke report is remote'));
    assert.ok(report.failed.includes('smoke endpoint is non-local'));
}

async function testDeviceEvidenceTemplateIncomplete() {
    const template = createDeviceEvidenceTemplate({
        desktopBuildId: 'desktop-build-fixture',
        mobileBuildId: 'mobile-build-fixture',
    });
    assert.equal(Object.values(template.checks).every(item => item.ok === false), true);
    const evidence = completeEvidence();
    evidence.deviceEvidence = template;
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('real large first sync completed'));
}

function completeEvidence() {
    return {
        commandReport: commandReportFixture(),
        deviceEvidence: deviceEvidenceFixture(),
        smokeReport: smokeReportFixture(),
    };
}

function commandReportFixture() {
    return {
        commands: REQUIRED_TT_SYNC_COMMANDS.map(command => ({ files: ['src-tauri/src/commands.rs'], found: true, name: command })),
        missingCommands: [],
        ok: true,
    };
}

function smokeReportFixture() {
    return {
        checks: REQUIRED_SMOKE_CHECKS.map(name => ({ detail: 'fixture', name })),
        endpoint: 'https://sync.example.com',
        mode: 'remote',
        ok: true,
    };
}

function deviceEvidenceFixture() {
    return {
        checks: Object.fromEntries(REQUIRED_DEVICE_CHECKS.map(deviceCheckEntry)),
        devices: [
            { model: 'Pixel', platform: 'Android 15' },
            { model: 'Workstation', platform: 'Linux desktop' },
        ],
        tauriTavern: {
            desktopBuildId: 'desktop-build-fixture',
            mobileBuildId: 'mobile-build-fixture',
        },
        testedAt: '2026-05-12T00:00:00+08:00',
    };
}

function deviceCheckEntry(item) {
    const [key, label] = item;
    return [key, { evidence: `${label} evidence`, ok: true }];
}

function restorePairingToken(previousToken) {
    if (previousToken === undefined) {
        delete process.env[PAIRING_TOKEN_ENV];
        return;
    }
    process.env[PAIRING_TOKEN_ENV] = previousToken;
}
