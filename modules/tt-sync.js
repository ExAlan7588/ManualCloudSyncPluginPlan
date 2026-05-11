import { formatBytes } from './format.js';

const TT_COMMANDS = {
    listServers: 'tt_sync_list_servers',
    pair: 'tt_sync_pair',
    pull: 'tt_sync_pull',
    push: 'tt_sync_push',
    removeServer: 'tt_sync_remove_server',
};
const TT_SYNC_EVENTS = Object.freeze({
    completed: 'tt_sync:completed',
    conflict: 'tt_sync:conflict',
    diff: 'tt_sync:diff',
    error: 'tt_sync:error',
    progress: 'tt_sync:progress',
});
const DEFAULT_SYNC_MODE = 'Incremental';
const SYNC_MODES = new Set([DEFAULT_SYNC_MODE, 'Mirror']);
const EMPTY_VALUE = '未回傳';

let eventListenersInstalled = false;

export function bindTtSyncPanel(deps) {
    const controller = createTtSyncController(deps);
    controller.bind();
    controller.renderInitialState();
    return controller;
}

function createTtSyncController(deps) {
    const state = {
        servers: [],
    };
    return {
        bind: () => bindEvents(deps, state),
        renderInitialState: () => renderInitialState(),
    };
}

function bindEvents(deps, state) {
    $('#mcs_tts_pair').on('click', () => pairServer(deps, state));
    $('#mcs_tts_refresh_servers').on('click', () => refreshServers(deps, state));
    $('#mcs_tts_push').on('click', () => runTransfer(deps, state, 'push'));
    $('#mcs_tts_pull').on('click', () => runTransfer(deps, state, 'pull'));
    $('#mcs_tts_unpair').on('click', () => removeServer(deps, state));
    $('#mcs_tts_server').on('change', () => renderSelectedServer(state));
    installTtSyncEventListeners(deps, state);
}

function renderInitialState() {
    renderTtStatus('尚未讀取服務端');
    renderTransferSummary(null);
    renderProgress(null);
    renderDiffSummary(null);
    renderConflictList(null);
}

async function pairServer(deps, state) {
    await deps.runAction('TT-Sync 服務端已配對', async () => {
        const pairUri = readPairUri();
        await deps.invokeCommand(TT_COMMANDS.pair, { pairUri });
        await loadServers(deps, state);
    });
}

async function refreshServers(deps, state) {
    await deps.runAction('TT-Sync 服務端已更新', async () => {
        await loadServers(deps, state);
    });
}

async function runTransfer(deps, state, direction) {
    if (direction === 'pull') {
        const confirmed = await deps.confirm('確認 Pull', 'Pull 會將遠端變更套用到本機。要繼續嗎？');
        if (!confirmed) {
            return;
        }
    }

    await deps.runAction(`TT-Sync ${directionLabel(direction)} 完成`, async () => {
        renderProgress(submittedProgress(direction));
        renderDiffSummary(null);
        renderConflictList(null);
        const result = await deps.invokeCommand(TT_COMMANDS[direction], transferArgs());
        if (hasObjectPayload(result)) {
            renderTransferArtifacts(result);
        }
        await loadServers(deps, state);
    });
}

async function removeServer(deps, state) {
    await deps.runAction('TT-Sync 服務端已解除配對', async () => {
        await deps.invokeCommand(TT_COMMANDS.removeServer, {
            serverDeviceId: requireSelectedServerId(),
        });
        renderTransferSummary(null);
        renderProgress(null);
        await loadServers(deps, state);
    });
}

async function loadServers(deps, state) {
    const result = await deps.invokeCommand(TT_COMMANDS.listServers);
    state.servers = serverListFrom(result);
    renderServerOptions(state.servers);
    renderSelectedServer(state);
}

function installTtSyncEventListeners(deps, state) {
    if (eventListenersInstalled) {
        return;
    }
    if (typeof deps.listen !== 'function') {
        renderTtStatus('目前環境無法訂閱 TT-Sync 進度事件');
        return;
    }

    eventListenersInstalled = true;
    void Promise.all([
        deps.listen(TT_SYNC_EVENTS.progress, event => handleProgressEvent(event?.payload)),
        deps.listen(TT_SYNC_EVENTS.completed, event => handleCompletedEvent(deps, state, event?.payload)),
        deps.listen(TT_SYNC_EVENTS.diff, event => handleDiffEvent(event?.payload)),
        deps.listen(TT_SYNC_EVENTS.conflict, event => handleConflictEvent(event?.payload)),
        deps.listen(TT_SYNC_EVENTS.error, event => handleErrorEvent(event?.payload)),
    ]).catch(error => {
        eventListenersInstalled = false;
        renderTtStatus(`TT-Sync 事件訂閱失敗：${errorMessage(error)}`);
    });
}

function handleProgressEvent(payload) {
    renderProgress(payload);
    renderTtStatus(progressStatus(payload));
}

function handleCompletedEvent(deps, state, payload) {
    renderTransferArtifacts(payload);
    renderProgress(payload);
    renderTtStatus(`TT-Sync ${directionLabel(payload?.direction)} 完成`);
    void loadServers(deps, state).catch(error => {
        renderTtStatus(`TT-Sync 服務端列表更新失敗：${errorMessage(error)}`);
    });
    if (isPullDirection(payload) && typeof deps.scheduleReload === 'function') {
        deps.scheduleReload();
    }
}

function handleDiffEvent(payload) {
    renderDiffSummary(payload);
    renderConflictList(payload);
    renderTtStatus('TT-Sync 差異摘要已更新');
}

function handleConflictEvent(payload) {
    renderConflictList(payload);
    renderTtStatus('TT-Sync 衝突列表已更新');
}

function handleErrorEvent(payload) {
    renderProgress(payload);
    renderTtStatus(`TT-Sync ${directionLabel(payload?.direction)} 失敗：${errorMessage(payload?.message)}`);
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

function renderServerOptions(servers) {
    const select = document.getElementById('mcs_tts_server');
    select.replaceChildren();
    if (servers.length === 0) {
        select.appendChild(optionElement('', '沒有已配對服務端'));
        renderTtStatus('沒有已配對服務端');
        return;
    }

    for (const server of servers) {
        select.appendChild(optionElement(serverIdOf(server), serverLabel(server)));
    }
}

function renderSelectedServer(state) {
    const serverId = selectedServerId();
    const server = state.servers.find(item => serverIdOf(item) === serverId);
    renderTtStatus(server ? serverStatus(server) : '未選擇服務端');
}

function renderTransferSummary(result) {
    const container = document.getElementById('mcs_tts_summary');
    container.replaceChildren();
    if (!result) {
        container.appendChild(emptyInfo('尚無同步結果'));
        return;
    }

    for (const row of transferSummaryRows(result)) {
        container.appendChild(metricElement(row.label, row.value));
    }
}

function renderProgress(progress) {
    const container = document.getElementById('mcs_tts_progress');
    container.replaceChildren();
    if (!progress) {
        container.appendChild(emptyInfo('尚無進度'));
        return;
    }

    for (const row of progressRows(progress)) {
        container.appendChild(metricElement(row.label, row.value));
    }
}

function renderTransferArtifacts(payload) {
    renderTransferSummary(payload);
    renderDiffSummary(payload);
    renderConflictList(payload);
}

function renderDiffSummary(payload) {
    const container = document.getElementById('mcs_tts_diff');
    container.replaceChildren();
    const rows = diffSummaryRows(payload);
    if (!hasVisibleRows(rows)) {
        container.appendChild(emptyInfo('尚無差異摘要'));
        return;
    }
    for (const row of rows) {
        container.appendChild(metricElement(row.label, row.value));
    }
}

function renderConflictList(payload) {
    const container = document.getElementById('mcs_tts_conflicts');
    container.replaceChildren();
    const conflicts = conflictListFrom(payload);
    if (conflicts.length === 0) {
        const text = hasConflictCount(payload) ? '衝突內容未回傳' : '尚無衝突';
        container.appendChild(emptyInfo(text));
        return;
    }
    for (const conflict of conflicts) {
        container.appendChild(conflictElement(conflict));
    }
}

function transferSummaryRows(result) {
    return [
        { label: '方向', value: directionLabel(result?.direction) },
        { label: '檔案數', value: formatOptionalCount(firstValue(result, ['files_total', 'filesTotal', 'totalFiles'])) },
        { label: '大小', value: formatOptionalBytes(firstValue(result, ['bytes_total', 'bytesTotal', 'totalBytes'])) },
        { label: '刪除檔案', value: formatOptionalCount(firstValue(result, ['files_deleted', 'filesDeleted', 'deletedFiles'])) },
    ];
}

function diffSummaryRows(payload) {
    const summary = diffSummaryFrom(payload);
    return [
        { label: '上傳檔案', value: formatOptionalCount(firstValue(summary, ['uploadFiles', 'upload_files'])) },
        { label: '上傳大小', value: formatOptionalBytes(firstValue(summary, ['uploadBytes', 'upload_bytes'])) },
        { label: '下載檔案', value: formatOptionalCount(firstValue(summary, ['downloadFiles', 'download_files'])) },
        { label: '下載大小', value: formatOptionalBytes(firstValue(summary, ['downloadBytes', 'download_bytes'])) },
        { label: '刪除檔案', value: formatOptionalCount(firstValue(summary, ['deleteFiles', 'delete_files'])) },
        { label: '衝突檔案', value: formatOptionalCount(firstValue(summary, ['conflictFiles', 'conflict_files'])) },
    ];
}

function progressRows(progress) {
    return [
        { label: 'phase', value: stringValue(firstValue(progress, ['phase', 'stage'])) },
        { label: 'files', value: progressPair(progress, ['files_done', 'filesDone', 'filesTransferred', 'completedFiles'], ['files_total', 'filesTotal', 'totalFiles', 'fileTotal']) },
        { label: 'bytes', value: bytesPair(progress, ['bytes_done', 'bytesDone', 'bytesTransferred', 'completedBytes'], ['bytes_total', 'bytesTotal', 'totalBytes', 'byteTotal']) },
        { label: '目前檔案', value: stringValue(firstValue(progress, ['current_path', 'currentPath', 'currentFile'])) },
    ];
}

function submittedProgress(direction) {
    return {
        bytes_done: 0,
        bytes_total: 0,
        direction: directionLabel(direction),
        files_done: 0,
        files_total: 0,
        phase: 'Submitted',
    };
}

function progressStatus(progress) {
    return `TT-Sync ${directionLabel(progress?.direction)} ${stringValue(progress?.phase)}`;
}

function metricElement(label, value) {
    const root = document.createElement('div');
    root.className = 'mcs-metric';
    const labelElement = document.createElement('span');
    labelElement.className = 'mcs-metric-label';
    labelElement.textContent = label;
    const valueElement = document.createElement('strong');
    valueElement.textContent = value || EMPTY_VALUE;
    root.append(labelElement, valueElement);
    return root;
}

function conflictElement(conflict) {
    const root = document.createElement('div');
    root.className = 'mcs-conflict';
    const title = document.createElement('strong');
    title.textContent = stringValue(conflict?.path);
    const meta = document.createElement('span');
    meta.className = 'mcs-conflict-meta';
    meta.textContent = conflictMetaText(conflict);
    root.append(title, meta);
    return root;
}

function diffSummaryFrom(payload) {
    return firstObject(payload, ['diff', 'summary', 'preTransferDiff', 'pre_transfer_diff'])
        || firstObject(payload?.plan, ['summary'])
        || payload;
}

function conflictListFrom(payload) {
    const conflicts = firstValue(payload, ['conflicts'])
        || firstValue(payload?.diff, ['conflicts'])
        || firstValue(payload?.plan, ['conflicts']);
    return Array.isArray(conflicts) ? conflicts : [];
}

function hasVisibleRows(rows) {
    return rows.some(row => row.value !== EMPTY_VALUE);
}

function hasConflictCount(payload) {
    const summary = diffSummaryFrom(payload);
    const count = Number(firstValue(summary, ['conflictFiles', 'conflict_files']));
    return Number.isFinite(count) && count > 0;
}

function conflictMetaText(conflict) {
    return [
        entryText('本機', conflict?.local),
        entryText('遠端', conflict?.remote),
    ].filter(Boolean).join(' | ') || EMPTY_VALUE;
}

function entryText(label, entry) {
    if (!entry) {
        return '';
    }
    const size = formatOptionalBytes(entry.sizeBytes ?? entry.size_bytes);
    const modified = stringValue(entry.modifiedMs ?? entry.modified_ms);
    return `${label}: ${size}, mtime ${modified}`;
}

function emptyInfo(text) {
    const element = document.createElement('small');
    element.className = 'extensions_info mcs-empty';
    element.textContent = text;
    return element;
}

function optionElement(value, text) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    return option;
}

function renderTtStatus(message) {
    $('#mcs_tts_status').text(String(message || ''));
}

function requireSelectedServerId() {
    const serverId = selectedServerId();
    if (!serverId) {
        throw new Error('請先選擇已配對的 TT-Sync 服務端');
    }
    return serverId;
}

function selectedServerId() {
    return String($('#mcs_tts_server').val() || '').trim();
}

function serverListFrom(result) {
    if (Array.isArray(result)) {
        return result;
    }
    if (Array.isArray(result?.servers)) {
        return result.servers;
    }
    return [];
}

function serverIdOf(server) {
    return String(server?.server_device_id || server?.serverDeviceId || server?.serverId || server?.id || '').trim();
}

function serverLabel(server) {
    return [
        server?.server_device_name || server?.serverDeviceName || server?.name || serverIdOf(server),
        server?.base_url || server?.baseUrl || server?.endpoint || '',
    ].filter(Boolean).join(' | ');
}

function serverStatus(server) {
    return [
        serverBaseUrl(server) ? `端點：${serverBaseUrl(server)}` : '',
        server?.last_sync_ms ? `最後同步：${timestampText(server.last_sync_ms)}` : '',
        permissionsText(server?.permissions),
    ].filter(Boolean).join(' | ') || '已選擇服務端';
}

function serverBaseUrl(server) {
    return server?.base_url || server?.baseUrl || server?.endpoint || '';
}

function permissionsText(permissions) {
    if (!permissions) {
        return '';
    }
    return `權限：read=${booleanText(permissions.read)}, write=${booleanText(permissions.write)}, mirror_delete=${booleanText(permissions.mirror_delete)}`;
}

function booleanText(value) {
    return value ? 'yes' : 'no';
}

function timestampText(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
        return stringValue(value);
    }
    const date = new Date(number);
    return Number.isNaN(date.getTime()) ? stringValue(value) : date.toISOString();
}

function firstValue(object, keys, fallback) {
    for (const key of keys) {
        if (object?.[key] !== undefined && object?.[key] !== null) {
            return object[key];
        }
    }
    return fallback;
}

function firstObject(object, keys) {
    for (const key of keys) {
        if (object?.[key] && typeof object[key] === 'object') {
            return object[key];
        }
    }
    return null;
}

function hasObjectPayload(value) {
    return Boolean(value && typeof value === 'object' && Object.keys(value).length > 0);
}

function formatOptionalCount(value) {
    const number = Number(value);
    return Number.isFinite(number) ? String(number) : EMPTY_VALUE;
}

function formatOptionalBytes(value) {
    const number = Number(value);
    return Number.isFinite(number) ? formatBytes(number) : EMPTY_VALUE;
}

function progressPair(progress, completedKeys, totalKeys) {
    const completed = firstValue(progress, completedKeys);
    const total = firstValue(progress, totalKeys);
    if (completed === undefined && total === undefined) {
        return EMPTY_VALUE;
    }
    return `${formatOptionalCount(completed)} / ${formatOptionalCount(total)}`;
}

function bytesPair(progress, completedKeys, totalKeys) {
    const completed = firstValue(progress, completedKeys);
    const total = firstValue(progress, totalKeys);
    if (completed === undefined && total === undefined) {
        return EMPTY_VALUE;
    }
    return `${formatOptionalBytes(completed)} / ${formatOptionalBytes(total)}`;
}

function directionLabel(direction) {
    const value = String(direction || '').toLowerCase();
    if (value === 'push') {
        return 'Push';
    }
    if (value === 'pull') {
        return 'Pull';
    }
    return EMPTY_VALUE;
}

function isPullDirection(payload) {
    return String(payload?.direction || '').toLowerCase() === 'pull';
}

function stringValue(value) {
    const text = String(value || '').trim();
    return text || EMPTY_VALUE;
}

function errorMessage(error) {
    if (error instanceof Error && error.message) {
        return error.message;
    }
    return stringValue(error);
}
