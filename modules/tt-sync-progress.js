import { formatBytes } from './format.js';

const EMPTY_VALUE = '未回傳';
const MILLISECONDS_PER_SECOND = 1000;
const PERCENT_FACTOR = 100;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;

export function createProgressTracker() {
    return {
        lastSnapshot: null,
        startedAt: 0,
    };
}

export function resetProgressTracker(tracker, now = Date.now()) {
    tracker.lastSnapshot = null;
    tracker.startedAt = now;
}

export function progressRows(progress, tracker, now = Date.now()) {
    const snapshot = progressSnapshot(progress, tracker, now);
    const rows = [
        { label: 'phase', value: stringValue(firstValue(progress, ['phase', 'stage'])) },
        { label: 'files', value: progressPair(snapshot.filesDone, snapshot.filesTotal) },
        { label: 'bytes', value: bytesPair(snapshot.bytesDone, snapshot.bytesTotal) },
        { label: '完成度', value: percentText(snapshot.bytesDone, snapshot.bytesTotal) },
        { label: '速度', value: speedText(snapshot.speedBytesPerSecond) },
        { label: '耗時', value: durationText(snapshot.elapsedSeconds) },
        { label: '剩餘', value: etaText(snapshot) },
        { label: '目前檔案', value: stringValue(firstValue(progress, ['current_path', 'currentPath', 'currentFile'])) },
    ];
    const safety = partialUploadSafetyText(progress);
    if (safety) {
        rows.push({ label: '部分上傳', value: safety });
    }
    return rows;
}

function progressSnapshot(progress, tracker, now) {
    const elapsedSeconds = elapsedSecondsFrom(tracker, now);
    const snapshot = {
        bytesDone: numberValue(firstValue(progress, ['bytes_done', 'bytesDone', 'bytesTransferred', 'completedBytes'])),
        bytesTotal: numberValue(firstValue(progress, ['bytes_total', 'bytesTotal', 'totalBytes', 'byteTotal'])),
        elapsedSeconds,
        filesDone: numberValue(firstValue(progress, ['files_done', 'filesDone', 'filesTransferred', 'completedFiles'])),
        filesTotal: numberValue(firstValue(progress, ['files_total', 'filesTotal', 'totalFiles', 'fileTotal'])),
        speedBytesPerSecond: null,
        timestamp: now,
    };
    snapshot.speedBytesPerSecond = speedFrom(snapshot, tracker.lastSnapshot);
    tracker.lastSnapshot = snapshot;
    return snapshot;
}

function elapsedSecondsFrom(tracker, now) {
    if (!Number.isFinite(tracker.startedAt) || tracker.startedAt <= 0) {
        tracker.startedAt = now;
    }
    return Math.max((now - tracker.startedAt) / MILLISECONDS_PER_SECOND, 0);
}

function speedFrom(snapshot, previous) {
    if (!Number.isFinite(snapshot.bytesDone)) {
        return null;
    }
    if (previous && Number.isFinite(previous.bytesDone)) {
        const deltaBytes = snapshot.bytesDone - previous.bytesDone;
        const deltaSeconds = (snapshot.timestamp - previous.timestamp) / MILLISECONDS_PER_SECOND;
        if (deltaBytes >= 0 && deltaSeconds > 0) {
            return deltaBytes / deltaSeconds;
        }
    }
    if (snapshot.elapsedSeconds > 0) {
        return snapshot.bytesDone / snapshot.elapsedSeconds;
    }
    return null;
}

function etaText(snapshot) {
    if (!Number.isFinite(snapshot.speedBytesPerSecond) || snapshot.speedBytesPerSecond <= 0) {
        return EMPTY_VALUE;
    }
    if (!Number.isFinite(snapshot.bytesTotal) || !Number.isFinite(snapshot.bytesDone)) {
        return EMPTY_VALUE;
    }
    return durationText(Math.max(snapshot.bytesTotal - snapshot.bytesDone, 0) / snapshot.speedBytesPerSecond);
}

function percentText(done, total) {
    if (!Number.isFinite(done) || !Number.isFinite(total) || total <= 0) {
        return EMPTY_VALUE;
    }
    return `${Math.min((done / total) * PERCENT_FACTOR, PERCENT_FACTOR).toFixed(1)}%`;
}

function speedText(speedBytesPerSecond) {
    return Number.isFinite(speedBytesPerSecond) ? `${formatBytes(speedBytesPerSecond)}/s` : EMPTY_VALUE;
}

function partialUploadSafetyText(progress) {
    return firstValue(progress, ['partial_upload_safe', 'partialUploadSafe']) === true
        ? '未提交，只暫存，可重試'
        : '';
}

function progressPair(done, total) {
    if (!Number.isFinite(done) && !Number.isFinite(total)) {
        return EMPTY_VALUE;
    }
    return `${formatOptionalCount(done)} / ${formatOptionalCount(total)}`;
}

function bytesPair(done, total) {
    if (!Number.isFinite(done) && !Number.isFinite(total)) {
        return EMPTY_VALUE;
    }
    return `${formatOptionalBytes(done)} / ${formatOptionalBytes(total)}`;
}

function durationText(seconds) {
    if (!Number.isFinite(seconds)) {
        return EMPTY_VALUE;
    }
    const rounded = Math.max(0, Math.round(seconds));
    if (rounded >= SECONDS_PER_HOUR) {
        const hours = Math.floor(rounded / SECONDS_PER_HOUR);
        const minutes = Math.floor((rounded % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
        return `${hours}h ${minutes}m`;
    }
    if (rounded >= SECONDS_PER_MINUTE) {
        const minutes = Math.floor(rounded / SECONDS_PER_MINUTE);
        return `${minutes}m ${rounded % SECONDS_PER_MINUTE}s`;
    }
    return `${rounded}s`;
}

function formatOptionalCount(value) {
    return Number.isFinite(value) ? String(value) : EMPTY_VALUE;
}

function formatOptionalBytes(value) {
    return Number.isFinite(value) ? formatBytes(value) : EMPTY_VALUE;
}

function numberValue(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function firstValue(object, keys) {
    for (const key of keys) {
        if (object?.[key] !== undefined && object?.[key] !== null) {
            return object[key];
        }
    }
    return undefined;
}

function stringValue(value) {
    const text = String(value || '').trim();
    return text || EMPTY_VALUE;
}
