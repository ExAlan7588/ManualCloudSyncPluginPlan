import {
    BYTE_UNITS,
    BYTE_UNIT_STEP,
    MILLISECONDS_PER_SECOND,
    PERCENT_FACTOR,
} from './constants.js';

export function formatBytes(sizeBytes) {
    let size = Number.isFinite(sizeBytes) ? Math.max(0, sizeBytes) : 0;
    let unitIndex = 0;
    while (size >= BYTE_UNIT_STEP && unitIndex < BYTE_UNITS.length - 1) {
        size /= BYTE_UNIT_STEP;
        unitIndex += 1;
    }
    return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${BYTE_UNITS[unitIndex]}`;
}

export function formatProgress(value) {
    const progress = progressPercentValue(value);
    return Number.isFinite(progress) ? `${progress.toFixed(1)}%` : '';
}

function progressPercentValue(value) {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }
    if (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value.trim())) {
        return null;
    }
    return Number(value);
}

export function formatTransferProgress(snapshot) {
    const elapsedSeconds = Math.max(
        (snapshot.now - snapshot.startedAt) / MILLISECONDS_PER_SECOND,
        0.001,
    );
    const speedBytes = snapshot.loadedBytes / elapsedSeconds;
    return [
        `${snapshot.label} ${formatTransferPercent(snapshot.loadedBytes, snapshot.totalBytes)}`,
        formatTransferBytes(snapshot.loadedBytes, snapshot.totalBytes),
        `${formatBytes(speedBytes)}/s`,
    ].join(' | ');
}

export function formatTransferPercent(loadedBytes, totalBytes) {
    if (!Number.isFinite(totalBytes) || totalBytes <= 0) {
        return '--';
    }

    return `${((loadedBytes / totalBytes) * PERCENT_FACTOR).toFixed(1)}%`;
}

export function formatTransferBytes(loadedBytes, totalBytes) {
    if (!Number.isFinite(totalBytes) || totalBytes <= 0) {
        return formatBytes(loadedBytes);
    }

    return `${formatBytes(loadedBytes)} / ${formatBytes(totalBytes)}`;
}
