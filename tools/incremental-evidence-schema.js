export const FIELD_POSITIVE_NUMBER = 'positiveNumber';
export const FIELD_NON_NEGATIVE_NUMBER = 'nonNegativeNumber';
export const FIELD_TEXT = 'text';
export const FIELD_TEXT_ARRAY = 'textArray';
export const FIELD_TIMESTAMP = 'timestamp';

export const REQUIRED_SMOKE_CHECKS = Object.freeze([
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

export const REQUIRED_DEPLOY_CHECKS = Object.freeze([
    'service starts node server',
    'service hardening no new privileges',
    'service hardening protect system',
    'env public URL',
    'env port',
    'env pairing token is not placeholder',
    'service can write data dir',
]);

export const REQUIRED_DEVICE_CHECKS = Object.freeze([
    ['realLargeFirstSyncCompleted', 'real large first sync completed', [
        ['metrics.durationMs', FIELD_POSITIVE_NUMBER],
        ['metrics.fileCount', FIELD_POSITIVE_NUMBER],
        ['metrics.totalBytes', FIELD_POSITIVE_NUMBER],
    ]],
    ['commandContractVerified', 'TauriTavern backend command contract verified', [
        ['contract.commands', FIELD_TEXT_ARRAY],
        ['contract.reportId', FIELD_TEXT],
        ['desktopCommandReport.schemaVersion', FIELD_POSITIVE_NUMBER],
        ['desktopCommandReport.scannedAt', FIELD_TIMESTAMP],
        ['desktopCommandReport.source', FIELD_TEXT],
        ['desktopCommandReport.sourceKind', FIELD_TEXT],
        ['desktopCommandReport.tool', FIELD_TEXT],
        ['eventSurfaceReport.schemaVersion', FIELD_POSITIVE_NUMBER],
        ['eventSurfaceReport.scannedAt', FIELD_TIMESTAMP],
        ['eventSurfaceReport.source', FIELD_TEXT],
        ['eventSurfaceReport.sourceKind', FIELD_TEXT],
        ['eventSurfaceReport.tool', FIELD_TEXT],
        ['mobileCommandReport.schemaVersion', FIELD_POSITIVE_NUMBER],
        ['mobileCommandReport.scannedAt', FIELD_TIMESTAMP],
        ['mobileCommandReport.source', FIELD_TEXT],
        ['mobileCommandReport.sourceKind', FIELD_TEXT],
        ['mobileCommandReport.tool', FIELD_TEXT],
    ]],
    ['phoneDesktopPairingSaved', 'phone and desktop save paired server', [
        ['desktop.restartVerifiedAt', FIELD_TIMESTAMP],
        ['desktop.savedServerId', FIELD_TEXT],
        ['desktop.savedServerUrl', FIELD_TEXT],
        ['phone.restartVerifiedAt', FIELD_TIMESTAMP],
        ['phone.savedServerId', FIELD_TEXT],
        ['phone.savedServerUrl', FIELD_TEXT],
    ]],
    ['liveProgressBridgeVisible', 'live progress bridge visible in TauriTavern', [
        ['progress.bytesTransferred', FIELD_POSITIVE_NUMBER],
        ['progress.currentPath', FIELD_TEXT],
        ['progress.eventCount', FIELD_POSITIVE_NUMBER],
        ['progress.filesTransferred', FIELD_POSITIVE_NUMBER],
        ['progress.lastPhase', FIELD_TEXT],
    ]],
    ['preTransferDiffVisible', 'pre-transfer diff summary visible in plugin UI', [
        ['diff.capturedAt', FIELD_TIMESTAMP],
        ['diff.conflictFiles', FIELD_NON_NEGATIVE_NUMBER],
        ['diff.deleteFiles', FIELD_NON_NEGATIVE_NUMBER],
        ['diff.downloadFiles', FIELD_NON_NEGATIVE_NUMBER],
        ['diff.uploadFiles', FIELD_NON_NEGATIVE_NUMBER],
    ]],
    ['conflictResolutionVisible', 'conflict resolution visible in plugin UI', [
        ['conflict.capturedAt', FIELD_TIMESTAMP],
        ['conflict.localChoiceLabel', FIELD_TEXT],
        ['conflict.path', FIELD_TEXT],
        ['conflict.remoteChoiceLabel', FIELD_TEXT],
        ['conflict.selectedDecision', FIELD_TEXT],
    ]],
    ['pullMtimePreserved', 'pull preserves local filesystem mtime', [
        ['mtime.actualModifiedMs', FIELD_POSITIVE_NUMBER],
        ['mtime.expectedModifiedMs', FIELD_POSITIVE_NUMBER],
        ['mtime.path', FIELD_TEXT],
    ]],
    ['pullInterruptionSafe', 'pull interruption keeps existing local files safe', [
        ['interruption.afterHash', FIELD_TEXT],
        ['interruption.beforeHash', FIELD_TEXT],
        ['interruption.error', FIELD_TEXT],
        ['interruption.path', FIELD_TEXT],
        ['interruption.runId', FIELD_TEXT],
    ]],
    ['lanCloudSyncMutex', 'LAN Sync and cloud sync are mutually exclusive', [
        ['mutex.blockedOperation', FIELD_TEXT],
        ['mutex.cloudWhileLanBlockedOperation', FIELD_TEXT],
        ['mutex.cloudWhileLanVisibleError', FIELD_TEXT],
        ['mutex.lanWhileCloudBlockedOperation', FIELD_TEXT],
        ['mutex.lanWhileCloudVisibleError', FIELD_TEXT],
        ['mutex.visibleError', FIELD_TEXT],
    ]],
    ['androidWeakNetworkErrorVisible', 'Android weak-network error is visible', [
        ['android.capturedAt', FIELD_TIMESTAMP],
        ['android.errorCode', FIELD_TEXT],
        ['android.networkProfile', FIELD_TEXT],
        ['android.operation', FIELD_TEXT],
        ['android.visibleError', FIELD_TEXT],
    ]],
]);
