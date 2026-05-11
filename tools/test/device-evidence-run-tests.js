import assert from 'node:assert/strict';
import { createDeviceEvidenceTemplate } from '../create-device-evidence-template.js';
import { verifyIncrementalCloudSyncEvidence } from '../verify-incremental-cloud-sync-evidence.js';
import {
    completeEvidence,
    desktopCommandReportFixture,
    eventReportFixture,
    mobileCommandReportFixture,
} from './evidence-fixtures.js';

const tests = [
    ['device evidence rejects missing pre-transfer diff evidence', testMissingPreTransferDiffEvidence],
    ['device evidence rejects missing conflict resolution evidence', testMissingConflictResolutionEvidence],
    ['device evidence template copies report references', testTemplateCopiesReportReferences],
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

async function testMissingPreTransferDiffEvidence() {
    const evidence = completeEvidence();
    delete evidence.deviceEvidence.checks.preTransferDiffVisible.diff.capturedAt;
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('pre-transfer diff summary visible in plugin UI'));
}

async function testMissingConflictResolutionEvidence() {
    const evidence = completeEvidence();
    delete evidence.deviceEvidence.checks.conflictResolutionVisible.conflict.path;
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('conflict resolution visible in plugin UI'));
}

async function testTemplateCopiesReportReferences() {
    const evidence = completeEvidence();
    evidence.deviceEvidence = createDeviceEvidenceTemplate({
        desktopCommandReport: desktopCommandReportFixture(),
        eventSurfaceReport: eventReportFixture(),
        mobileCommandReport: mobileCommandReportFixture(),
    });
    const check = evidence.deviceEvidence.checks.commandContractVerified;
    assert.equal(check.ok, false);
    assertReportReference(check.mobileCommandReport, evidence.mobileCommandReport);
    assertReportReference(check.desktopCommandReport, evidence.desktopCommandReport);
    assertReportReference(check.eventSurfaceReport, evidence.eventReport);
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assertReferenceFailuresAbsent(report.failed);
}

function assertReportReference(actual, expected) {
    assert.deepEqual(actual, {
        scannedAt: expected.scannedAt,
        source: expected.source,
        sourceKind: expected.sourceKind,
    });
}

function assertReferenceFailuresAbsent(failed) {
    assert.equal(failed.some(name => name.startsWith('same mobile command report')), false);
    assert.equal(failed.some(name => name.startsWith('same desktop command report')), false);
    assert.equal(failed.some(name => name.startsWith('same event report')), false);
}
