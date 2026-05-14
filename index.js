import { renderExtensionTemplateAsync } from '/scripts/extensions.js';
import { Popup } from '/scripts/popup.js';
import {
    AUTH_BASIC,
    BACKEND_WEBDAV,
    DEFAULT_REMOTE_PREFIX,
    DEFAULT_S3_REGION,
    LOCAL_WEBDAV_ENDPOINT,
    LOCAL_WEBDAV_USERNAME,
    MODE_COMPAT,
    MODE_NATIVE,
    RELOAD_DELAY_MS,
} from './modules/constants.js';
import {
    applySecretPlaceholders,
    clearSecretInputs,
    fillConfig,
    readConfig,
    readSecrets,
    refreshBackendFields,
    saveCompatConfig,
    validateBeforeSave,
    loadCompatConfigView,
} from './modules/config.js';
import {
    backendCommandMissingMessage,
    isCloudSyncCommandMissingError,
    normalizeError,
} from './modules/errors.js';
import {
    compatDeleteRemoteItem,
    compatDownloadAndImport,
    compatListQueue,
    compatOldestQueueItem,
    compatUploadArchive,
    runCompatExportToFile,
} from './modules/webdav-compat.js';
import { renderQueue } from './modules/queue-renderer.js';
import { bindTtSyncPanel } from './modules/tt-sync.js';

const MODULE_NAME = resolveModuleName(import.meta.url);
const STATIC_CONTAINER_ID = 'manual_cloud_sync_container';
const SETTINGS_CONTAINER_ID = 'manual_cloud_sync_settings';
const EXTENSION_SETTINGS_TARGETS = ['extensions_settings2', 'extensions_settings'];
const BUSY_SELECTOR = [
    '#manual_cloud_sync_settings button:not(#mcs_tts_cancel)',
    '#mcs_upload_archive_input',
].join(', ');

const state = {
    busy: false,
    configView: null,
    mode: MODE_NATIVE,
};

let tauriBridgePromise = null;

export function resolveModuleName(moduleUrl) {
    const extensionPath = new URL(moduleUrl).pathname.replace(/\\/g, '/');
    const marker = '/scripts/extensions/';
    const markerIndex = extensionPath.indexOf(marker);
    if (markerIndex === -1) {
        throw new Error(`手動雲端同步無法解析擴充路徑：${moduleUrl}`);
    }

    const relativePath = decodeExtensionPath(extensionPath.slice(markerIndex + marker.length), moduleUrl);
    if (!relativePath.endsWith('/index.js')) {
        throw new Error(`手動雲端同步入口腳本必須命名為 index.js：${relativePath}`);
    }

    return relativePath.slice(0, -'/index.js'.length);
}

function decodeExtensionPath(pathname, moduleUrl) {
    try {
        return decodeURIComponent(pathname);
    } catch (error) {
        throw new Error(`手動雲端同步擴充路徑 URL 編碼不正確：${moduleUrl}：${errorMessage(error)}`);
    }
}

function setStatus(message) {
    $('#mcs_status').text(String(message || ''));
}

function setBusy(busy) {
    state.busy = busy;
    $(BUSY_SELECTOR).prop('disabled', busy);
}

async function invokeCommand(command, args) {
    try {
        return await invokeViaTauriBridge(command, args);
    } catch (error) {
        const commandMissingMessage = backendCommandMissingMessage(error);
        if (commandMissingMessage) {
            throw error;
        }

        throw new Error(normalizeError(error));
    }
}

async function invokeViaTauriBridge(command, args) {
    const invoke = await resolveTauriInvoke(command);
    return invoke(command, args);
}

async function resolveTauriInvoke(command) {
    const globalInvoke = window.__TAURI__?.core?.invoke;
    if (typeof globalInvoke === 'function') {
        return globalInvoke.bind(window.__TAURI__.core);
    }

    try {
        const bridge = await loadTauriBridge();
        if (typeof bridge.invoke === 'function') {
            return bridge.invoke;
        }
    } catch (error) {
        throw missingTauriCommand(command, error);
    }

    throw missingTauriCommand(command, new Error('Tauri bridge does not export invoke'));
}

async function loadTauriBridge() {
    if (!tauriBridgePromise) {
        tauriBridgePromise = import('/tauri-bridge.js').catch(error => {
            tauriBridgePromise = null;
            throw error;
        });
    }

    return tauriBridgePromise;
}

function missingTauriCommand(command, cause) {
    return new Error(`Command ${command} not found: Tauri bridge unavailable (${errorMessage(cause)})`);
}

function errorMessage(error) {
    if (error instanceof Error && error.message) {
        return error.message;
    }

    return String(error || 'unknown error');
}

async function loadConfig() {
    try {
        const view = await invokeCommand('cloud_sync_get_config');
        state.mode = MODE_NATIVE;
        state.configView = view;
        fillConfig(view);
        refreshModeUi();
        return view;
    } catch (error) {
        if (!isCloudSyncCommandMissingError(error)) {
            throw error;
        }

        state.mode = MODE_COMPAT;
        const view = loadCompatConfigView();
        state.configView = view;
        fillConfig(view);
        refreshModeUi();
        return view;
    }
}

async function saveConfig() {
    const config = readConfig();
    const secrets = readSecrets();
    validateBeforeSave(config, secrets, {
        configView: state.configView,
        mode: state.mode,
    });

    if (state.mode === MODE_COMPAT) {
        const view = saveCompatConfig(config, secrets);
        state.configView = view;
        clearSecretInputs();
        fillConfig(view);
        return view;
    }

    const view = await invokeCommand('cloud_sync_save_config', {
        dto: {
            config,
            secrets,
        },
    });
    state.configView = view;
    clearSecretInputs();
    fillConfig(view);
    return view;
}

function refreshModeUi() {
    const compat = state.mode === MODE_COMPAT;
    $('#mcs_compat_actions').prop('hidden', !compat);
    $('#mcs_upload_now').prop('hidden', compat);
    $('#mcs_mode_notice').text(compat ? compatModeNotice() : nativeModeNotice());
}

function compatModeNotice() {
    return '模式：資料遷移相容模式。這台酒館沒有 cloud_sync 後端，支援 WebDAV 佇列、選擇 zip 上傳、下載後用資料遷移匯入；匯入是合併覆蓋同路徑，不是 mirror 刪除。';
}

function nativeModeNotice() {
    return '模式：原生雲端同步。上傳、下載、校驗與 mirror 匯入由 TauriTavern 後端執行。';
}

async function onSaveClick() {
    await runAction('雲端同步設定已儲存', async () => {
        await saveConfig();
        renderQueue([], onDeleteRemoteItem);
    });
}

async function onRefreshQueueClick() {
    await runAction('雲端同步佇列已更新', async () => {
        await saveConfig();
        const queue = state.mode === MODE_COMPAT
            ? await compatListQueue()
            : await invokeCommand('cloud_sync_list_queue');
        renderQueue(queue, onDeleteRemoteItem);
    });
}

async function onUploadClick() {
    if (state.mode === MODE_COMPAT) {
        $('#mcs_upload_archive_input').trigger('click');
        return;
    }

    await runAction('雲端同步上傳完成', async () => {
        await saveConfig();
        const result = await invokeCommand('cloud_sync_upload_now');
        renderQueue([result.item], onDeleteRemoteItem);
    });
}

async function onDownloadClick() {
    if (state.mode === MODE_COMPAT) {
        await onCompatDownloadClick();
        return;
    }

    const confirmed = await Popup.show.confirm(
        '確認下載雲端同步資料',
        '下載後會以遠端同步包鏡像覆蓋本機資料，並刪除同步包中不存在的本機檔案。要繼續嗎？',
    );
    if (!confirmed) {
        return;
    }

    await runAction('雲端同步下載完成', async () => {
        await saveConfig();
        await invokeCommand('cloud_sync_download_now');
        setTimeout(() => location.reload(), RELOAD_DELAY_MS);
    });
}

async function onCompatDownloadClick() {
    const confirmed = await Popup.show.confirm(
        '確認匯入遠端同步包',
        '這台酒館沒有 cloud_sync 後端，會改用資料遷移匯入：同路徑檔案會覆蓋，但不會 mirror 刪除本機多出的檔案。要繼續嗎？',
    );
    if (!confirmed) {
        return;
    }

    await runAction('遠端同步包已匯入', async () => {
        await saveConfig();
        const item = await compatOldestQueueItem();
        await compatDownloadAndImport(item, { setStatus });
        setTimeout(() => location.reload(), RELOAD_DELAY_MS);
    });
}

async function onExportArchiveClick() {
    await runAction('資料封存已匯出', async () => {
        await runCompatExportToFile({ setStatus });
    });
}

function onSelectArchiveUploadClick() {
    $('#mcs_upload_archive_input').trigger('click');
}

async function onUploadArchiveInputChange(event) {
    const input = event.currentTarget;
    const file = input?.files?.[0] || null;
    input.value = '';
    if (!file) {
        return;
    }

    await runAction('雲端同步上傳完成', async () => {
        await saveConfig();
        const result = await compatUploadArchive(file, { setStatus });
        renderQueue([result.item], onDeleteRemoteItem);
    });
}

async function onDeleteRemoteItem(fileName) {
    if (!fileName) {
        return;
    }

    await runAction('遠端同步項目已刪除', async () => {
        if (state.mode === MODE_COMPAT) {
            await compatDeleteRemoteItem(fileName);
        } else {
            await invokeCommand('cloud_sync_delete_remote_item', { fileName });
        }
        const queue = state.mode === MODE_COMPAT
            ? await compatListQueue()
            : await invokeCommand('cloud_sync_list_queue');
        renderQueue(queue, onDeleteRemoteItem);
    });
}

async function runAction(successMessage, action) {
    if (state.busy) {
        toastr.warning('雲端同步正在執行中');
        return;
    }

    setBusy(true);
    setStatus('處理中...');
    try {
        await action();
        setStatus(successMessage);
        toastr.success(successMessage);
    } catch (error) {
        const message = normalizeError(error);
        setStatus(message);
        toastr.error(message, '雲端同步失敗');
    } finally {
        setBusy(false);
    }
}

function applyLocalWebDavPreset() {
    $('#mcs_backend').val(BACKEND_WEBDAV);
    $('#mcs_endpoint').val(LOCAL_WEBDAV_ENDPOINT);
    $('#mcs_remote_prefix').val(DEFAULT_REMOTE_PREFIX);
    $('#mcs_webdav_auth_mode').val(AUTH_BASIC);
    $('#mcs_webdav_username').val(LOCAL_WEBDAV_USERNAME);
    refreshBackendFields();
    setStatus('已套用本機 WebDAV 開發服務設定，請填入密碼後儲存');
}

function findExtensionSettingsTarget() {
    for (const targetId of EXTENSION_SETTINGS_TARGETS) {
        const target = document.getElementById(targetId);
        if (target) {
            return target;
        }
    }

    throw new Error('手動雲端同步找不到掛載位置：#extensions_settings2 或 #extensions_settings');
}

function getOrCreateContainer() {
    const existing = document.getElementById(STATIC_CONTAINER_ID);
    if (existing) {
        return existing;
    }

    const container = document.createElement('div');
    container.id = STATIC_CONTAINER_ID;
    container.className = 'extension_container';
    findExtensionSettingsTarget().appendChild(container);
    return container;
}

function bindFullArchivePanel() {
    $('#mcs_backend, #mcs_webdav_auth_mode').on('change', refreshBackendFields);
    $('#mcs_save_config').on('click', onSaveClick);
    $('#mcs_refresh_queue').on('click', onRefreshQueueClick);
    $('#mcs_upload_now').on('click', onUploadClick);
    $('#mcs_download_now').on('click', onDownloadClick);
    $('#mcs_use_local_webdav').on('click', applyLocalWebDavPreset);
    $('#mcs_export_archive').on('click', onExportArchiveClick);
    $('#mcs_select_archive_upload').on('click', onSelectArchiveUploadClick);
    $('#mcs_upload_archive_input').on('change', onUploadArchiveInputChange);
}

function bindIncrementalPanel() {
    bindTtSyncPanel({
        confirm: Popup.show.confirm,
        fetch: window.fetch.bind(window),
        invokeCommand,
        listen: window.__TAURI__?.event?.listen?.bind(window.__TAURI__.event),
        runAction,
        scheduleReload: () => setTimeout(() => location.reload(), RELOAD_DELAY_MS),
    });
}

function ensureDefaultFormState() {
    if (!$('#mcs_backend').val()) {
        $('#mcs_backend').val(BACKEND_WEBDAV);
    }
    if (!$('#mcs_webdav_auth_mode').val()) {
        $('#mcs_webdav_auth_mode').val(AUTH_BASIC);
    }
    if (!String($('#mcs_remote_prefix').val() || '').trim()) {
        $('#mcs_remote_prefix').val(DEFAULT_REMOTE_PREFIX);
    }
    if (!String($('#mcs_s3_region').val() || '').trim()) {
        $('#mcs_s3_region').val(DEFAULT_S3_REGION);
    }
    if (!$('#mcs_s3_path_style').prop('checked')) {
        $('#mcs_s3_path_style').prop('checked', true);
    }
}

jQuery(async () => {
    const container = getOrCreateContainer();
    if (container.querySelector(`#${SETTINGS_CONTAINER_ID}`)) {
        throw new Error('手動雲端同步設定面板已經掛載');
    }

    const html = await renderExtensionTemplateAsync(MODULE_NAME, 'settings');
    container.insertAdjacentHTML('beforeend', html);
    bindFullArchivePanel();
    bindIncrementalPanel();
    ensureDefaultFormState();
    refreshBackendFields();
    refreshModeUi();
    applySecretPlaceholders({});

    try {
        await loadConfig();
        renderQueue([], onDeleteRemoteItem);
    } catch (error) {
        setStatus(normalizeError(error));
    }
});
