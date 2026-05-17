import { formatBytes } from './format.js';
import { createProgressTracker, progressRows } from './tt-sync-progress.js';

const CONFLICT_DECISIONS = Object.freeze({
    local: 'local',
    remote: 'remote',
});
const CONFLICT_DECISION_LABELS = Object.freeze({
    local: '使用本機',
    remote: '使用遠端',
});
const EMPTY_VALUE = '未回傳';

export function renderServerOptions(servers) {
    const select = document.getElementById('mcs_tts_server');
    select.replaceChildren();
    if (servers.length === 0) {
        select.appendChild(optionElement('', '沒有已配對服務端'));
        renderTtStatus('沒有已配對服務端');
        return false;
    }

    for (const server of servers) {
        select.appendChild(optionElement(serverIdOf(server), serverLabel(server)));
    }
    return true;
}

export function renderSelectedServer(state) {
    const serverId = selectedServerId();
    const server = state.servers.find(item => serverIdOf(item) === serverId);
    renderTtStatus(server ? serverStatus(server) : '未選擇服務端');
}

export function renderTransferSummary(result) {
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

export function renderProgress(progress, tracker = createProgressTracker()) {
    const container = document.getElementById('mcs_tts_progress');
    container.replaceChildren();
    if (!progress) {
        container.appendChild(emptyInfo('尚無進度'));
        return;
    }

    for (const row of progressRows(progress, tracker)) {
        container.appendChild(metricElement(row.label, row.value));
    }
}

export function renderTransferArtifacts(state, payload) {
    renderTransferSummary(payload);
    renderDiffSummary(payload);
    renderConflictList(state, payload);
}

export function renderDiffSummary(payload) {
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

export function renderConflictList(state, payload) {
    const container = document.getElementById('mcs_tts_conflicts');
    container.replaceChildren();
    if (payload) {
        state.lastConflictPayload = payload;
    }
    const conflicts = conflictListFrom(payload);
    if (conflicts.length === 0) {
        const text = hasConflictCount(payload) ? '衝突內容未回傳' : '尚無衝突';
        container.appendChild(emptyInfo(text));
        return;
    }
    for (const conflict of conflicts) {
        container.appendChild(conflictElement(state, conflict));
    }
}

export function renderTtStatus(message) {
    $('#mcs_tts_status').text(String(message || ''));
}

export function resetConflictState(state) {
    state.conflictChoices.clear();
    state.lastConflictPayload = null;
}

export function transferSummaryRows(result) {
    return [
        { label: '方向', value: directionLabel(result?.direction) },
        { label: '檔案數', value: formatOptionalCount(firstValue(result, ['files_total', 'filesTotal', 'totalFiles'])) },
        { label: '大小', value: formatOptionalBytes(firstValue(result, ['bytes_total', 'bytesTotal', 'totalBytes'])) },
        { label: '刪除檔案', value: formatOptionalCount(firstValue(result, ['files_deleted', 'filesDeleted', 'deletedFiles'])) },
    ];
}

export function diffSummaryRows(payload) {
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

export function submittedProgress(direction) {
    return {
        bytes_done: 0,
        bytes_total: 0,
        direction: directionLabel(direction),
        files_done: 0,
        files_total: 0,
        phase: '已送出',
    };
}

export function progressStatus(progress) {
    return `TT-Sync ${directionLabel(progress?.direction)} ${stringValue(progress?.phase)}`;
}

export function hasObjectPayload(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0);
}

export function serverListFrom(result) {
    if (Array.isArray(result)) {
        return validatedServerList(result);
    }
    if (Array.isArray(result?.servers)) {
        return validatedServerList(result.servers);
    }
    if (result?.servers !== undefined && result?.servers !== null) {
        throw new Error('TT-Sync 服務端列表格式不正確');
    }
    return [];
}

function validatedServerList(servers) {
    if (!servers.every(isServerItem)) {
        throw new Error('TT-Sync 服務端列表格式不正確');
    }
    return servers;
}

function isServerItem(value) {
    return isRecordObject(value) && serverIdText(value) !== '';
}

export function serverIdOf(server) {
    return serverIdText(server);
}

export function serverLabel(server) {
    return [
        serverDisplayText(server?.server_device_name || server?.serverDeviceName || server?.name) || serverIdOf(server),
        serverBaseUrl(server),
    ].filter(Boolean).join(' | ');
}

export function serverStatus(server) {
    const baseUrl = serverBaseUrl(server);
    const lastSyncText = serverTimestampText(server?.last_sync_ms);
    return [
        baseUrl ? `端點：${baseUrl}` : '',
        lastSyncText ? `最後同步：${lastSyncText}` : '',
        permissionsText(server?.permissions),
    ].filter(Boolean).join(' | ') || '已選擇服務端';
}

export function serverBaseUrl(server) {
    return serverDisplayText(server?.base_url || server?.baseUrl || server?.endpoint);
}

export function selectedServerId() {
    return String($('#mcs_tts_server').val() || '').trim();
}

export function requireSelectedServerId() {
    const serverId = selectedServerId();
    if (!serverId) {
        throw new Error('請先選擇已配對的 TT-Sync 服務端');
    }
    return serverId;
}

export function directionLabel(direction) {
    const value = String(direction || '').toLowerCase();
    if (value === 'push') {
        return 'Push';
    }
    if (value === 'pull') {
        return 'Pull';
    }
    return EMPTY_VALUE;
}

export function isPullDirection(payload) {
    return String(payload?.direction || '').toLowerCase() === 'pull';
}

export function stringValue(value) {
    if (!isTextScalar(value)) {
        return EMPTY_VALUE;
    }
    const text = String(value || '').trim();
    return text || EMPTY_VALUE;
}

export function errorMessage(error) {
    if (error instanceof Error && error.message) {
        return error.message;
    }
    return stringValue(error);
}

export function firstValue(object, keys, fallback) {
    for (const key of keys) {
        if (object?.[key] !== undefined && object?.[key] !== null) {
            return object[key];
        }
    }
    return fallback;
}

export function firstObject(object, keys) {
    for (const key of keys) {
        if (isRecordObject(object?.[key])) {
            return object[key];
        }
    }
    return null;
}

export function formatOptionalCount(value) {
    const number = nonNegativeIntegerValue(value);
    return Number.isFinite(number) ? String(number) : EMPTY_VALUE;
}

export function formatOptionalBytes(value) {
    const number = nonNegativeIntegerValue(value);
    return Number.isFinite(number) ? formatBytes(number) : EMPTY_VALUE;
}

function nonNegativeIntegerValue(value) {
    if (typeof value === 'number') {
        return Number.isSafeInteger(value) && value >= 0 ? value : null;
    }
    if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) {
        return null;
    }
    const number = Number(value);
    return Number.isSafeInteger(number) ? number : null;
}

function isTextScalar(value) {
    if (typeof value === 'number') {
        return Number.isFinite(value);
    }
    return typeof value === 'bigint' || typeof value === 'string';
}

function serverDisplayText(value) {
    if (!isTextScalar(value)) {
        return '';
    }
    return String(value || '').trim();
}

function serverIdText(server) {
    return serverDisplayText(
        server?.server_device_id ?? server?.serverDeviceId ?? server?.serverId ?? server?.id,
    );
}

function diffSummaryFrom(payload) {
    return firstObject(payload, ['diff', 'summary', 'preTransferDiff', 'pre_transfer_diff'])
        || firstObject(payload?.plan, ['summary'])
        || payload;
}

function conflictListFrom(payload) {
    const candidates = [
        firstValue(payload, ['conflicts']),
        firstValue(payload?.diff, ['conflicts']),
        firstValue(payload?.plan, ['conflicts']),
    ];
    const conflicts = candidates.find(value => value !== undefined);
    if (conflicts === undefined) {
        return [];
    }
    if (!Array.isArray(conflicts)) {
        throw new Error('TT-Sync 衝突列表格式不正確');
    }
    if (!conflicts.every(isConflictItem)) {
        throw new Error('TT-Sync 衝突列表格式不正確');
    }
    return conflicts;
}

function isConflictItem(value) {
    return isRecordObject(value)
        && hasConflictPath(value)
        && isConflictEntry(value.local)
        && isConflictEntry(value.remote);
}

function hasConflictPath(value) {
    return stringValue(value.path) !== EMPTY_VALUE;
}

function isConflictEntry(value) {
    return value === undefined || value === null || isRecordObject(value);
}

function isRecordObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasVisibleRows(rows) {
    return rows.some(row => row.value !== EMPTY_VALUE);
}

function hasConflictCount(payload) {
    const summary = diffSummaryFrom(payload);
    const count = nonNegativeIntegerValue(firstValue(summary, ['conflictFiles', 'conflict_files']));
    return Number.isFinite(count) && count > 0;
}

function conflictElement(state, conflict) {
    const root = document.createElement('div');
    root.className = 'mcs-conflict';
    const title = document.createElement('strong');
    title.textContent = stringValue(conflict?.path);
    const meta = document.createElement('span');
    meta.className = 'mcs-conflict-meta';
    const decision = selectedConflictDecision(state, conflict);
    meta.textContent = conflictMetaText(conflict, decision);
    root.append(title, meta, conflictActionRow(state, conflict, decision));
    return root;
}

function conflictActionRow(state, conflict, decision) {
    const row = document.createElement('div');
    row.className = 'mcs-conflict-actions';
    for (const option of Object.values(CONFLICT_DECISIONS)) {
        row.appendChild(conflictDecisionButton(state, conflict, option, decision));
    }
    return row;
}

function conflictDecisionButton(state, conflict, decision, selectedDecision) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `menu_button menu_button_icon mcs-conflict-choice${selectedDecision === decision ? ' is-selected' : ''}`;
    button.setAttribute('aria-pressed', String(selectedDecision === decision));
    button.textContent = CONFLICT_DECISION_LABELS[decision];
    button.addEventListener('click', () => setConflictDecision(state, conflict, decision));
    return button;
}

function selectedConflictDecision(state, conflict) {
    const decision = state.conflictChoices.get(conflictKey(conflict))
        || firstValue(conflict, ['selectedDecision']);
    return isConflictDecision(decision) ? decision : null;
}

function setConflictDecision(state, conflict, decision) {
    state.conflictChoices.set(conflictKey(conflict), decision);
    renderConflictList(state, state.lastConflictPayload);
}

function conflictKey(conflict) {
    return stringValue(conflict?.path);
}

function isConflictDecision(value) {
    return value === CONFLICT_DECISIONS.local || value === CONFLICT_DECISIONS.remote;
}

function conflictMetaText(conflict, decision) {
    return [
        entryText('本機', conflict?.local),
        entryText('遠端', conflict?.remote),
        decision ? `選擇 ${CONFLICT_DECISION_LABELS[decision]}` : '',
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

function optionElement(value, text) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    return option;
}

function timestampText(value) {
    const number = nonNegativeIntegerValue(value);
    if (!Number.isFinite(number)) {
        return stringValue(value);
    }
    const date = new Date(number);
    return Number.isNaN(date.getTime()) ? stringValue(value) : date.toISOString();
}

function serverTimestampText(value) {
    return isTextScalar(value) ? timestampText(value) : '';
}

function permissionsText(permissions) {
    if (!permissions) {
        return '';
    }
    return `權限：read=${booleanText(permissions.read)}, write=${booleanText(permissions.write)}, mirror_delete=${booleanText(permissions.mirror_delete)}`;
}

function booleanText(value) {
    if (typeof value !== 'boolean') {
        return EMPTY_VALUE;
    }
    return value ? 'yes' : 'no';
}
