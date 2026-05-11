import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDeviceEvidenceTemplate } from '../create-device-evidence-template.js';
import { smokeTtSyncServer } from '../smoke-tt-sync-server.js';
import { verifyTtSyncDeploy } from '../verify-tt-sync-deploy.js';
import { REQUIRED_TT_SYNC_COMMANDS } from '../verify-tauritavern-tt-sync.js';
import {
    REQUIRED_DEPLOY_CHECKS,
    REQUIRED_DEVICE_CHECKS,
    REQUIRED_SMOKE_CHECKS,
    verifyIncrementalCloudSyncEvidence,
} from '../verify-incremental-cloud-sync-evidence.js';

const PAIRING_TOKEN_ENV = 'TT_SYNC_PAIRING_TOKEN';
const COMMAND_CONTRACT_DOC = new URL('../../docs/TauriTavernTtSyncCommandContract.md', import.meta.url);
const TEST_BULK_FILE_BYTES = 128;
const TEST_BULK_FILES = 3;
const TEST_MTIME_MS = 1778500000000;
const TEST_SYNC_DURATION_MS = 120000;
const VERIFICATION_DOC = new URL('../../docs/TauriTavernTtSyncVerification.md', import.meta.url);

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
        interruption: { afterHash: 'sha256-stable', beforeHash: 'sha256-stable', error: 'interrupted pull' },
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
    ['deploy verifier accepts repo template placeholders explicitly', testDeployVerifierTemplate],
    ['deploy verifier rejects placeholder token for real env', testDeployVerifierRejectsPlaceholderToken],
    ['verification docs cover command contract and device fields', testVerificationDocsCoverage],
    ['incremental evidence verifier accepts complete external evidence', testCompleteEvidence],
    ['incremental evidence verifier rejects mixed command report evidence', testMixedCommandReportEvidence],
    ['incremental evidence verifier rejects untrusted command evidence', testUntrustedCommandEvidence],
    ['incremental evidence verifier rejects missing deploy evidence', testMissingDeployEvidence],
    ['incremental evidence verifier rejects placeholder deploy evidence', testPlaceholderDeployEvidence],
    ['incremental evidence verifier rejects device records without ids', testMissingDeviceIds],
    ['incremental evidence verifier rejects missing device evidence', testMissingDeviceEvidence],
    ['incremental evidence verifier rejects local smoke as final evidence', testLocalSmokeEvidence],
    ['incremental evidence verifier rejects deploy smoke URL mismatch', testMixedDeploySmokeEvidence],
    ['incremental evidence verifier rejects mixed server evidence', testMixedServerEvidence],
    ['incremental evidence verifier rejects mtime mismatch', testMtimeMismatch],
    ['incremental evidence verifier rejects interruption hash mismatch', testInterruptionHashMismatch],
    ['incremental evidence verifier rejects missing smoke provenance', testMissingSmokeProvenance],
    ['incremental evidence verifier rejects missing smoke status version', testMissingSmokeStatusVersion],
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

async function testDeployVerifierTemplate() {
    const report = await verifyTtSyncDeploy({ allowPlaceholders: true });
    assert.equal(report.ok, true);
    assert.deepEqual(report.failed, []);
}

async function testDeployVerifierRejectsPlaceholderToken() {
    const report = await verifyTtSyncDeploy();
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('env pairing token is not placeholder'));
}

async function testVerificationDocsCoverage() {
    const contract = await readFile(COMMAND_CONTRACT_DOC, 'utf8');
    const verification = await readFile(VERIFICATION_DOC, 'utf8');
    assert.ok(verification.includes('--deploy'), 'final evidence deploy input missing from verification doc');
    assert.ok(verification.includes('--allow-placeholders'), 'deploy placeholder policy missing from verification doc');
    for (const command of REQUIRED_TT_SYNC_COMMANDS) {
        assert.ok(contract.includes(command), `${command} missing from command contract doc`);
    }
    for (const item of REQUIRED_DEVICE_CHECKS) {
        assertDeviceRequirementDocumented({ item, verification });
    }
}

function assertDeviceRequirementDocumented(options) {
    const [key, _label, fieldSpecs] = options.item;
    assert.ok(options.verification.includes(key), `${key} missing from verification doc`);
    for (const fieldSpec of fieldSpecs) {
        assert.ok(options.verification.includes(fieldSpec[0]), `${fieldSpec[0]} missing from verification doc`);
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

async function testMixedDeploySmokeEvidence() {
    const evidence = completeEvidence();
    evidence.deployReport.publicUrl = 'https://deploy-other.example.com';
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('deploy and smoke same URL'));
}

async function testMixedServerEvidence() {
    const evidence = completeEvidence();
    evidence.deviceEvidence.server.url = 'https://other-sync.example.com';
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('same server URL'));
}

async function testMtimeMismatch() {
    const evidence = completeEvidence();
    evidence.deviceEvidence.checks.pullMtimePreserved.mtime.actualModifiedMs = TEST_MTIME_MS + 1;
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('pull mtime values match'));
}

async function testInterruptionHashMismatch() {
    const evidence = completeEvidence();
    evidence.deviceEvidence.checks.pullInterruptionSafe.interruption.afterHash = 'sha256-changed';
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('interruption hash unchanged'));
}

async function testMissingSmokeProvenance() {
    const evidence = completeEvidence();
    delete evidence.smokeReport.planIds;
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('smoke report plan ids'));
}

async function testMissingSmokeStatusVersion() {
    const evidence = completeEvidence();
    delete evidence.smokeReport.status.version;
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('smoke status version'));
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
        deployReport: deployReportFixture(),
        deviceEvidence: deviceEvidenceFixture(),
        smokeReport: smokeReportFixture(),
    };
}

async function testMissingDeployEvidence() {
    const evidence = completeEvidence();
    delete evidence.deployReport;
    await assert.rejects(
        verifyIncrementalCloudSyncEvidence(evidence),
        /deploy report path is required/,
    );
}

async function testMixedCommandReportEvidence() {
    const evidence = completeEvidence();
    evidence.deviceEvidence.checks.commandContractVerified.commandReport.source = '/builds/other.apk';
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('same command report source'));
}

async function testUntrustedCommandEvidence() {
    const evidence = completeEvidence();
    evidence.commandReport.commands[0].evidence[0].kind = 'untrusted-string';
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes(`command ${REQUIRED_TT_SYNC_COMMANDS[0]}`));
}

async function testPlaceholderDeployEvidence() {
    const evidence = completeEvidence();
    evidence.deployReport.allowPlaceholders = true;
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('deploy report real env mode'));
}

async function testMissingDeviceIds() {
    const evidence = completeEvidence();
    delete evidence.deviceEvidence.devices[0].deviceId;
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('device coverage'));
}

function commandReportFixture() {
    return {
        commands: REQUIRED_TT_SYNC_COMMANDS.map(command => ({
            evidence: [{ file: 'src-tauri/src/commands.rs', kind: 'tauri-command-declaration' }],
            files: ['src-tauri/src/commands.rs'],
            found: true,
            ignoredFiles: [],
            name: command,
        })),
        missingCommands: [],
        ok: true,
        scannedAt: '2026-05-12T00:00:00+08:00',
        scannedFiles: 1,
        source: '/builds/TauriTavern.apk',
    };
}

function deployReportFixture() {
    return {
        allowPlaceholders: false,
        checks: REQUIRED_DEPLOY_CHECKS.map(name => ({ detail: 'fixture', name, ok: true })),
        envPath: '/etc/manual-cloud-tt-sync.env',
        ok: true,
        publicUrl: 'https://sync.example.com',
        servicePath: '/etc/systemd/system/manual-cloud-tt-sync.service',
        verifiedAt: '2026-05-12T00:00:30+08:00',
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
        status: {
            ok: true,
            service: 'minimal-tt-sync',
            version: '1.0.0',
        },
    };
}

function deviceEvidenceFixture() {
    return {
        checks: Object.fromEntries(REQUIRED_DEVICE_CHECKS.map(deviceCheckEntry)),
        devices: [
            { deviceId: 'android-device-fixture', model: 'Pixel', platform: 'Android 15' },
            { deviceId: 'desktop-device-fixture', model: 'Workstation', platform: 'Linux desktop' },
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
