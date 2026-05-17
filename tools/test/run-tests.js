import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDeviceEvidenceTemplate } from '../create-device-evidence-template.js';
import { REQUIRED_TT_SYNC_COMMANDS } from '../verify-tauritavern-tt-sync.js';
import {
    verifyIncrementalCloudSyncEvidence,
    writeManifest,
} from '../verify-incremental-cloud-sync-evidence.js';
import {
    completeEvidence,
    desktopCommandReportFixture,
    deployReportFixture,
    deviceEvidenceFixture,
    eventReportFixture,
    smokeReportFixture,
    sourceTreeCommandReportFixture,
    TEST_BULK_FILE_BYTES,
    TEST_BULK_FILES,
    TEST_MTIME_MS,
} from './evidence-fixtures.js';

const tests = [
    ['incremental evidence verifier accepts complete external evidence', testCompleteEvidence],
    ['incremental evidence verifier writes manifest report', testFinalEvidenceManifestWritten],
    ['incremental evidence verifier labels malformed JSON input', testMalformedEvidenceJson],
    ['incremental evidence verifier labels missing JSON input', testMissingEvidenceJsonFile],
    ['incremental evidence verifier rejects missing desktop command evidence', testMissingDesktopCommandEvidence],
    ['incremental evidence verifier rejects mixed command report evidence', testMixedCommandReportEvidence],
    ['incremental evidence verifier rejects untrusted command evidence', testUntrustedCommandEvidence],
    ['incremental evidence verifier rejects source-tree command report as final evidence', testSourceTreeCommandReportEvidence],
    ['incremental evidence verifier rejects build-artifact report without build artifact evidence', testBuildArtifactEvidenceKind],
    ['incremental evidence verifier rejects incomplete command contract coverage', testIncompleteCommandContractCoverage],
    ['incremental evidence verifier rejects non-integer scanned files', testNonIntegerScannedFiles],
    ['incremental evidence verifier rejects missing event surface evidence', testMissingEventSurfaceEvidence],
    ['incremental evidence verifier rejects failed event surface report', testFailedEventSurfaceEvidence],
    ['incremental evidence verifier rejects source-file event surface evidence', testSourceFileEventSurfaceEvidence],
    ['incremental evidence verifier rejects missing diff conflict surface', testMissingDiffConflictSurface],
    ['incremental evidence verifier rejects mixed event surface evidence', testMixedEventSurfaceEvidence],
    ['incremental evidence verifier rejects missing deploy evidence', testMissingDeployEvidence],
    ['incremental evidence verifier rejects report provenance mismatch', testReportProvenanceMismatch],
    ['incremental evidence verifier rejects failed deploy report status', testFailedDeployReportStatus],
    ['incremental evidence verifier rejects placeholder deploy evidence', testPlaceholderDeployEvidence],
    ['incremental evidence verifier rejects template deploy paths', testTemplateDeployPaths],
    ['incremental evidence verifier rejects failed deploy required checks', testFailedDeployRequiredCheck],
    ['incremental evidence verifier rejects deploy checks without detail', testDeployCheckMissingDetail],
    ['incremental evidence verifier rejects device records without ids', testMissingDeviceIds],
    ['incremental evidence verifier rejects missing device evidence', testMissingDeviceEvidence],
    ['incremental evidence verifier rejects local smoke as final evidence', testLocalSmokeEvidence],
    ['incremental evidence verifier rejects failed smoke report status', testFailedSmokeReportStatus],
    ['incremental evidence verifier rejects failed smoke required checks', testFailedSmokeRequiredCheck],
    ['incremental evidence verifier rejects smoke checks without detail', testSmokeCheckMissingDetail],
    ['incremental evidence verifier rejects failed extra report checks', testFailedExtraReportCheck],
    ['incremental evidence verifier rejects invalid timestamps', testInvalidEvidenceTimestamp],
    ['incremental evidence verifier rejects undersized large sync evidence', testUndersizedLargeSyncEvidence],
    ['incremental evidence verifier rejects malformed large sync byte evidence', testMalformedLargeSyncByteEvidence],
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

async function testCompleteEvidence() {
    const report = await verifyIncrementalCloudSyncEvidence(completeEvidence());
    assert.equal(report.ok, true);
    assert.deepEqual(report.failed, []);
}

async function testFinalEvidenceManifestWritten() {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'tt-sync-final-report-'));
    try {
        const manifestPath = path.join(tempDir, 'final-report.json');
        const report = await verifyIncrementalCloudSyncEvidence(completeEvidence());
        await writeManifest({ manifestPath, report });
        const saved = JSON.parse(await readFile(manifestPath, 'utf8'));
        assert.equal(saved.ok, true);
        assert.equal(saved.verifiedAt, report.verifiedAt);
    } finally {
        await rm(tempDir, { force: true, recursive: true });
    }
}

async function testMalformedEvidenceJson() {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'tt-sync-evidence-json-'));
    try {
        const mobileCommandReportPath = path.join(tempDir, 'mobile-command-report.json');
        await writeFile(mobileCommandReportPath, `${String.fromCharCode(123)} broken`);
        await assert.rejects(
            verifyIncrementalCloudSyncEvidence({
                desktopCommandReport: desktopCommandReportFixture(),
                deployReport: deployReportFixture(),
                deviceEvidence: deviceEvidenceFixture(),
                eventReport: eventReportFixture(),
                mobileCommandReportPath,
                smokeReport: smokeReportFixture(),
            }),
            /mobile command report must be valid JSON: Expected property name/,
        );
    } finally {
        await rm(tempDir, { force: true, recursive: true });
    }
}

async function testMissingEvidenceJsonFile() {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'tt-sync-missing-evidence-'));
    try {
        await assert.rejects(
            verifyIncrementalCloudSyncEvidence({
                desktopCommandReport: desktopCommandReportFixture(),
                deployReport: deployReportFixture(),
                deviceEvidence: deviceEvidenceFixture(),
                eventReport: eventReportFixture(),
                mobileCommandReportPath: path.join(tempDir, 'missing-command-report.json'),
                smokeReport: smokeReportFixture(),
            }),
            /mobile command report cannot be read:/,
        );
    } finally {
        await rm(tempDir, { force: true, recursive: true });
    }
}

async function testMissingDesktopCommandEvidence() {
    const evidence = completeEvidence();
    delete evidence.desktopCommandReport;
    await assert.rejects(
        verifyIncrementalCloudSyncEvidence(evidence),
        /desktop command report path is required/,
    );
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

async function testFailedDeployRequiredCheck() {
    const evidence = completeEvidence();
    evidence.deployReport.checks[0].ok = false;
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes(`deploy ${evidence.deployReport.checks[0].name}`));
}

async function testFailedDeployReportStatus() {
    const evidence = completeEvidence();
    evidence.deployReport.ok = false;
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('deploy report ok'));
}

async function testReportProvenanceMismatch() {
    const evidence = completeEvidence();
    evidence.mobileCommandReport.tool = 'manual-json';
    evidence.mobileCommandReport.schemaVersion = 2;
    evidence.desktopCommandReport.tool = 'manual-json';
    evidence.desktopCommandReport.schemaVersion = 2;
    evidence.eventReport.tool = 'manual-json';
    evidence.eventReport.schemaVersion = 2;
    evidence.deployReport.tool = 'manual-json';
    evidence.deployReport.schemaVersion = 2;
    evidence.smokeReport.tool = 'manual-json';
    evidence.smokeReport.schemaVersion = 2;
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('mobile command report tool'));
    assert.ok(report.failed.includes('mobile command report schema version'));
    assert.ok(report.failed.includes('desktop command report tool'));
    assert.ok(report.failed.includes('desktop command report schema version'));
    assert.ok(report.failed.includes('event surface report tool'));
    assert.ok(report.failed.includes('event surface report schema version'));
    assert.ok(report.failed.includes('deploy report tool'));
    assert.ok(report.failed.includes('deploy report schema version'));
    assert.ok(report.failed.includes('smoke report tool'));
    assert.ok(report.failed.includes('smoke report schema version'));
}

async function testFailedSmokeRequiredCheck() {
    const evidence = completeEvidence();
    evidence.smokeReport.checks[0].ok = false;
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes(`smoke ${evidence.smokeReport.checks[0].name}`));
}

async function testFailedSmokeReportStatus() {
    const evidence = completeEvidence();
    evidence.smokeReport.ok = false;
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('smoke report ok'));
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
    evidence.mobileCommandReport.scannedAt = '0';
    evidence.deviceEvidence.checks.commandContractVerified.mobileCommandReport.scannedAt = '0';
    evidence.eventReport.scannedAt = '0';
    evidence.deviceEvidence.checks.commandContractVerified.eventSurfaceReport.scannedAt = '0';
    evidence.deployReport.verifiedAt = '0';
    evidence.deviceEvidence.checks.androidWeakNetworkErrorVisible.android.capturedAt = '0';
    evidence.deviceEvidence.testedAt = '0';
    evidence.smokeReport.completedAt = '0';
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('mobile command report scannedAt'));
    assert.ok(report.failed.includes('event surface report scannedAt'));
    assert.ok(report.failed.includes('deploy report verifiedAt'));
    assert.ok(report.failed.includes('device evidence testedAt'));
    assert.ok(report.failed.includes('smoke report completedAt'));
    assert.ok(report.failed.includes('Android weak-network error is visible'));
}

async function testUndersizedLargeSyncEvidence() {
    const evidence = completeEvidence();
    evidence.deviceEvidence.checks.realLargeFirstSyncCompleted.metrics.totalBytes = TEST_BULK_FILES * TEST_BULK_FILE_BYTES;
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('real large sync byte target'));
}

async function testMalformedLargeSyncByteEvidence() {
    const evidence = completeEvidence();
    evidence.deviceEvidence.checks.realLargeFirstSyncCompleted.metrics.totalBytes = '0x14000000';
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

async function testMissingDeployEvidence() {
    const evidence = completeEvidence();
    delete evidence.deployReport;
    await assert.rejects(
        verifyIncrementalCloudSyncEvidence(evidence),
        /deploy report path is required/,
    );
}

async function testMissingEventSurfaceEvidence() {
    const evidence = completeEvidence();
    delete evidence.eventReport;
    await assert.rejects(
        verifyIncrementalCloudSyncEvidence(evidence),
        /event surface report path is required/,
    );
}

async function testFailedEventSurfaceEvidence() {
    const evidence = completeEvidence();
    evidence.eventReport.ok = false;
    evidence.eventReport.missingEvents = ['tt_sync:error'];
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('event surface report ok'));
    assert.ok(report.failed.includes('event surface missing events'));
}

async function testSourceFileEventSurfaceEvidence() {
    const evidence = completeEvidence();
    evidence.eventReport.sourceKind = 'source-file';
    evidence.eventReport.source = '/src/TauriTavern/src-tauri/src/domain/models/tt_sync.rs';
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('event surface report is source tree'));
}

async function testMissingDiffConflictSurface() {
    const evidence = completeEvidence();
    evidence.eventReport.diffConflictSurface.preTransferDiffEvent = {
        files: [],
        found: false,
        name: 'preTransferDiffEvent',
    };
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('event surface preTransferDiffEvent'));
}

async function testMixedEventSurfaceEvidence() {
    const evidence = completeEvidence();
    evidence.deviceEvidence.checks.commandContractVerified.eventSurfaceReport.source = '/src/other-tauritavern';
    evidence.deviceEvidence.checks.commandContractVerified.eventSurfaceReport.sourceKind = 'source-file';
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('same event report source'));
    assert.ok(report.failed.includes('same event report sourceKind'));
}

async function testMixedCommandReportEvidence() {
    const evidence = completeEvidence();
    evidence.deviceEvidence.checks.commandContractVerified.mobileCommandReport.source = '/builds/other.apk';
    evidence.deviceEvidence.checks.commandContractVerified.mobileCommandReport.sourceKind = 'source-tree';
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('same mobile command report source'));
    assert.ok(report.failed.includes('same mobile command report sourceKind'));
}

async function testUntrustedCommandEvidence() {
    const evidence = completeEvidence();
    evidence.mobileCommandReport.commands[0].evidence[0].kind = 'untrusted-string';
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes(`mobile command ${REQUIRED_TT_SYNC_COMMANDS[0]}`));
}

async function testSourceTreeCommandReportEvidence() {
    const evidence = completeEvidence();
    evidence.mobileCommandReport = sourceTreeCommandReportFixture();
    evidence.deviceEvidence.checks.commandContractVerified.mobileCommandReport = {
        scannedAt: evidence.mobileCommandReport.scannedAt,
        source: evidence.mobileCommandReport.source,
        sourceKind: evidence.mobileCommandReport.sourceKind,
    };
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('mobile command report is build artifact'));
}

async function testBuildArtifactEvidenceKind() {
    const evidence = completeEvidence();
    evidence.mobileCommandReport.commands[0].evidence = [
        { file: 'src-tauri/src/commands.rs', kind: 'tauri-command-declaration' },
        { file: 'src-tauri/src/main.rs', kind: 'tauri-handler-registration' },
    ];
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes(`mobile command ${REQUIRED_TT_SYNC_COMMANDS[0]}`));
}

async function testIncompleteCommandContractCoverage() {
    const evidence = completeEvidence();
    evidence.deviceEvidence.checks.commandContractVerified.contract.commands = REQUIRED_TT_SYNC_COMMANDS.slice(1);
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('command contract covers required commands'));
}

async function testNonIntegerScannedFiles() {
    const evidence = completeEvidence();
    evidence.mobileCommandReport.scannedFiles = true;
    evidence.eventReport.scannedFiles = true;
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('mobile command report scanned files'));
    assert.ok(report.failed.includes('event surface report scanned files'));
}

async function testPlaceholderDeployEvidence() {
    const evidence = completeEvidence();
    evidence.deployReport.allowPlaceholders = true;
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('deploy report real env mode'));
}

async function testTemplateDeployPaths() {
    const evidence = completeEvidence();
    evidence.deployReport.envPath = 'deploy/systemd/manual-cloud-tt-sync.env.example';
    evidence.deployReport.servicePath = 'deploy/systemd/manual-cloud-tt-sync.service';
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('deploy report real env path'));
    assert.ok(report.failed.includes('deploy report real service path'));
}

async function testMissingDeviceIds() {
    const evidence = completeEvidence();
    delete evidence.deviceEvidence.devices[0].deviceId;
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('device coverage'));
}
