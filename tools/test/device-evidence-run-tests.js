import assert from 'node:assert/strict';
import { verifyIncrementalCloudSyncEvidence } from '../verify-incremental-cloud-sync-evidence.js';
import { completeEvidence } from './evidence-fixtures.js';

const tests = [
    ['device evidence rejects missing pre-transfer diff evidence', testMissingPreTransferDiffEvidence],
    ['device evidence rejects missing conflict resolution evidence', testMissingConflictResolutionEvidence],
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
