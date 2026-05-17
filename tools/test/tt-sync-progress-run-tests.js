import assert from 'node:assert/strict';
import { createProgressTracker, progressRows, resetProgressTracker } from '../../modules/tt-sync-progress.js';
import { progressStatus } from '../../modules/tt-sync-view.js';

testProgressRowsRejectMalformedTextValues();
testProgressRowsKeepsLastValidSnapshotAfterMalformedNumericEvent();
testProgressRowsKeepsLastValidSnapshotAfterRegressingBytes();
testProgressStatusRejectsMalformedPhase();
console.log('ok - TT-Sync progress text values reject malformed payloads');

function testProgressRowsRejectMalformedTextValues() {
    const tracker = createProgressTracker();
    resetProgressTracker(tracker, 1000);
    const rows = progressRows({
        current_path: true,
        phase: { stage: 'Uploading' },
    }, tracker, 1000);
    assertProgressRow(rows, 'phase', '未回傳');
    assertProgressRow(rows, '目前檔案', '未回傳');
}

function testProgressRowsKeepsLastValidSnapshotAfterMalformedNumericEvent() {
    const tracker = createProgressTracker();
    resetProgressTracker(tracker, 1000);
    progressRows({
        bytes_done: 1024,
        bytes_total: 4096,
    }, tracker, 1000);
    progressRows({
        bytes_done: true,
        bytes_total: '0x10',
    }, tracker, 2000);
    const rows = progressRows({
        bytes_done: 2048,
        bytes_total: 4096,
    }, tracker, 3000);
    assertProgressRow(rows, '速度', '512 B/s');
}

function testProgressRowsKeepsLastValidSnapshotAfterRegressingBytes() {
    const tracker = createProgressTracker();
    resetProgressTracker(tracker, 1000);
    progressRows({ bytes_done: 2048, bytes_total: 4096 }, tracker, 1000);
    progressRows({ bytes_done: 1024, bytes_total: 4096 }, tracker, 2000);
    const rows = progressRows({ bytes_done: 3072, bytes_total: 4096 }, tracker, 3000);
    assertProgressRow(rows, '速度', '512 B/s');
}

function testProgressStatusRejectsMalformedPhase() {
    assert.equal(progressStatus({
        direction: 'push',
        phase: { stage: 'Uploading' },
    }), 'TT-Sync Push 未回傳');
    assert.equal(progressStatus({
        direction: 'push',
        phase: Number.NaN,
    }), 'TT-Sync Push 未回傳');
}

function assertProgressRow(rows, label, expected) {
    const row = rows.find(item => item.label === label);
    assert.equal(row?.value, expected, `${label} should be ${expected}`);
}
