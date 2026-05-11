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
    ['incremental evidence verifier rejects placeholder evidence URLs', testPlaceholderEvidenceUrls],
    ['incremental evidence verifier rejects cleartext evidence URLs', testCleartextEvidenceUrls],
    ['incremental evidence verifier rejects URL credentials and fragments', testUncleanEvidenceUrls],
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
            /mobile command report must be valid JSON/,
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
    evidence.mobileCommandReport.scannedAt = 'not-a-date';
    evidence.deviceEvidence.checks.commandContractVerified.mobileCommandReport.scannedAt = 'not-a-date';
    evidence.deviceEvidence.checks.androidWeakNetworkErrorVisible.android.capturedAt = 'not-a-date';
    evidence.deviceEvidence.testedAt = 'not-a-date';
    evidence.smokeReport.completedAt = 'not-a-date';
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('mobile command report scannedAt'));
    assert.ok(report.failed.includes('device evidence testedAt'));
    assert.ok(report.failed.includes('smoke report completedAt'));
    assert.ok(report.failed.includes('Android weak-network error is visible'));
}

async function testPlaceholderEvidenceUrls() {
    const placeholderUrls = [
        'https://sync.example.com',
        'https://sync.example.net',
        'https://sync.example.org',
        'https://sync.fixture.test',
    ];
    for (const placeholderUrl of placeholderUrls) {
        const report = await reportWithEvidenceUrl(placeholderUrl);
        assert.equal(report.ok, false);
        assert.ok(report.failed.includes('deploy report public URL is not placeholder'));
        assert.ok(report.failed.includes('smoke endpoint is not placeholder'));
        assert.ok(report.failed.includes('device evidence server URL is not placeholder'));
    }
}

async function reportWithEvidenceUrl(url) {
    const evidence = completeEvidence();
    evidence.deployReport.publicUrl = url;
    evidence.smokeReport.endpoint = url;
    evidence.deviceEvidence.server.url = url;
    evidence.deviceEvidence.checks.phoneDesktopPairingSaved.phone.savedServerUrl = url;
    evidence.deviceEvidence.checks.phoneDesktopPairingSaved.desktop.savedServerUrl = url;
    return verifyIncrementalCloudSyncEvidence(evidence);
}

async function testCleartextEvidenceUrls() {
    const report = await reportWithEvidenceUrl('http://sync-fixture.dev');
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('deploy report public URL uses HTTPS'));
    assert.ok(report.failed.includes('smoke endpoint uses HTTPS'));
    assert.ok(report.failed.includes('device evidence server URL uses HTTPS'));
}

async function testUncleanEvidenceUrls() {
    const report = await reportWithEvidenceUrl('https://user:pass@sync-fixture.dev?token=secret#frag');
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('deploy report public URL is clean'));
    assert.ok(report.failed.includes('smoke endpoint is clean'));
    assert.ok(report.failed.includes('device evidence server URL is clean'));
}

async function testMixedServerEvidence() {
    const evidence = completeEvidence();
    evidence.deviceEvidence.server.url = 'https://other-sync-fixture.dev';
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('same server URL'));
}

async function testSavedPairingUrlMismatch() {
    const evidence = completeEvidence();
    evidence.deviceEvidence.checks.phoneDesktopPairingSaved.phone.savedServerUrl = 'https://other-sync-fixture.dev';
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
