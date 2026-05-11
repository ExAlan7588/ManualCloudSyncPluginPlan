import { REQUIRED_TT_SYNC_COMMANDS } from '../verify-tauritavern-tt-sync.js';
import {
    REQUIRED_TT_SYNC_EVENTS,
    REQUIRED_TT_SYNC_EVENT_FIELDS,
} from '../verify-tauritavern-tt-sync-events.js';
import {
    REQUIRED_DEPLOY_CHECKS,
    REQUIRED_DEVICE_CHECKS,
    REQUIRED_SMOKE_CHECKS,
} from '../verify-incremental-cloud-sync-evidence.js';

export const TEST_BULK_FILE_BYTES = 128;
export const TEST_BULK_FILES = 3;
export const TEST_MTIME_MS = 1778500000000;
export const TEST_SYNC_URL = 'https://sync-fixture.dev';

const TEST_REAL_LARGE_SYNC_BYTES = 335544320;
const TEST_SYNC_DURATION_MS = 120000;

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
        desktopCommandReport: {
            scannedAt: '2026-05-12T00:00:20+08:00',
            source: '/builds/TauriTavern-desktop.dmg',
            sourceKind: 'build-artifact',
        },
        eventSurfaceReport: {
            scannedAt: '2026-05-12T00:00:10+08:00',
            source: '/src/TauriTavern',
            sourceKind: 'source-tree',
        },
        mobileCommandReport: {
            scannedAt: '2026-05-12T00:00:00+08:00',
            source: '/builds/TauriTavern-mobile.apk',
            sourceKind: 'build-artifact',
        },
    },
    conflictResolutionVisible: {
        conflict: {
            capturedAt: '2026-05-12T00:04:00+08:00',
            localChoiceLabel: '使用本機',
            path: 'default-user/chats/conflict-fixture.jsonl',
            remoteChoiceLabel: '使用遠端',
            selectedDecision: 'local',
        },
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
            savedServerUrl: TEST_SYNC_URL,
        },
        phone: {
            restartVerifiedAt: '2026-05-12T00:02:00+08:00',
            savedServerId: 'minimal-default',
            savedServerUrl: TEST_SYNC_URL,
        },
    },
    preTransferDiffVisible: {
        diff: {
            capturedAt: '2026-05-12T00:04:30+08:00',
            conflictFiles: 1,
            deleteFiles: 0,
            downloadFiles: 1,
            uploadFiles: 1,
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

export function completeEvidence() {
    return {
        desktopCommandReport: desktopCommandReportFixture(),
        mobileCommandReport: mobileCommandReportFixture(),
        eventReport: eventReportFixture(),
        deployReport: deployReportFixture(),
        deviceEvidence: deviceEvidenceFixture(),
        smokeReport: smokeReportFixture(),
    };
}

export function mobileCommandReportFixture() {
    return commandReportFixture({
        file: 'TauriTavern-mobile.apk',
        scannedAt: '2026-05-12T00:00:00+08:00',
        source: '/builds/TauriTavern-mobile.apk',
    });
}

export function desktopCommandReportFixture() {
    return commandReportFixture({
        file: 'TauriTavern-desktop.dmg',
        scannedAt: '2026-05-12T00:00:20+08:00',
        source: '/builds/TauriTavern-desktop.dmg',
    });
}

function commandReportFixture(options) {
    return {
        commands: REQUIRED_TT_SYNC_COMMANDS.map(command => ({
            evidence: [{ file: options.file, kind: 'build-artifact-string' }],
            files: [options.file],
            found: true,
            ignoredFiles: [],
            name: command,
        })),
        missingCommands: [],
        ok: true,
        scannedAt: options.scannedAt,
        scannedFiles: 1,
        source: options.source,
        sourceKind: 'build-artifact',
    };
}

export function sourceTreeCommandReportFixture() {
    const report = mobileCommandReportFixture();
    return {
        ...report,
        commands: REQUIRED_TT_SYNC_COMMANDS.map(command => ({
            evidence: [
                { file: 'src-tauri/src/commands.rs', kind: 'tauri-command-declaration' },
                { file: 'src-tauri/src/main.rs', kind: 'tauri-handler-registration' },
            ],
            files: ['src-tauri/src/commands.rs', 'src-tauri/src/main.rs'],
            found: true,
            ignoredFiles: [],
            name: command,
        })),
        scannedFiles: 2,
        source: '/src/TauriTavern',
        sourceKind: 'source-tree',
    };
}

export function eventReportFixture() {
    return {
        diffConflictSurface: diffConflictSurfaceFixture(),
        events: REQUIRED_TT_SYNC_EVENTS.map(name => eventItemFixture(name)),
        missingEvents: [],
        missingPayloadFields: [],
        ok: true,
        payloadFields: {
            completed: REQUIRED_TT_SYNC_EVENT_FIELDS.completed.map(name => eventItemFixture(name)),
            progress: REQUIRED_TT_SYNC_EVENT_FIELDS.progress.map(name => eventItemFixture(name)),
        },
        scannedAt: '2026-05-12T00:00:10+08:00',
        scannedFiles: 986,
        source: '/src/TauriTavern',
        sourceKind: 'source-tree',
    };
}

function eventItemFixture(name) {
    return { files: ['src-tauri/src/domain/models/tt_sync.rs'], found: true, name };
}

function diffConflictSurfaceFixture() {
    return {
        conflictDecisionPayload: { files: ['src-tauri/src/domain/models/tt_sync.rs'], found: true, name: 'conflictDecisionPayload' },
        conflictDto: { files: ['src-tauri/src/domain/models/tt_sync.rs'], found: true, name: 'conflictDto' },
        conflictEvent: { files: ['src-tauri/src/infrastructure/tt_sync/runtime.rs'], found: true, name: 'conflictEvent' },
        preTransferDiffEvent: { files: ['src-tauri/src/infrastructure/tt_sync/runtime.rs'], found: true, name: 'preTransferDiffEvent' },
    };
}

export function deployReportFixture() {
    return {
        allowPlaceholders: false,
        checks: REQUIRED_DEPLOY_CHECKS.map(name => ({ detail: 'fixture', name, ok: true })),
        envPath: '/etc/manual-cloud-tt-sync.env',
        ok: true,
        publicUrl: TEST_SYNC_URL,
        schemaVersion: 1,
        servicePath: '/etc/systemd/system/manual-cloud-tt-sync.service',
        tool: 'verify-tt-sync-deploy',
        verifiedAt: '2026-05-12T00:00:30+08:00',
    };
}

export function deviceEvidenceFixture() {
    return {
        checks: Object.fromEntries(REQUIRED_DEVICE_CHECKS.map(deviceCheckEntry)),
        devices: [
            { deviceId: 'android-device-fixture', model: 'Pixel', platform: 'Android 15' },
            { deviceId: 'desktop-device-fixture', model: 'Workstation', platform: 'Linux desktop' },
        ],
        server: {
            url: TEST_SYNC_URL,
        },
        tauriTavern: {
            desktopBuildId: 'desktop-build-fixture',
            mobileBuildId: 'mobile-build-fixture',
        },
        testedAt: '2026-05-12T00:00:00+08:00',
    };
}

export function smokeReportFixture() {
    const smokePath = 'default-user/chats/tt-sync-smoke-fixture.jsonl';
    return {
        checks: REQUIRED_SMOKE_CHECKS.map(name => ({ detail: 'fixture', name, ok: true })),
        completedAt: '2026-05-12T00:01:00+08:00',
        deviceId: 'device-fixture',
        endpoint: TEST_SYNC_URL,
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
        schemaVersion: 1,
        smokePath,
        smokePaths: [smokePath],
        status: {
            ok: true,
            service: 'minimal-tt-sync',
            version: '1.0.0',
        },
        tool: 'smoke-tt-sync-server',
    };
}

function deviceCheckEntry(item) {
    const [key, label] = item;
    return [key, { evidence: `${label} evidence`, ok: true, ...DEVICE_CHECK_FIXTURES[key] }];
}
