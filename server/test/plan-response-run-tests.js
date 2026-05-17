import assert from 'node:assert/strict';
import { planSummary, progressSummary } from '../lib/plan-response.js';

testPlanSummaryShape();
testCommittedProgressSummary();
testProgressSummaryIgnoresUnplannedStagedEntries();
testPlanSummaryRejectsMalformedSizeBytes();
testPlanSummaryRejectsMalformedEntryPaths();
testPlanSummaryRejectsMalformedConflicts();
testPlanSummaryRejectsMalformedKind();
testPlanSummaryRejectsMalformedArrays();
testPlanSummaryRejectsMalformedStagedMap();
console.log('ok - plan response summaries preserve response shapes');

function testPlanSummaryShape() {
    const plan = planFixture();
    const summary = planSummary(plan);
    assert.equal(summary.id, 'plan-1');
    assert.equal(summary.ok, false);
    assert.equal(summary.summary.uploadFiles, 1);
    assert.equal(summary.summary.uploadBytes, 10);
    assert.equal(summary.summary.downloadFiles, 1);
    assert.equal(summary.summary.downloadBytes, 5);
    assert.equal(summary.summary.deleteFiles, 1);
    assert.equal(summary.summary.conflictFiles, 1);
    assert.deepEqual(summary.progress, {
        bytesTransferred: 10,
        committed: false,
        currentPath: 'conflict.txt',
        filesTransferred: 1,
        partial_upload_safe: true,
        pending_files: 2,
        phase: 'transferring',
        staged_files: 1,
        totalBytes: 22,
        totalFiles: 3,
    });
}

function testCommittedProgressSummary() {
    const plan = { ...planFixture(), committedAt: '2026-05-15T00:00:00.000Z' };
    assert.deepEqual(progressSummary(plan), {
        bytesTransferred: 22,
        committed: true,
        currentPath: 'conflict.txt',
        filesTransferred: 3,
        partial_upload_safe: false,
        pending_files: 0,
        phase: 'committed',
        staged_files: 1,
        totalBytes: 22,
        totalFiles: 3,
    });
}

function testProgressSummaryIgnoresUnplannedStagedEntries() {
    const summary = progressSummary({
        ...planFixture(),
        staged: {
            'local.txt': { sizeBytes: 10 },
            'stale.txt': { sizeBytes: 100 },
        },
    });
    assert.equal(summary.bytesTransferred, 10);
    assert.equal(summary.filesTransferred, 1);
    assert.equal(summary.pending_files, 2);
    assert.equal(summary.staged_files, 1);
}

function testPlanSummaryRejectsMalformedSizeBytes() {
    assert.throws(
        () => planSummary({
            ...planFixture(),
            uploads: [{ path: 'local.txt', sizeBytes: '0x10' }],
        }),
        /Invalid plan sizeBytes/,
    );
    assert.throws(
        () => progressSummary({
            ...planFixture(),
            staged: { 'local.txt': {} },
        }),
        /Invalid plan sizeBytes/,
    );
}

function testPlanSummaryRejectsMalformedEntryPaths() {
    assert.throws(
        () => planSummary({
            ...planFixture(),
            uploads: [{ path: { value: 'local.txt' }, sizeBytes: 10 }],
        }),
        /Invalid plan uploads path/,
    );
    assert.throws(
        () => planSummary({ ...planFixture(), remoteDeletes: [''] }),
        /Invalid plan remoteDeletes path/,
    );
}

function testPlanSummaryRejectsMalformedConflicts() {
    assert.throws(
        () => planSummary({ ...planFixture(), conflicts: [{}] }),
        /Invalid plan conflicts path/,
    );
    assert.throws(
        () => planSummary({ ...planFixture(), conflicts: [{ local: 'bad', path: 'conflict.txt' }] }),
        /Invalid plan conflicts entry/,
    );
}

function testPlanSummaryRejectsMalformedKind() {
    assert.throws(
        () => planSummary({ ...planFixture(), kind: 'mirror' }),
        /Invalid plan kind/,
    );
    assert.throws(
        () => progressSummary({ ...planFixture(), kind: '' }),
        /Invalid plan kind/,
    );
}

function testPlanSummaryRejectsMalformedArrays() {
    assert.throws(
        () => planSummary({ ...planFixture(), uploads: {} }),
        /Invalid plan uploads/,
    );
    assert.throws(
        () => progressSummary({ ...planFixture(), downloads: null }),
        /Invalid plan downloads/,
    );
}

function testPlanSummaryRejectsMalformedStagedMap() {
    assert.throws(
        () => planSummary({ ...planFixture(), staged: 'local.txt' }),
        /Invalid plan staged/,
    );
    assert.throws(
        () => progressSummary({ ...planFixture(), staged: [] }),
        /Invalid plan staged/,
    );
}

function planFixture() {
    return {
        committedAt: '',
        conflicts: [{ path: 'conflict.txt' }],
        downloads: [{ path: 'remote.txt', sizeBytes: 5 }],
        id: 'plan-1',
        kind: 'push',
        localDeletes: [],
        namespace: 'default',
        remoteDeletes: ['old.txt'],
        staged: {
            'local.txt': { sizeBytes: 10 },
        },
        uploads: [
            { path: 'local.txt', sizeBytes: 10 },
            { conflict: true, path: 'conflict.txt', sizeBytes: 7 },
        ],
    };
}
