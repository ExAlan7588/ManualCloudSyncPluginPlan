import { invoke } from '/tauri-bridge.js';
import { renderExtensionTemplateAsync } from '/scripts/extensions.js';
import { Popup } from '/scripts/popup.js';

const MODULE_NAME = resolveModuleName(import.meta.url);
const CONFIG_VERSION = 1;
const RELOAD_DELAY_MS = 800;
const BYTE_UNIT_STEP = 1024;
const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];
const DEFAULT_S3_REGION = 'us-east-1';
const DEFAULT_REMOTE_PREFIX = 'manual-cloud-sync';
const LOCAL_WEBDAV_ENDPOINT = 'http://127.0.0.1:1900/';
const LOCAL_WEBDAV_USERNAME = 'webdav';
const BACKEND_WEBDAV = 'web_dav';
const BACKEND_S3 = 's3';
const AUTH_BASIC = 'basic';
const AUTH_BEARER = 'bearer';
const SHA_PREVIEW_LENGTH = 8;
const STATIC_CONTAINER_ID = 'manual_cloud_sync_container';
const SETTINGS_CONTAINER_ID = 'manual_cloud_sync_settings';
const EXTENSION_SETTINGS_TARGETS = ['extensions_settings2', 'extensions_settings'];

const state = {
    busy: false,
    configView: null,
};

function resolveModuleName(moduleUrl) {
    const extensionPath = new URL(moduleUrl).pathname.replace(/\\/g, '/');
    const marker = '/scripts/extensions/';
    const markerIndex = extensionPath.indexOf(marker);
    if (markerIndex === -1) {
        throw new Error(`手動雲端同步無法解析擴充路徑：${moduleUrl}`);
    }

    const relativePath = decodeURIComponent(extensionPath.slice(markerIndex + marker.length));
    if (!relativePath.endsWith('/index.js')) {
        throw new Error(`手動雲端同步入口腳本必須命名為 index.js：${relativePath}`);
    }

    return relativePath.slice(0, -'/index.js'.length);
}

function setStatus(message) {
    $('#mcs_status').text(String(message || ''));
}

function setBusy(busy) {
    state.busy = busy;
    $('#mcs_save_config, #mcs_refresh_queue, #mcs_upload_now, #mcs_download_now, #mcs_use_local_webdav')
        .prop('disabled', busy);
}

function normalizeError(error) {
    if (error instanceof Error && error.message) {
        return error.message;
    }

    if (typeof error === 'string') {
        return error;
    }

    return String(error || '未知錯誤');
}

async function invokeCommand(command, args) {
    try {
        return await invoke(command, args);
    } catch (error) {
        throw new Error(normalizeError(error));
    }
}

function readConfig() {
    return {
        version: CONFIG_VERSION,
        backend: $('#mcs_backend').val(),
        endpoint: String($('#mcs_endpoint').val() || '').trim(),
        remotePrefix: String($('#mcs_remote_prefix').val() || '').trim() || DEFAULT_REMOTE_PREFIX,
        deviceId: String($('#mcs_device_id').val() || '').trim(),
        webdav: {
            authMode: $('#mcs_webdav_auth_mode').val(),
            username: String($('#mcs_webdav_username').val() || '').trim(),
        },
        s3: {
            bucket: String($('#mcs_s3_bucket').val() || '').trim(),
            region: String($('#mcs_s3_region').val() || '').trim() || DEFAULT_S3_REGION,
            pathStyle: Boolean($('#mcs_s3_path_style').prop('checked')),
        },
    };
}

function optionalSecret(selector) {
    const value = String($(selector).val() || '').trim();
    return value ? value : null;
}

function readSecrets() {
    return {
        webdavPassword: optionalSecret('#mcs_webdav_password'),
        webdavToken: optionalSecret('#mcs_webdav_token'),
        s3AccessKey: optionalSecret('#mcs_s3_access_key'),
        s3SecretKey: optionalSecret('#mcs_s3_secret_key'),
        s3SessionToken: optionalSecret('#mcs_s3_session_token'),
    };
}

function fillConfig(view) {
    const config = view?.config || {};
    $('#mcs_backend').val(config.backend || BACKEND_WEBDAV);
    $('#mcs_endpoint').val(config.endpoint || '');
    $('#mcs_remote_prefix').val(config.remotePrefix || DEFAULT_REMOTE_PREFIX);
    $('#mcs_device_id').val(config.deviceId || '');
    $('#mcs_webdav_auth_mode').val(config.webdav?.authMode || AUTH_BASIC);
    $('#mcs_webdav_username').val(config.webdav?.username || '');
    $('#mcs_s3_bucket').val(config.s3?.bucket || '');
    $('#mcs_s3_region').val(config.s3?.region || DEFAULT_S3_REGION);
    $('#mcs_s3_path_style').prop('checked', config.s3?.pathStyle ?? true);
    applySecretPlaceholders(view?.secrets || {});
    refreshBackendFields();
}

function applySecretPlaceholders(secrets) {
    $('#mcs_webdav_password').attr('placeholder', secrets.hasWebdavPassword ? '已儲存' : '');
    $('#mcs_webdav_token').attr('placeholder', secrets.hasWebdavToken ? '已儲存' : '');
    $('#mcs_s3_access_key').attr('placeholder', secrets.hasS3AccessKey ? '已儲存' : '');
    $('#mcs_s3_secret_key').attr('placeholder', secrets.hasS3SecretKey ? '已儲存' : '');
    $('#mcs_s3_session_token').attr('placeholder', secrets.hasS3SessionToken ? '已儲存' : '');
}

function clearSecretInputs() {
    $('#mcs_webdav_password, #mcs_webdav_token, #mcs_s3_access_key, #mcs_s3_secret_key, #mcs_s3_session_token')
        .val('');
}

function refreshBackendFields() {
    const backend = String($('#mcs_backend').val() || BACKEND_WEBDAV);
    const webdavAuthMode = String($('#mcs_webdav_auth_mode').val() || AUTH_BASIC);
    const isWebDav = backend === BACKEND_WEBDAV;
    const isBasic = webdavAuthMode === AUTH_BASIC;
    $('#mcs_webdav_basic_credentials').prop('hidden', !(isWebDav && isBasic));
    $('#mcs_webdav_advanced_fields').prop('hidden', !isWebDav);
    $('#mcs_s3_fields').prop('hidden', backend !== BACKEND_S3);
    $('.mcs-bearer-field').prop('hidden', !(isWebDav && webdavAuthMode === AUTH_BEARER));
}

async function loadConfig() {
    const view = await invokeCommand('cloud_sync_get_config');
    state.configView = view;
    fillConfig(view);
    return view;
}

async function saveConfig() {
    const config = readConfig();
    const secrets = readSecrets();
    validateBeforeSave(config, secrets);
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

function validateBeforeSave(config, secrets) {
    validateEndpoint(config.endpoint);
    validateRemotePrefix(config.remotePrefix);

    if (config.backend === BACKEND_WEBDAV) {
        validateWebDavConfig(config, secrets);
        return;
    }

    if (config.backend === BACKEND_S3) {
        validateS3Config(config, secrets);
        return;
    }

    throw new Error(`不支援的同步後端：${config.backend}`);
}

function validateEndpoint(endpoint) {
    if (!endpoint) {
        throw new Error('請填寫端點 URL');
    }

    let url;
    try {
        url = new URL(endpoint);
    } catch {
        throw new Error('端點 URL 格式不正確');
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('端點 URL 必須使用 http 或 https');
    }
}

function validateRemotePrefix(remotePrefix) {
    if (remotePrefix.includes('\\')) {
        throw new Error('遠端路徑前綴必須使用 /，不能使用 \\');
    }

    if (remotePrefix.split('/').some(segment => segment === '..')) {
        throw new Error('遠端路徑前綴不能包含 .. 路徑片段');
    }
}

function validateWebDavConfig(config, secrets) {
    const authMode = config.webdav.authMode || AUTH_BASIC;
    if (authMode === AUTH_BASIC) {
        requireText(config.webdav.username, '請填寫 WebDAV 使用者名稱');
        requireSecret(secrets.webdavPassword, 'hasWebdavPassword', '請填寫 WebDAV 密碼');
        return;
    }

    if (authMode === AUTH_BEARER) {
        requireSecret(secrets.webdavToken, 'hasWebdavToken', '請填寫 WebDAV Bearer Token');
        return;
    }

    throw new Error(`不支援的 WebDAV 驗證方式：${authMode}`);
}

function validateS3Config(config, secrets) {
    requireText(config.s3.bucket, '請填寫 S3 Bucket');
    requireText(config.s3.region, '請填寫 S3 Region');
    requireSecret(secrets.s3AccessKey, 'hasS3AccessKey', '請填寫 S3 Access Key');
    requireSecret(secrets.s3SecretKey, 'hasS3SecretKey', '請填寫 S3 Secret Key');
}

function requireText(value, message) {
    if (!String(value || '').trim()) {
        throw new Error(message);
    }
}

function requireSecret(value, savedKey, message) {
    if (String(value || '').trim() || Boolean(state.configView?.secrets?.[savedKey])) {
        return;
    }

    throw new Error(message);
}

async function onSaveClick() {
    await runAction('雲端同步設定已儲存', async () => {
        await saveConfig();
        renderQueue([]);
    });
}

async function onRefreshQueueClick() {
    await runAction('雲端同步佇列已更新', async () => {
        await saveConfig();
        const queue = await invokeCommand('cloud_sync_list_queue');
        renderQueue(queue);
    });
}

async function onUploadClick() {
    await runAction('雲端同步上傳完成', async () => {
        await saveConfig();
        const result = await invokeCommand('cloud_sync_upload_now');
        renderQueue([result.item]);
    });
}

async function onDownloadClick() {
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

function renderQueue(queue) {
    const container = document.getElementById('mcs_queue');
    container.replaceChildren();
    if (!Array.isArray(queue) || queue.length === 0) {
        container.appendChild(emptyQueueElement());
        return;
    }

    for (const item of queue) {
        container.appendChild(queueItemElement(item));
    }
}

function emptyQueueElement() {
    const element = document.createElement('small');
    element.className = 'extensions_info mcs-empty';
    element.textContent = '佇列是空的';
    return element;
}

function queueItemElement(item) {
    const root = document.createElement('div');
    root.className = 'mcs-item';
    root.appendChild(queueItemMain(item));
    root.appendChild(deleteButton(item?.manifest?.file));
    return root;
}

function queueItemMain(item) {
    const main = document.createElement('div');
    main.className = 'mcs-item-main';
    const title = document.createElement('div');
    title.className = 'mcs-item-title';
    title.textContent = item?.manifest?.file || '';
    const meta = document.createElement('div');
    meta.className = 'mcs-item-meta';
    meta.textContent = queueItemMeta(item);
    main.append(title, meta);
    return main;
}

function queueItemMeta(item) {
    const manifest = item?.manifest || {};
    return [
        formatBytes(Number(manifest.sizeBytes || 0)),
        manifest.createdAt || '',
        manifest.deviceId ? `來源：${manifest.deviceId}` : '',
        manifest.sha256 ? `SHA-256：${manifest.sha256.slice(0, SHA_PREVIEW_LENGTH)}` : '',
    ].filter(Boolean).join(' | ');
}

function deleteButton(fileName) {
    const button = document.createElement('button');
    button.className = 'menu_button menu_button_icon margin0';
    button.type = 'button';
    button.title = '刪除遠端項目';
    button.innerHTML = '<i class="fa-solid fa-trash"></i>';
    button.addEventListener('click', () => onDeleteRemoteItem(fileName));
    return button;
}

async function onDeleteRemoteItem(fileName) {
    if (!fileName) {
        return;
    }

    await runAction('遠端同步項目已刪除', async () => {
        await invokeCommand('cloud_sync_delete_remote_item', { fileName });
        const queue = await invokeCommand('cloud_sync_list_queue');
        renderQueue(queue);
    });
}

function formatBytes(sizeBytes) {
    let size = Number.isFinite(sizeBytes) ? Math.max(0, sizeBytes) : 0;
    let unitIndex = 0;
    while (size >= BYTE_UNIT_STEP && unitIndex < BYTE_UNITS.length - 1) {
        size /= BYTE_UNIT_STEP;
        unitIndex += 1;
    }
    return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${BYTE_UNITS[unitIndex]}`;
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

jQuery(async () => {
    const container = getOrCreateContainer();
    if (container.querySelector(`#${SETTINGS_CONTAINER_ID}`)) {
        throw new Error('手動雲端同步設定面板已經掛載');
    }

    const html = await renderExtensionTemplateAsync(MODULE_NAME, 'settings');
    container.insertAdjacentHTML('beforeend', html);
    $('#mcs_backend, #mcs_webdav_auth_mode').on('change', refreshBackendFields);
    $('#mcs_save_config').on('click', onSaveClick);
    $('#mcs_refresh_queue').on('click', onRefreshQueueClick);
    $('#mcs_upload_now').on('click', onUploadClick);
    $('#mcs_download_now').on('click', onDownloadClick);
    $('#mcs_use_local_webdav').on('click', applyLocalWebDavPreset);
    ensureDefaultFormState();
    refreshBackendFields();

    try {
        await loadConfig();
        renderQueue([]);
    } catch (error) {
        setStatus(normalizeError(error));
    }
});

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
