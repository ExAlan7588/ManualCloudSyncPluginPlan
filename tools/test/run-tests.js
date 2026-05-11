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
const TEST_BULK_FILE_BYTES = 128;
const TEST_BULK_FILES = 3;
const TEST_MTIME_MS = 1778500000000;
const TEST_SYNC_DURATION_MS = 120000;

const DEVICE_CHECK_FIXTURES = Object.freeze({
    androidWeakNetworkErrorVisible: {
        android: { networkProfile: 'Android emulator 3G loss profile', visibleError: 'TT-Sync failed: network timeout' },
    },
    commandContractVerified: {
        commandReport: { scannedAt: '2026-05-12T00:00:00+08:00', source: '/builds/TauriTavern.apk' },
    },
    lanCloudSyncMutex: {
        mutex: { blockedOperation: 'lan_sync_start while tt_sync_push is active', visibleError: 'Cloud sync already running' },
    },
    liveProgressBridgeVisible: {
        progress: { eventCount: TEST_BULK_FILES, lastPhase: 'committed' },
    },
    phoneDesktopPairingSaved: {
        desktop: { savedServerId: 'desktop-server-fixture' },
        phone: { savedServerId: 'phone-server-fixture' },
    },
    pullInterruptionSafe: {
        interruption: { afterHash: 'sha256-after', beforeHash: 'sha256-before', error: 'interrupted pull' },
    },
    pullMtimePreserved: {
        mtime: { actualModifiedMs: TEST_MTIME_MS, expectedModifiedMs: TEST_MTIME_MS },
    },
    realLargeFirstSyncCompleted: {
        metrics: { durationMs: TEST_SYNC_DURATION_MS, fileCount: TEST_BULK_FILES, totalBytes: TEST_BULK_FILES * TEST_BULK_FILE_BYTES },
    },
});

const tests = [
    ['server smoke verifier passes against explicit local server', testLocalSmoke],
    ['server smoke verifier supports bulk fixture', testBulkSmokeFixture],
    ['server smoke verifier requires endpoint or local mode', testRequiresTarget],
    ['server smoke verifier requires remote pairing token', testRequiresRemotePairingToken],
    ['incremental evidence verifier accepts complete external evidence', testCompleteEvidence],
    ['incremental evidence verifier rejects missing device evidence', testMissingDeviceEvidence],
    ['incremental evidence verifier rejects local smoke as final evidence', testLocalSmokeEvidence],
    ['incremental evidence verifier rejects mixed server evidence', testMixedServerEvidence],
    ['incremental evidence verifier rejects missing smoke provenance', testMissingSmokeProvenance],
    ['incremental evidence verifier rejects missing smoke fixture provenance', testMissingSmokeFixtureProvenance],
    ['incremental evidence verifier rejects missing device structured fields', testMissingDeviceStructuredFields],
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

async function testBulkSmokeFixture() {
    const report = await smokeTtSyncServer({
        bulkFileBytes: TEST_BULK_FILE_BYTES,
        bulkFiles: TEST_BULK_FILES,
        local: true,
    });
    assert.equal(report.fixture.fileCount, TEST_BULK_FILES);
    assert.equal(report.fixture.totalBytes, TEST_BULK_FILES * TEST_BULK_FILE_BYTES);
    assert.equal(report.smokePaths.length, TEST_BULK_FILES);
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

async function testMixedServerEvidence() {
    const evidence = completeEvidence();
    evidence.deviceEvidence.server.url = 'https://other-sync.example.com';
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('same server URL'));
}

async function testMissingSmokeProvenance() {
    const evidence = completeEvidence();
    delete evidence.smokeReport.planIds;
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('smoke report plan ids'));
}

async function testMissingSmokeFixtureProvenance() {
    const evidence = completeEvidence();
    delete evidence.smokeReport.fixture;
    delete evidence.smokeReport.smokePaths;
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('smoke report fixture files'));
    assert.ok(report.failed.includes('smoke report fixture paths'));
}

async function testMissingDeviceStructuredFields() {
    const evidence = completeEvidence();
    delete evidence.deviceEvidence.checks.pullMtimePreserved.mtime;
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('pull preserves local filesystem mtime'));
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
        scannedAt: '2026-05-12T00:00:00+08:00',
        scannedFiles: 1,
        source: '/builds/TauriTavern.apk',
    };
}

function smokeReportFixture() {
    const smokePath = 'default-user/chats/tt-sync-smoke-fixture.jsonl';
    return {
        checks: REQUIRED_SMOKE_CHECKS.map(name => ({ detail: 'fixture', name })),
        completedAt: '2026-05-12T00:01:00+08:00',
        deviceId: 'device-fixture',
        endpoint: 'https://sync.example.com',
        fixture: {
            fileCount: TEST_BULK_FILES,
            totalBytes: TEST_BULK_FILES * TEST_BULK_FILE_BYTES,
        },
        mode: 'remote',
        ok: true,
        planIds: {
            pull: 'pull-plan-fixture',
            push: 'push-plan-fixture',
        },
        smokePath,
        smokePaths: [smokePath],
    };
}

function deviceEvidenceFixture() {
    return {
        checks: Object.fromEntries(REQUIRED_DEVICE_CHECKS.map(deviceCheckEntry)),
        devices: [
            { model: 'Pixel', platform: 'Android 15' },
            { model: 'Workstation', platform: 'Linux desktop' },
        ],
        server: {
            url: 'https://sync.example.com',
        },
        tauriTavern: {
            desktopBuildId: 'desktop-build-fixture',
            mobileBuildId: 'mobile-build-fixture',
        },
        testedAt: '2026-05-12T00:00:00+08:00',
    };
}

function deviceCheckEntry(item) {
    const [key, label] = item;
    return [key, { evidence: `${label} evidence`, ok: true, ...DEVICE_CHECK_FIXTURES[key] }];
}

function restorePairingToken(previousToken) {
    if (previousToken === undefined) {
        delete process.env[PAIRING_TOKEN_ENV];
        return;
    }
    process.env[PAIRING_TOKEN_ENV] = previousToken;
}
