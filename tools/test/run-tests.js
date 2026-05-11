import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDeviceEvidenceTemplate } from '../create-device-evidence-template.js';
import { REQUIRED_TT_SYNC_COMMANDS } from '../verify-tauritavern-tt-sync.js';
import {
    REQUIRED_DEPLOY_CHECKS,
    REQUIRED_DEVICE_CHECKS,
    REQUIRED_SMOKE_CHECKS,
    verifyIncrementalCloudSyncEvidence,
} from '../verify-incremental-cloud-sync-evidence.js';

const COMMAND_CONTRACT_DOC = new URL('../../docs/TauriTavernTtSyncCommandContract.md', import.meta.url);
const TEST_BULK_FILE_BYTES = 128;
const TEST_BULK_FILES = 3;
const TEST_MTIME_MS = 1778500000000;
const TEST_REAL_LARGE_SYNC_BYTES = 335544320;
const TEST_SYNC_DURATION_MS = 120000;
const VERIFICATION_DOC = new URL('../../docs/TauriTavernTtSyncVerification.md', import.meta.url);

const DEVICE_CHECK_FIXTURES = Object.freeze({
    androidWeakNetworkErrorVisible: {
        android: {
            capturedAt: '2026-05-12T00:03:00+08:00',
            errorCode: 'network-timeout',
            networkProfile: 'Android emulator 3G loss profile',
            operation: 'tt_sync_pull',
            visibleError: 'TT-Sync failed: network timeout',
        },
    },
    commandContractVerified: {
        contract: { commands: REQUIRED_TT_SYNC_COMMANDS, reportId: 'contract-test-report-fixture' },
        commandReport: { scannedAt: '2026-05-12T00:00:00+08:00', source: '/src/TauriTavern', sourceKind: 'source-tree' },
    },
    lanCloudSyncMutex: {
        mutex: {
            blockedOperation: 'lan_sync_start while tt_sync_push is active',
            cloudWhileLanBlockedOperation: 'tt_sync_push while lan_sync_pull is active',
            cloudWhileLanVisibleError: 'LAN sync already running',
            lanWhileCloudBlockedOperation: 'lan_sync_start while tt_sync_push is active',
            lanWhileCloudVisibleError: 'Cloud sync already running',
            visibleError: 'Cloud sync already running',
        },
    },
    liveProgressBridgeVisible: {
        progress: {
            bytesTransferred: TEST_BULK_FILES * TEST_BULK_FILE_BYTES,
            currentPath: 'default-user/chats/progress-fixture.jsonl',
            eventCount: TEST_BULK_FILES,
            filesTransferred: TEST_BULK_FILES,
            lastPhase: 'committed',
        },
    },
    phoneDesktopPairingSaved: {
        desktop: {
            restartVerifiedAt: '2026-05-12T00:02:00+08:00',
            savedServerId: 'minimal-default',
            savedServerUrl: 'https://sync.example.com',
        },
        phone: {
            restartVerifiedAt: '2026-05-12T00:02:00+08:00',
            savedServerId: 'minimal-default',
            savedServerUrl: 'https://sync.example.com',
        },
    },
    pullInterruptionSafe: {
        interruption: {
            afterHash: 'sha256-stable',
            beforeHash: 'sha256-stable',
            error: 'interrupted pull',
            path: 'default-user/chats/interrupted.jsonl',
            runId: 'pull-interruption-run-fixture',
        },
    },
    pullMtimePreserved: {
        mtime: {
            actualModifiedMs: TEST_MTIME_MS,
            expectedModifiedMs: TEST_MTIME_MS,
            path: 'default-user/chats/mtime-fixture.jsonl',
        },
    },
    realLargeFirstSyncCompleted: {
        metrics: { durationMs: TEST_SYNC_DURATION_MS, fileCount: 128, totalBytes: TEST_REAL_LARGE_SYNC_BYTES },
    },
});

const tests = [
    ['verification docs cover command contract and device fields', testVerificationDocsCoverage],
    ['incremental evidence verifier accepts complete external evidence', testCompleteEvidence],
    ['incremental evidence verifier rejects mixed command report evidence', testMixedCommandReportEvidence],
    ['incremental evidence verifier rejects untrusted command evidence', testUntrustedCommandEvidence],
    ['incremental evidence verifier rejects source commands without handler evidence', testMissingCommandHandlerEvidence],
    ['incremental evidence verifier rejects incomplete command contract coverage', testIncompleteCommandContractCoverage],
    ['incremental evidence verifier rejects missing deploy evidence', testMissingDeployEvidence],
    ['incremental evidence verifier rejects placeholder deploy evidence', testPlaceholderDeployEvidence],
    ['incremental evidence verifier rejects failed deploy required checks', testFailedDeployRequiredCheck],
    ['incremental evidence verifier rejects deploy checks without detail', testDeployCheckMissingDetail],
    ['incremental evidence verifier rejects device records without ids', testMissingDeviceIds],
    ['incremental evidence verifier rejects missing device evidence', testMissingDeviceEvidence],
    ['incremental evidence verifier rejects local smoke as final evidence', testLocalSmokeEvidence],
    ['incremental evidence verifier rejects failed smoke required checks', testFailedSmokeRequiredCheck],
    ['incremental evidence verifier rejects smoke checks without detail', testSmokeCheckMissingDetail],
    ['incremental evidence verifier rejects failed extra report checks', testFailedExtraReportCheck],
    ['incremental evidence verifier rejects invalid timestamps', testInvalidEvidenceTimestamp],
    ['incremental evidence verifier rejects deploy smoke URL mismatch', testMixedDeploySmokeEvidence],
    ['incremental evidence verifier rejects mixed server evidence', testMixedServerEvidence],
    ['incremental evidence verifier rejects saved pairing URL mismatch', testSavedPairingUrlMismatch],
    ['incremental evidence verifier rejects saved pairing id mismatch', testSavedPairingIdMismatch],
    ['incremental evidence verifier rejects undersized large sync evidence', testUndersizedLargeSyncEvidence],
    ['incremental evidence verifier rejects mtime mismatch', testMtimeMismatch],
    ['incremental evidence verifier rejects interruption hash mismatch', testInterruptionHashMismatch],
    ['incremental evidence verifier rejects missing interruption run id', testMissingInterruptionRunId],
    ['incremental evidence verifier rejects missing smoke provenance', testMissingSmokeProvenance],
    ['incremental evidence verifier rejects missing smoke status version', testMissingSmokeStatusVersion],
    ['incremental evidence verifier rejects missing smoke fixture provenance', testMissingSmokeFixtureProvenance],
    ['incremental evidence verifier rejects missing progress transfer metrics', testMissingProgressTransferMetrics],
    ['incremental evidence verifier rejects missing bidirectional mutex evidence', testMissingBidirectionalMutexEvidence],
    ['incremental evidence verifier rejects missing Android weak-network error code', testMissingAndroidWeakNetworkErrorCode],
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

async function testFailedDeployRequiredCheck() {
    const evidence = completeEvidence();
    evidence.deployReport.checks[0].ok = false;
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes(`deploy ${evidence.deployReport.checks[0].name}`));
}

async function testFailedSmokeRequiredCheck() {
    const evidence = completeEvidence();
    evidence.smokeReport.checks[0].ok = false;
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes(`smoke ${evidence.smokeReport.checks[0].name}`));
}

async function testDeployCheckMissingDetail() {
    const evidence = completeEvidence();
    evidence.deployReport.checks[0].detail = '';
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('deploy report checks passed'));
}

async function testSmokeCheckMissingDetail() {
    const evidence = completeEvidence();
    evidence.smokeReport.checks[0].detail = '';
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('smoke report checks passed'));
}

async function testFailedExtraReportCheck() {
    const evidence = completeEvidence();
    evidence.deployReport.checks.push({ detail: 'fixture', name: 'extra deploy check', ok: false });
    evidence.smokeReport.checks.push({ detail: 'fixture', name: 'extra smoke check', ok: false });
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('deploy report checks passed'));
    assert.ok(report.failed.includes('smoke report checks passed'));
}

async function testInvalidEvidenceTimestamp() {
    const evidence = completeEvidence();
    evidence.commandReport.scannedAt = 'not-a-date';
    evidence.deviceEvidence.checks.commandContractVerified.commandReport.scannedAt = 'not-a-date';
    evidence.deviceEvidence.checks.androidWeakNetworkErrorVisible.android.capturedAt = 'not-a-date';
    evidence.deviceEvidence.testedAt = 'not-a-date';
    evidence.smokeReport.completedAt = 'not-a-date';
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('command report scannedAt'));
    assert.ok(report.failed.includes('device evidence testedAt'));
    assert.ok(report.failed.includes('smoke report completedAt'));
    assert.ok(report.failed.includes('Android weak-network error is visible'));
}

async function testMixedServerEvidence() {
    const evidence = completeEvidence();
    evidence.deviceEvidence.server.url = 'https://other-sync.example.com';
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('same server URL'));
}

async function testSavedPairingUrlMismatch() {
    const evidence = completeEvidence();
    evidence.deviceEvidence.checks.phoneDesktopPairingSaved.phone.savedServerUrl = 'https://other-sync.example.com';
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('phone saved server URL matches'));
}

async function testSavedPairingIdMismatch() {
    const evidence = completeEvidence();
    evidence.deviceEvidence.checks.phoneDesktopPairingSaved.desktop.savedServerId = 'other-server-id';
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('desktop saved server id matches'));
}

async function testUndersizedLargeSyncEvidence() {
    const evidence = completeEvidence();
    evidence.deviceEvidence.checks.realLargeFirstSyncCompleted.metrics.totalBytes = TEST_BULK_FILES * TEST_BULK_FILE_BYTES;
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('real large sync byte target'));
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

async function testMissingInterruptionRunId() {
    const evidence = completeEvidence();
    delete evidence.deviceEvidence.checks.pullInterruptionSafe.interruption.runId;
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('pull interruption keeps existing local files safe'));
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

async function testMissingProgressTransferMetrics() {
    const evidence = completeEvidence();
    delete evidence.deviceEvidence.checks.liveProgressBridgeVisible.progress.bytesTransferred;
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('live progress bridge visible in TauriTavern'));
}

async function testMissingBidirectionalMutexEvidence() {
    const evidence = completeEvidence();
    delete evidence.deviceEvidence.checks.lanCloudSyncMutex.mutex.cloudWhileLanBlockedOperation;
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('LAN Sync and cloud sync are mutually exclusive'));
}

async function testMissingAndroidWeakNetworkErrorCode() {
    const evidence = completeEvidence();
    delete evidence.deviceEvidence.checks.androidWeakNetworkErrorVisible.android.errorCode;
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('Android weak-network error is visible'));
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
    evidence.deviceEvidence.checks.commandContractVerified.commandReport.sourceKind = 'build-artifact';
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('same command report source'));
    assert.ok(report.failed.includes('same command report sourceKind'));
}

async function testUntrustedCommandEvidence() {
    const evidence = completeEvidence();
    evidence.commandReport.commands[0].evidence[0].kind = 'untrusted-string';
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes(`command ${REQUIRED_TT_SYNC_COMMANDS[0]}`));
}

async function testMissingCommandHandlerEvidence() {
    const evidence = completeEvidence();
    evidence.commandReport.commands[0].evidence = [evidence.commandReport.commands[0].evidence[0]];
    let report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes(`command ${REQUIRED_TT_SYNC_COMMANDS[0]}`));

    evidence.commandReport = commandReportFixture();
    evidence.commandReport.sourceKind = 'build-artifact';
    report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes(`command ${REQUIRED_TT_SYNC_COMMANDS[0]}`));
}

async function testIncompleteCommandContractCoverage() {
    const evidence = completeEvidence();
    evidence.deviceEvidence.checks.commandContractVerified.contract.commands = REQUIRED_TT_SYNC_COMMANDS.slice(1);
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('command contract covers required commands'));
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
            evidence: [{ file: 'src-tauri/src/commands.rs', kind: 'tauri-command-declaration' }, { file: 'src-tauri/src/main.rs', kind: 'tauri-handler-registration' }],
            files: ['src-tauri/src/commands.rs', 'src-tauri/src/main.rs'],
            found: true,
            ignoredFiles: [],
            name: command,
        })),
        missingCommands: [],
        ok: true,
        scannedAt: '2026-05-12T00:00:00+08:00',
        scannedFiles: 2,
        source: '/src/TauriTavern',
        sourceKind: 'source-tree',
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
        checks: REQUIRED_SMOKE_CHECKS.map(name => ({ detail: 'fixture', name, ok: true })),
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
        serverId: 'minimal-default',
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
