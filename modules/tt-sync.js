import { bindTtSyncAccountPanel } from './tt-sync-account.js';
import {
    beginTransfer,
    clearTransferCancelRequested,
    createTransferState,
    currentTransfer,
    finishTransfer,
    hasActiveTransfer,
    markTransferCancelRequested,
    renderTransferControls,
} from './tt-sync-transfer.js';
import {
    directionLabel,
    errorMessage,
    hasObjectPayload,
    isPullDirection,
    progressStatus,
    renderConflictList,
    renderDiffSummary,
    renderProgress,
    renderSelectedServer,
    renderServerOptions,
    renderTransferArtifacts,
    renderTransferSummary,
    renderTtStatus,
    requireSelectedServerId,
    resetConflictState,
    serverListFrom,
    submittedProgress,
} from './tt-sync-view.js';
import {
    createProgressTracker,
    resetProgressTracker,
} from './tt-sync-progress.js';

const TT_COMMANDS = {
    cancel: 'tt_sync_cancel',
    listServers: 'tt_sync_list_servers',
    pair: 'tt_sync_pair',
    pull: 'tt_sync_pull',
    push: 'tt_sync_push',
    removeServer: 'tt_sync_remove_server',
};
const TT_SYNC_EVENTS = Object.freeze({
    cancelled: 'tt_sync:cancelled',
    completed: 'tt_sync:completed',
    conflict: 'tt_sync:conflict',
    diff: 'tt_sync:diff',
    error: 'tt_sync:error',
    progress: 'tt_sync:progress',
});
const DEFAULT_SYNC_MODE = 'Incremental';
const SYNC_MODES = new Set([DEFAULT_SYNC_MODE, 'Mirror']);

export function bindTtSyncPanel(deps) {
    const controller = createTtSyncController(deps);
    controller.bind();
    controller.renderInitialState();
    bindTtSyncAccountPanel(deps);
    return controller;
}

function createTtSyncController(deps) {
    const state = {
        conflictChoices: new Map(),
        eventListenersInstalled: false,
        lastConflictPayload: null,
        progressTracker: createProgressTracker(),
        servers: [],
        transfer: createTransferState(),
    };
    return {
        bind: () => bindEvents(deps, state),
        renderInitialState: () => renderInitialState(state),
    };
}

function bindEvents(deps, state) {
    $('#mcs_tts_pair').on('click', () => pairServer(deps, state));
    $('#mcs_tts_refresh_servers').on('click', () => refreshServers(deps, state));
    $('#mcs_tts_push').on('click', () => runTransfer(deps, state, 'push'));
    $('#mcs_tts_pull').on('click', () => runTransfer(deps, state, 'pull'));
    $('#mcs_tts_cancel').on('click', () => cancelTransfer(deps, state));
    $('#mcs_tts_unpair').on('click', () => removeServer(deps, state));
    $('#mcs_tts_server').on('change', () => renderSelectedServer(state));
    installTtSyncEventListeners(deps, state);
}

function renderInitialState(state) {
    resetConflictState(state);
    resetProgressTracker(state.progressTracker);
    renderTtStatus('尚未讀取服務端');
    renderTransferSummary(null);
    renderProgress(null, state.progressTracker);
    renderDiffSummary(null);
    renderConflictList(state, null);
    renderTransferControls(state.transfer);
}

async function pairServer(deps, state) {
    if (!ensureTransferIdle(state)) {
        return;
    }
    await deps.runAction('TT-Sync 服務端已配對', async () => {
        const pairUri = readPairUri();
        await deps.invokeCommand(TT_COMMANDS.pair, { pairUri });
        await loadServers(deps, state);
    });
}

async function refreshServers(deps, state) {
    if (!ensureTransferIdle(state)) {
        return;
    }
    await deps.runAction('TT-Sync 服務端已更新', async () => {
        await loadServers(deps, state);
    });
}

async function runTransfer(deps, state, direction) {
    if (!ensureTransferIdle(state)) {
        return;
    }
    if (direction === 'pull' && !await confirmPull(deps)) {
        return;
    }

    await deps.runAction(`TT-Sync ${directionLabel(direction)} 已送出`, async () => {
        await invokeTransferCommand(deps, state, direction);
    });
    if (hasActiveTransfer(state.transfer)) {
        renderTtStatus(`TT-Sync ${directionLabel(direction)} 已送出，等待完成或錯誤事件`);
    }
    renderTransferControls(state.transfer);
}

async function confirmPull(deps) {
    return deps.confirm('確認 Pull', 'Pull 會將遠端變更套用到本機。要繼續嗎？');
}

async function invokeTransferCommand(deps, state, direction) {
    const args = transferArgs();
    beginTransfer(state.transfer, { direction, ...args });
    resetConflictState(state);
    resetProgressTracker(state.progressTracker);
    renderProgress(submittedProgress(direction), state.progressTracker);
    renderDiffSummary(null);
    renderConflictList(state, null);
    try {
        const result = await deps.invokeCommand(TT_COMMANDS[direction], args);
        await handleTransferCommandResult(deps, state, result);
    } catch (error) {
        finishTransfer(state.transfer);
        throw error;
    }
}

async function handleTransferCommandResult(deps, state, result) {
    if (!hasObjectPayload(result)) {
        return;
    }
    renderTransferArtifacts(state, result);
    finishTransfer(state.transfer);
    await loadServers(deps, state);
}

async function cancelTransfer(deps, state) {
    const active = currentTransfer(state.transfer);
    if (!active) {
        renderTtStatus('沒有進行中的 TT-Sync 可停止');
        return;
    }

    markTransferCancelRequested(state.transfer);
    renderTtStatus(`正在停止 TT-Sync ${directionLabel(active.direction)}...`);
    try {
        const result = await deps.invokeCommand(TT_COMMANDS.cancel, {
            direction: active.direction,
            serverDeviceId: active.serverDeviceId,
        });
        finishTransfer(state.transfer);
        if (hasObjectPayload(result)) {
            renderProgress(result, createProgressTracker());
        }
        renderTtStatus(`TT-Sync ${directionLabel(active.direction)} 已停止`);
    } catch (error) {
        clearTransferCancelRequested(state.transfer);
        renderTtStatus(`TT-Sync 停止失敗：${errorMessage(error)}`);
    }
}

async function removeServer(deps, state) {
    if (!ensureTransferIdle(state)) {
        return;
    }
    await deps.runAction('TT-Sync 服務端已解除配對', async () => {
        await deps.invokeCommand(TT_COMMANDS.removeServer, {
            serverDeviceId: requireSelectedServerId(),
        });
        renderTransferSummary(null);
        renderProgress(null, state.progressTracker);
        await loadServers(deps, state);
    });
}

async function loadServers(deps, state) {
    const result = await deps.invokeCommand(TT_COMMANDS.listServers);
    state.servers = serverListFrom(result);
    if (renderServerOptions(state.servers)) {
        renderSelectedServer(state);
    }
}

function installTtSyncEventListeners(deps, state) {
    if (state.eventListenersInstalled) {
        return;
    }
    if (typeof deps.listen !== 'function') {
        renderTtStatus('目前環境無法訂閱 TT-Sync 進度事件');
        return;
    }

    state.eventListenersInstalled = true;
    void Promise.all([
        deps.listen(TT_SYNC_EVENTS.progress, event => handleProgressEvent(state, event?.payload)),
        deps.listen(TT_SYNC_EVENTS.completed, event => handleCompletedEvent(deps, state, event?.payload)),
        deps.listen(TT_SYNC_EVENTS.cancelled, event => handleCancelledEvent(state, event?.payload)),
        deps.listen(TT_SYNC_EVENTS.diff, event => handleDiffEvent(state, event?.payload)),
        deps.listen(TT_SYNC_EVENTS.conflict, event => handleConflictEvent(state, event?.payload)),
        deps.listen(TT_SYNC_EVENTS.error, event => handleErrorEvent(state, event?.payload)),
    ]).catch(error => {
        state.eventListenersInstalled = false;
        renderTtStatus(`TT-Sync 事件訂閱失敗：${errorMessage(error)}`);
    });
}

function handleProgressEvent(state, payload) {
    renderProgress(payload, state.progressTracker);
    renderTtStatus(progressStatus(payload));
}

function handleCompletedEvent(deps, state, payload) {
    finishTransfer(state.transfer);
    renderTransferArtifacts(state, payload);
    renderProgress(payload, state.progressTracker);
    renderTtStatus(`TT-Sync ${directionLabel(payload?.direction)} 完成`);
    void loadServers(deps, state).catch(error => {
        renderTtStatus(`TT-Sync 服務端列表更新失敗：${errorMessage(error)}`);
    });
    if (isPullDirection(payload) && typeof deps.scheduleReload === 'function') {
        deps.scheduleReload();
    }
}

function handleCancelledEvent(state, payload) {
    finishTransfer(state.transfer);
    renderProgress(payload, createProgressTracker());
    renderTtStatus(`TT-Sync ${directionLabel(payload?.direction)} 已停止`);
}

function handleDiffEvent(state, payload) {
    renderDiffSummary(payload);
    renderConflictList(state, payload);
    renderTtStatus('TT-Sync 差異摘要已更新');
}

function handleConflictEvent(state, payload) {
    renderConflictList(state, payload);
    renderTtStatus('TT-Sync 衝突列表已更新');
}

function handleErrorEvent(state, payload) {
    finishTransfer(state.transfer);
    renderProgress(payload, createProgressTracker());
    renderTtStatus(errorStatus(payload));
}

function readPairUri() {
    const pairUri = String($('#mcs_tts_pair_uri').val() || '').trim();
    if (!pairUri) {
        throw new Error('請填寫 TT-Sync 配對 URI');
    }

    return pairUri;
}

function transferArgs() {
    return {
        mode: selectedSyncMode(),
        serverDeviceId: requireSelectedServerId(),
    };
}

function selectedSyncMode() {
    const mode = String($('#mcs_tts_mode').val() || DEFAULT_SYNC_MODE).trim();
    if (!SYNC_MODES.has(mode)) {
        throw new Error(`不支援的 TT-Sync 模式：${mode}`);
    }
    return mode;
}

function ensureTransferIdle(state) {
    const active = currentTransfer(state.transfer);
    if (!active) {
        return true;
    }
    renderTtStatus(`TT-Sync ${directionLabel(active.direction)} 正在執行中，請先停止或等待完成`);
    return false;
}

function errorStatus(payload) {
    const kind = payload?.retryable || payload?.canRetry ? '暫時失敗' : '失敗';
    const details = [
        Boolean(payload?.retryable || payload?.canRetry) ? '可重試' : '',
        Boolean(payload?.partial_upload_safe || payload?.partialUploadSafe) ? '部分上傳安全' : '',
    ].filter(Boolean).join('，');
    return `TT-Sync ${directionLabel(payload?.direction)} ${kind}：${errorMessage(payload?.message)}${details ? `，${details}` : ''}`;
}
