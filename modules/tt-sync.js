import { formatBytes } from './format.js';

const TT_COMMANDS = {
    checkDiff: 'tt_sync_check_diff',
    listServers: 'tt_sync_list_servers',
    pair: 'tt_sync_pair',
    pull: 'tt_sync_pull',
    push: 'tt_sync_push',
    unpair: 'tt_sync_unpair',
};
const CONFLICT_LOCAL = 'local';
const CONFLICT_REMOTE = 'remote';
const EMPTY_VALUE = '未回傳';

export function bindTtSyncPanel(deps) {
    const controller = createTtSyncController(deps);
    controller.bind();
    controller.renderInitialState();
    return controller;
}

function createTtSyncController(deps) {
    const state = {
        conflictDecisions: {},
        conflicts: [],
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
    $('#mcs_tts_check_diff').on('click', () => checkDiff(deps, state));
    $('#mcs_tts_push').on('click', () => runTransfer(deps, state, 'push'));
    $('#mcs_tts_pull').on('click', () => runTransfer(deps, state, 'pull'));
    $('#mcs_tts_unpair').on('click', () => unpairServer(deps, state));
    $('#mcs_tts_server').on('change', () => renderSelectedServer(state));
}

function renderInitialState() {
    renderTtStatus('尚未讀取服務端');
    renderDiffSummary(null);
    renderProgress(null);
    renderConflicts([], {});
}

async function pairServer(deps, state) {
    await deps.runAction('TT-Sync 服務端已配對', async () => {
        const dto = readPairDto();
        const result = await deps.invokeCommand(TT_COMMANDS.pair, { dto });
        renderProgress(result?.progress || result);
        await loadServers(deps, state);
    });
}

async function refreshServers(deps, state) {
    await deps.runAction('TT-Sync 服務端已更新', async () => {
        await loadServers(deps, state);
    });
}

async function checkDiff(deps, state) {
    await deps.runAction('TT-Sync 差異摘要已更新', async () => {
        const serverId = requireSelectedServerId();
        const result = await deps.invokeCommand(TT_COMMANDS.checkDiff, {
            dto: { serverId },
        });
        state.conflictDecisions = {};
        state.conflicts = conflictListFrom(result);
        renderDiffSummary(result);
        renderProgress(result?.progress || result?.summary || null);
        renderConflicts(state.conflicts, state.conflictDecisions);
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
        assertNoUnresolvedConflicts(state);
        const result = await deps.invokeCommand(TT_COMMANDS[direction], {
            dto: transferDto(direction, state),
        });
        renderDiffSummary(result);
        renderProgress(result?.progress || result?.summary || result);
        state.conflicts = conflictListFrom(result);
        renderConflicts(state.conflicts, state.conflictDecisions);
    });
}

async function unpairServer(deps, state) {
    await deps.runAction('TT-Sync 服務端已解除配對', async () => {
        const serverId = requireSelectedServerId();
        await deps.invokeCommand(TT_COMMANDS.unpair, { dto: { serverId } });
        state.conflictDecisions = {};
        state.conflicts = [];
        await loadServers(deps, state);
    });
}

async function loadServers(deps, state) {
    const result = await deps.invokeCommand(TT_COMMANDS.listServers);
    state.servers = serverListFrom(result);
    renderServerOptions(state.servers);
    renderSelectedServer(state);
}

function readPairDto() {
    const pairingUri = String($('#mcs_tts_pair_uri').val() || '').trim();
    if (!pairingUri) {
        throw new Error('請填寫 TT-Sync 配對 URI');
    }

    return {
        deviceName: String($('#mcs_tts_device_name').val() || '').trim() || null,
        pairingUri,
    };
}

function transferDto(direction, state) {
    return {
        conflictDecisions: state.conflictDecisions,
        direction,
        serverId: requireSelectedServerId(),
    };
}

function assertNoUnresolvedConflicts(state) {
    const unresolved = state.conflicts
        .map(conflictPath)
        .filter(path => path && !state.conflictDecisions[path]);
    if (unresolved.length > 0) {
        throw new Error(`尚有未處理衝突：${unresolved.join('、')}`);
    }
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

function renderDiffSummary(result) {
    const summary = summaryFrom(result);
    const container = document.getElementById('mcs_tts_summary');
    container.replaceChildren();
    if (!summary) {
        container.appendChild(emptyInfo('尚未檢查差異'));
        return;
    }

    const rows = diffRows(summary, result);
    if (isKnownEmptyDiff(rows)) {
        container.appendChild(emptyInfo('沒有需要同步的變更'));
        return;
    }

    for (const row of rows) {
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

function renderConflicts(conflicts, decisions) {
    const container = document.getElementById('mcs_tts_conflicts');
    container.replaceChildren();
    if (!Array.isArray(conflicts) || conflicts.length === 0) {
        container.appendChild(emptyInfo('沒有衝突'));
        return;
    }

    for (const conflict of conflicts) {
        container.appendChild(conflictElement(conflict, conflicts, decisions));
    }
}

function conflictElement(conflict, conflicts, decisions) {
    const path = conflictPath(conflict);
    const root = document.createElement('div');
    root.className = 'mcs-conflict';
    root.append(conflictMain(conflict), conflictActions({ conflicts, decisions, path }));
    return root;
}

function conflictMain(conflict) {
    const main = document.createElement('div');
    main.className = 'mcs-conflict-main';
    const title = document.createElement('div');
    title.className = 'mcs-item-title';
    title.textContent = conflictPath(conflict) || '(未命名路徑)';
    const meta = document.createElement('div');
    meta.className = 'mcs-item-meta';
    meta.textContent = conflictMeta(conflict);
    main.append(title, meta);
    return main;
}

function conflictActions(options) {
    const actions = document.createElement('div');
    actions.className = 'mcs-conflict-actions';
    actions.append(
        conflictDecisionButton({ ...options, choice: CONFLICT_LOCAL }),
        conflictDecisionButton({ ...options, choice: CONFLICT_REMOTE }),
    );
    return actions;
}

function conflictDecisionButton(options) {
    const button = document.createElement('button');
    button.className = 'menu_button menu_button_icon margin0';
    button.type = 'button';
    button.textContent = options.choice === CONFLICT_LOCAL ? '使用本機' : '使用遠端';
    button.toggleAttribute('data-selected', options.decisions[options.path] === options.choice);
    button.addEventListener('click', () => {
        options.decisions[options.path] = options.choice;
        renderConflicts(options.conflicts, options.decisions);
    });
    return button;
}

function diffRows(summary, result) {
    return [
        { label: '待上傳檔案', value: formatOptionalCount(firstValue(summary, ['uploadFiles', 'filesToUpload', 'pushFiles'], countArray(result?.uploads))) },
        { label: '待上傳大小', value: formatOptionalBytes(firstValue(summary, ['uploadBytes', 'bytesToUpload', 'pushBytes'])) },
        { label: '待下載檔案', value: formatOptionalCount(firstValue(summary, ['downloadFiles', 'filesToDownload', 'pullFiles'], countArray(result?.downloads))) },
        { label: '待下載大小', value: formatOptionalBytes(firstValue(summary, ['downloadBytes', 'bytesToDownload', 'pullBytes'])) },
        { label: '待刪除檔案', value: formatOptionalCount(firstValue(summary, ['deleteFiles', 'filesToDelete'], countArray(result?.deletes))) },
        { label: '衝突檔案', value: formatOptionalCount(firstValue(summary, ['conflictFiles', 'conflicts'], countArray(conflictListFrom(result)))) },
    ];
}

function progressRows(progress) {
    return [
        { label: 'phase', value: stringValue(firstValue(progress, ['phase', 'stage'])) },
        { label: 'files', value: progressPair(progress, ['filesTransferred', 'completedFiles'], ['totalFiles', 'fileTotal']) },
        { label: 'bytes', value: bytesPair(progress, ['bytesTransferred', 'completedBytes'], ['totalBytes', 'byteTotal']) },
        { label: '平均速度', value: formatOptionalSpeed(firstValue(progress, ['averageBytesPerSecond', 'speedBytesPerSecond'])) },
        { label: '目前檔案', value: stringValue(firstValue(progress, ['currentPath', 'currentFile'])) },
    ];
}

function conflictMeta(conflict) {
    return [
        localRemoteMeta('本機', conflict?.local),
        localRemoteMeta('遠端', conflict?.remote),
    ].filter(Boolean).join(' | ') || EMPTY_VALUE;
}

function localRemoteMeta(label, value) {
    if (!value) {
        return '';
    }

    return `${label}: ${formatOptionalBytes(value.sizeBytes)} ${stringValue(value.modifiedMs || value.modifiedAt)}`;
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

function summaryFrom(result) {
    if (!result) {
        return null;
    }
    return result.summary || result.diff || result;
}

function conflictListFrom(result) {
    if (Array.isArray(result?.conflicts)) {
        return result.conflicts;
    }
    if (Array.isArray(result?.summary?.conflicts)) {
        return result.summary.conflicts;
    }
    return [];
}

function conflictPath(conflict) {
    return String(conflict?.path || conflict?.filePath || conflict?.relativePath || '').trim();
}

function serverIdOf(server) {
    return String(server?.id || server?.serverId || server?.name || server?.endpoint || '').trim();
}

function serverLabel(server) {
    return [
        server?.name || server?.label || server?.endpoint || serverIdOf(server),
        server?.status || '',
    ].filter(Boolean).join(' | ');
}

function serverStatus(server) {
    return [
        server?.endpoint ? `端點：${server.endpoint}` : '',
        server?.lastSyncAt ? `最後同步：${server.lastSyncAt}` : '',
        server?.status ? `狀態：${server.status}` : '',
    ].filter(Boolean).join(' | ') || '已選擇服務端';
}

function firstValue(object, keys, fallback) {
    for (const key of keys) {
        if (object?.[key] !== undefined && object?.[key] !== null) {
            return object[key];
        }
    }
    return fallback;
}

function countArray(value) {
    return Array.isArray(value) ? value.length : undefined;
}

function formatOptionalCount(value) {
    if (Array.isArray(value)) {
        return String(value.length);
    }

    const number = Number(value);
    return Number.isFinite(number) ? String(number) : EMPTY_VALUE;
}

function formatOptionalBytes(value) {
    const number = Number(value);
    return Number.isFinite(number) ? formatBytes(number) : EMPTY_VALUE;
}

function formatOptionalSpeed(value) {
    const number = Number(value);
    return Number.isFinite(number) ? `${formatBytes(number)}/s` : EMPTY_VALUE;
}

function stringValue(value) {
    const text = String(value || '').trim();
    return text || EMPTY_VALUE;
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

function isKnownEmptyDiff(rows) {
    return rows.every(row => row.value === '0' || row.value === '0 B');
}

function directionLabel(direction) {
    return direction === 'push' ? 'Push' : 'Pull';
}
