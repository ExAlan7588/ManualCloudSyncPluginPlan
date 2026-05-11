import { invoke } from '/tauri-bridge.js';
import { renderExtensionTemplateAsync } from '/scripts/extensions.js';
import { Popup } from '/scripts/popup.js';
import { isAndroidRuntime, isIosRuntime } from '/scripts/util/mobile-runtime.js';

const MODULE_NAME = resolveModuleName(import.meta.url);
const CONFIG_VERSION = 1;
const RELOAD_DELAY_MS = 800;
const BYTE_UNIT_STEP = 1024;
const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];
const JOB_POLL_INTERVAL_MS = 1200;
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
const MODE_NATIVE = 'native';
const MODE_COMPAT = 'compat';
const COMPAT_STORAGE_KEY = 'manual-cloud-sync.compat.v1';
const TERMINAL_JOB_STATES = new Set(['completed', 'failed', 'cancelled']);
const CLOUD_SYNC_FORMAT_VERSION = 1;
const SYNC_FILE_PREFIX = 'sync-';
const SYNC_ZIP_EXTENSION = '.zip';
const SYNC_MANIFEST_EXTENSION = '.json';
const WEBDAV_PROPFIND_BODY = '<?xml version="1.0" encoding="utf-8"?><propfind xmlns="DAV:"><prop><getcontentlength/><getlastmodified/></prop></propfind>';
const JSON_CONTENT_TYPE = 'application/json';
const ZIP_CONTENT_TYPE = 'application/zip';

const state = {
    busy: false,
    configView: null,
    mode: MODE_NATIVE,
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
    $('#mcs_save_config, #mcs_refresh_queue, #mcs_upload_now, #mcs_download_now, #mcs_use_local_webdav, #mcs_export_archive, #mcs_select_archive_upload')
        .prop('disabled', busy);
}

function normalizeError(error) {
    const backendMissingMessage = backendCommandMissingMessage(error);
    if (backendMissingMessage) {
        return backendMissingMessage;
    }

    if (error instanceof Error && error.message) {
        return error.message;
    }

    if (typeof error === 'string') {
        return error;
    }

    return String(error || '未知錯誤');
}

function backendCommandMissingMessage(error) {
    if (!isCloudSyncCommandMissingError(error)) {
        return '';
    }

    return '目前的 TauriTavern 後端沒有雲端同步原生命令。GitHub 插件只能安裝前端面板；此版本會改用資料遷移相容模式。';
}

function isCloudSyncCommandMissingError(error) {
    const message = error instanceof Error ? error.message : String(error || '');
    return /Command cloud_sync_[a-z_]+ not found/.test(message);
}

async function invokeCommand(command, args) {
    try {
        return await invoke(command, args);
    } catch (error) {
        if (isCloudSyncCommandMissingError(error)) {
            throw error;
        }

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
    validateBeforeSave(config, secrets);

    if (state.mode === MODE_COMPAT) {
        const view = saveCompatConfig(config, secrets);
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

function loadCompatConfigView() {
    const stored = readCompatStore();
    const config = normalizeCompatConfig(stored.config);
    const secrets = normalizeCompatSecrets(stored.secrets);
    return buildCompatConfigView(config, secrets);
}

function saveCompatConfig(config, secretInputs) {
    ensureCompatBackend(config);
    const stored = readCompatStore();
    const mergedSecrets = mergeCompatSecrets(stored.secrets, secretInputs);
    const savedConfig = {
        ...config,
        deviceId: config.deviceId || createDeviceId(),
    };
    const nextStore = {
        config: savedConfig,
        secrets: mergedSecrets,
    };
    localStorage.setItem(COMPAT_STORAGE_KEY, JSON.stringify(nextStore));
    const view = buildCompatConfigView(savedConfig, mergedSecrets);
    state.configView = view;
    return view;
}

function readCompatStore() {
    const raw = localStorage.getItem(COMPAT_STORAGE_KEY);
    if (!raw) {
        return {};
    }

    try {
        return JSON.parse(raw);
    } catch (error) {
        throw new Error(`相容模式設定 JSON 解析失敗：${normalizeError(error)}`);
    }
}

function normalizeCompatConfig(config) {
    return {
        version: CONFIG_VERSION,
        backend: config?.backend || BACKEND_WEBDAV,
        endpoint: config?.endpoint || '',
        remotePrefix: config?.remotePrefix || DEFAULT_REMOTE_PREFIX,
        deviceId: config?.deviceId || '',
        webdav: {
            authMode: config?.webdav?.authMode || AUTH_BASIC,
            username: config?.webdav?.username || '',
        },
        s3: {
            bucket: config?.s3?.bucket || '',
            region: config?.s3?.region || DEFAULT_S3_REGION,
            pathStyle: config?.s3?.pathStyle ?? true,
        },
    };
}

function normalizeCompatSecrets(secrets) {
    return {
        webdavPassword: secrets?.webdavPassword || null,
        webdavToken: secrets?.webdavToken || null,
        s3AccessKey: secrets?.s3AccessKey || null,
        s3SecretKey: secrets?.s3SecretKey || null,
        s3SessionToken: secrets?.s3SessionToken || null,
    };
}

function mergeCompatSecrets(storedSecrets, secretInputs) {
    const stored = normalizeCompatSecrets(storedSecrets);
    return {
        webdavPassword: secretInputs.webdavPassword || stored.webdavPassword,
        webdavToken: secretInputs.webdavToken || stored.webdavToken,
        s3AccessKey: secretInputs.s3AccessKey || stored.s3AccessKey,
        s3SecretKey: secretInputs.s3SecretKey || stored.s3SecretKey,
        s3SessionToken: secretInputs.s3SessionToken || stored.s3SessionToken,
    };
}

function buildCompatConfigView(config, secrets) {
    return {
        config,
        secrets: {
            hasWebdavPassword: Boolean(secrets.webdavPassword),
            hasWebdavToken: Boolean(secrets.webdavToken),
            hasS3AccessKey: Boolean(secrets.s3AccessKey),
            hasS3SecretKey: Boolean(secrets.s3SecretKey),
            hasS3SessionToken: Boolean(secrets.s3SessionToken),
        },
    };
}

function createDeviceId() {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    const suffix = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return `mcs-${suffix}`;
}

function validateBeforeSave(config, secrets) {
    validateEndpoint(config.endpoint);
    validateRemotePrefix(config.remotePrefix);

    if (state.mode === MODE_COMPAT) {
        ensureCompatBackend(config);
    }

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

function ensureCompatBackend(config) {
    if (config.backend === BACKEND_WEBDAV) {
        return;
    }

    throw new Error('資料遷移相容模式只支援 WebDAV；S3 需要含 cloud_sync_* 原生命令的 TauriTavern build。');
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
        const queue = state.mode === MODE_COMPAT
            ? await compatListQueue()
            : await invokeCommand('cloud_sync_list_queue');
        renderQueue(queue);
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
        renderQueue([result.item]);
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
        await compatDownloadAndImport(item);
        setTimeout(() => location.reload(), RELOAD_DELAY_MS);
    });
}

async function onExportArchiveClick() {
    await runAction('資料封存已匯出', async () => {
        await runCompatExportToFile();
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
        const result = await compatUploadArchive(file);
        renderQueue([result.item]);
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
        if (state.mode === MODE_COMPAT) {
            await compatDeleteRemoteItem(fileName);
        } else {
            await invokeCommand('cloud_sync_delete_remote_item', { fileName });
        }
        const queue = state.mode === MODE_COMPAT
            ? await compatListQueue()
            : await invokeCommand('cloud_sync_list_queue');
        renderQueue(queue);
    });
}

async function compatListQueue() {
    const connection = requireCompatConnection();
    const keys = await compatListManifestKeys(connection);
    const items = [];

    for (const key of keys) {
        const response = await webDavFetch(connection, 'GET', key);
        const manifest = parseManifest(key, await response.text());
        items.push(itemFromManifest(connection.config, key, manifest));
    }

    items.sort(compareQueueItems);
    return items;
}

async function compatOldestQueueItem() {
    const queue = await compatListQueue();
    const item = queue[0];
    if (!item) {
        throw new Error('雲端同步佇列是空的');
    }
    return item;
}

async function compatUploadArchive(file) {
    if (!(file instanceof Blob) || file.size <= 0) {
        throw new Error('請選擇有效的 zip 檔案');
    }

    const connection = requireCompatConnection();
    const fileName = nextSyncFileName();
    const digest = await hashBlob(file);
    const manifest = buildManifest(connection.config, fileName, digest);
    const item = itemFromManifest(connection.config, manifestKeyForZip(connection.config.remotePrefix, fileName), manifest);
    await ensureRemoteAbsent(connection, [item.manifestKey, item.zipKey]);
    await uploadManifestThenZip(connection, item, manifest, file);
    return { item };
}

async function compatDownloadAndImport(item) {
    const connection = requireCompatConnection();
    const response = await webDavFetch(connection, 'GET', item.zipKey);
    const blob = await response.blob();
    await verifyDownloadedBlob(blob, item.manifest);
    await importArchiveBlob(blob, item.manifest.file);
    await compatDeleteRemotePair(connection, item);
}

async function compatDeleteRemoteItem(fileName) {
    validateSyncFileName(fileName);
    const connection = requireCompatConnection();
    await compatDeleteRemotePair(connection, {
        manifest: { file: fileName },
        manifestKey: manifestKeyForZip(connection.config.remotePrefix, fileName),
        zipKey: joinKey(connection.config.remotePrefix, fileName),
    });
}

async function runCompatExportToFile() {
    const jobId = await startDataArchiveExportJob();
    const finalStatus = await pollDataArchiveJob(jobId);
    if (finalStatus.state !== 'completed') {
        throw new Error(finalStatus.error || `資料匯出未完成：${finalStatus.state}`);
    }

    const result = await saveDataArchiveExport(jobId);
    setStatus(result.savedTarget ? `資料封存已匯出：${result.savedTarget}` : '資料封存已匯出');
}

function requireCompatConnection() {
    const stored = readCompatStore();
    const config = normalizeCompatConfig(stored.config);
    const secrets = normalizeCompatSecrets(stored.secrets);
    ensureCompatBackend(config);
    validateBeforeSave(config, secrets);
    return { config, secrets };
}

async function compatListManifestKeys(connection) {
    const response = await webDavFetch(connection, 'PROPFIND', connection.config.remotePrefix, {
        headers: { Depth: '1', 'Content-Type': 'application/xml' },
        body: WEBDAV_PROPFIND_BODY,
        allowNotFound: true,
    });
    if (response.status === 404) {
        return [];
    }

    return parseManifestKeys(connection.config.remotePrefix, await response.text());
}

async function ensureRemoteAbsent(connection, keys) {
    for (const key of keys) {
        const response = await webDavFetch(connection, 'HEAD', key, { allowNotFound: true });
        if (response.status !== 404) {
            throw new Error(`遠端同步項目已存在：${key}`);
        }
    }
}

async function uploadManifestThenZip(connection, item, manifest, file) {
    await webDavFetch(connection, 'PUT', item.manifestKey, {
        body: JSON.stringify(manifest, null, 2),
        headers: { 'Content-Type': JSON_CONTENT_TYPE },
    });

    try {
        await webDavFetch(connection, 'PUT', item.zipKey, {
            body: file,
            headers: { 'Content-Type': ZIP_CONTENT_TYPE },
        });
    } catch (error) {
        await cleanupFailedManifest(connection, item.manifestKey, error);
    }
}

async function cleanupFailedManifest(connection, manifestKey, uploadError) {
    try {
        await webDavFetch(connection, 'DELETE', manifestKey);
    } catch (cleanupError) {
        throw new Error(`zip 上傳失敗：${normalizeError(uploadError)}；manifest 清理也失敗：${normalizeError(cleanupError)}`);
    }

    throw uploadError;
}

async function compatDeleteRemotePair(connection, item) {
    const errors = [];
    await deleteRemoteKey(connection, item.manifestKey, errors);
    await deleteRemoteKey(connection, item.zipKey, errors);
    if (errors.length > 0) {
        throw new Error(`遠端項目刪除失敗：${errors.join('；')}`);
    }
}

async function deleteRemoteKey(connection, key, errors) {
    try {
        await webDavFetch(connection, 'DELETE', key);
    } catch (error) {
        errors.push(`${key}: ${normalizeError(error)}`);
    }
}

async function webDavFetch(connection, method, key, options = {}) {
    const headers = new Headers(webDavAuthHeaders(connection));
    for (const [name, value] of Object.entries(options.headers || {})) {
        headers.set(name, value);
    }

    let response;
    try {
        response = await fetch(webDavUrlForKey(connection.config, key), {
            method,
            headers,
            body: options.body,
            cache: 'no-store',
        });
    } catch (error) {
        throw new Error(`WebDAV ${method} 連線失敗，請確認手機能連到端點且伺服器允許 CORS：${normalizeError(error)}`);
    }

    await ensureWebDavResponse(response, method, key, Boolean(options.allowNotFound));
    return response;
}

async function ensureWebDavResponse(response, method, key, allowNotFound) {
    if (allowNotFound && response.status === 404) {
        return;
    }
    if (response.ok) {
        return;
    }

    const detail = await readFailureMessage(response);
    throw new Error(`WebDAV ${method} ${key} 回傳 HTTP ${response.status}${detail ? `：${detail}` : ''}`);
}

function webDavAuthHeaders(connection) {
    const authMode = connection.config.webdav.authMode || AUTH_BASIC;
    if (authMode === AUTH_BASIC) {
        return { Authorization: `Basic ${base64Utf8(`${connection.config.webdav.username}:${connection.secrets.webdavPassword}`)}` };
    }
    if (authMode === AUTH_BEARER) {
        return { Authorization: `Bearer ${connection.secrets.webdavToken}` };
    }

    throw new Error(`不支援的 WebDAV 驗證方式：${authMode}`);
}

function webDavUrlForKey(config, key) {
    const url = new URL(config.endpoint);
    const basePath = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
    const suffix = key.split('/').filter(Boolean).map(encodeURIComponent).join('/');
    url.pathname = `${basePath}${suffix}`.replace(/\/{2,}/g, '/');
    return url.toString();
}

function parseManifestKeys(prefix, xml) {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length > 0) {
        throw new Error('WebDAV PROPFIND 回傳的 XML 無法解析');
    }

    return collectHrefTexts(doc)
        .map(hrefFileName)
        .filter(name => name && isManifestName(name))
        .map(name => joinKey(prefix, name));
}

function collectHrefTexts(doc) {
    return Array.from(doc.getElementsByTagName('*'))
        .filter(element => element.localName === 'href')
        .map(element => String(element.textContent || '').trim())
        .filter(Boolean);
}

function hrefFileName(href) {
    const normalized = href.trim().replace(/\/+$/, '');
    const segment = normalized.split('/').filter(Boolean).pop() || '';
    return segment ? decodeURIComponent(segment) : '';
}

function parseManifest(key, text) {
    let manifest;
    try {
        manifest = JSON.parse(text);
    } catch (error) {
        throw new Error(`同步 manifest JSON 無法解析：${key}：${normalizeError(error)}`);
    }

    validateManifest(manifest);
    return manifest;
}

function validateManifest(manifest) {
    validateSyncFileName(manifest?.file);
    if (manifest.formatVersion !== CLOUD_SYNC_FORMAT_VERSION) {
        throw new Error(`不支援的同步格式版本：${manifest.formatVersion}`);
    }
    if (!isSha256(manifest.sha256)) {
        throw new Error('同步 manifest 的 SHA-256 不正確');
    }
    if (!Number.isFinite(Number(manifest.sizeBytes)) || Number(manifest.sizeBytes) < 0) {
        throw new Error('同步 manifest 的檔案大小不正確');
    }
    if (Number.isNaN(Date.parse(manifest.createdAt))) {
        throw new Error('同步 manifest 的建立時間不正確');
    }
}

function validateSyncFileName(fileName) {
    const value = String(fileName || '');
    const timestamp = value.startsWith(SYNC_FILE_PREFIX) && value.endsWith(SYNC_ZIP_EXTENSION)
        ? value.slice(SYNC_FILE_PREFIX.length, -SYNC_ZIP_EXTENSION.length)
        : '';
    if (!/^\d{10}$/.test(timestamp)) {
        throw new Error(`同步檔名不正確：${value}`);
    }
}

function itemFromManifest(config, manifestKey, manifest) {
    const expected = manifestKeyForZip(config.remotePrefix, manifest.file);
    if (manifestKey !== expected) {
        throw new Error(`manifest 路徑 ${manifestKey} 與檔案 ${manifest.file} 不一致`);
    }

    return {
        manifest,
        manifestKey,
        zipKey: joinKey(config.remotePrefix, manifest.file),
    };
}

function compareQueueItems(left, right) {
    return Date.parse(left.manifest.createdAt) - Date.parse(right.manifest.createdAt)
        || left.manifest.file.localeCompare(right.manifest.file);
}

function buildManifest(config, fileName, digest) {
    return {
        file: fileName,
        sizeBytes: digest.sizeBytes,
        sha256: digest.sha256,
        createdAt: new Date().toISOString(),
        deviceId: config.deviceId,
        formatVersion: CLOUD_SYNC_FORMAT_VERSION,
    };
}

async function verifyDownloadedBlob(blob, manifest) {
    if (blob.size !== Number(manifest.sizeBytes)) {
        throw new Error(`下載大小不一致：預期 ${manifest.sizeBytes}，實際 ${blob.size}`);
    }

    const digest = await hashBlob(blob);
    if (digest.sha256 !== manifest.sha256) {
        throw new Error('下載檔案 SHA-256 校驗失敗');
    }
}

async function hashBlob(blob) {
    if (!crypto?.subtle) {
        throw new Error('目前 WebView 不支援 SHA-256 校驗所需的 Web Crypto API');
    }

    const buffer = await blob.arrayBuffer();
    const hash = await crypto.subtle.digest('SHA-256', buffer);
    return {
        sizeBytes: blob.size,
        sha256: bytesToHex(new Uint8Array(hash)),
    };
}

function bytesToHex(bytes) {
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function isSha256(value) {
    return /^[a-fA-F0-9]{64}$/.test(String(value || ''));
}

function isManifestName(name) {
    return name.startsWith(SYNC_FILE_PREFIX) && name.endsWith(SYNC_MANIFEST_EXTENSION);
}

function manifestKeyForZip(prefix, fileName) {
    return joinKey(prefix, fileName.replace(/\.zip$/i, SYNC_MANIFEST_EXTENSION));
}

function joinKey(prefix, name) {
    return [prefix, name].map(value => String(value || '').trim().replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/');
}

function nextSyncFileName() {
    const now = new Date();
    const parts = [
        now.getMonth() + 1,
        now.getDate(),
        now.getHours(),
        now.getMinutes(),
        now.getSeconds(),
    ].map(value => String(value).padStart(2, '0'));
    return `${SYNC_FILE_PREFIX}${parts.join('')}${SYNC_ZIP_EXTENSION}`;
}

function base64Utf8(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary);
}

async function startDataArchiveExportJob() {
    const response = await fetch('/api/extensions/data-migration/export', { method: 'POST' });
    if (!response.ok) {
        throw new Error(await readFailureMessage(response));
    }

    return requireJobId(await response.json(), '資料匯出 job id 缺失');
}

async function saveDataArchiveExport(jobId) {
    if (isAndroidRuntime()) {
        return postDataArchiveSave('/api/extensions/data-migration/export/android/save', jobId);
    }
    if (isIosRuntime()) {
        return shareIosDataArchive(jobId);
    }

    return postDataArchiveSave('/api/extensions/data-migration/export/save', jobId);
}

async function postDataArchiveSave(url, jobId) {
    const payload = await postJson(url, { job_id: jobId });
    return { savedTarget: String(payload?.saved_target || '') };
}

async function shareIosDataArchive(jobId) {
    const payload = await postJson('/api/extensions/data-migration/export/ios/share', { job_id: jobId });
    if (!payload?.completed) {
        throw new Error('iOS 分享已取消，沒有匯出檔案');
    }

    return { savedTarget: '' };
}

async function importArchiveBlob(blob, fileName) {
    const formData = new FormData();
    formData.append('archive', blob, fileName);
    const response = await fetch('/api/extensions/data-migration/import', {
        method: 'POST',
        body: formData,
    });
    if (!response.ok) {
        throw new Error(await readFailureMessage(response));
    }

    const jobId = requireJobId(await response.json(), '資料匯入 job id 缺失');
    const finalStatus = await pollDataArchiveJob(jobId);
    if (finalStatus.state !== 'completed') {
        throw new Error(finalStatus.error || `資料匯入未完成：${finalStatus.state}`);
    }
}

async function pollDataArchiveJob(jobId) {
    while (true) {
        const status = await fetchDataArchiveJob(jobId);
        updateStatusFromDataArchiveJob(status);
        if (TERMINAL_JOB_STATES.has(status.state)) {
            return status;
        }
        await sleep(JOB_POLL_INTERVAL_MS);
    }
}

async function fetchDataArchiveJob(jobId) {
    const response = await fetch(`/api/extensions/data-migration/job?id=${encodeURIComponent(jobId)}`, {
        method: 'GET',
        cache: 'no-store',
    });
    if (!response.ok) {
        throw new Error(await readFailureMessage(response));
    }

    return response.json();
}

function updateStatusFromDataArchiveJob(status) {
    const parts = [status?.stage, formatProgress(status?.progress_percent), status?.message]
        .map(value => String(value || '').trim())
        .filter(Boolean);
    if (parts.length > 0) {
        setStatus(parts.join(' | '));
    }
}

function formatProgress(value) {
    const progress = Number(value);
    return Number.isFinite(progress) ? `${progress.toFixed(1)}%` : '';
}

async function postJson(url, body) {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': JSON_CONTENT_TYPE },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        throw new Error(await readFailureMessage(response));
    }

    return response.json();
}

function requireJobId(payload, message) {
    const jobId = String(payload?.job_id || '').trim();
    if (!jobId) {
        throw new Error(message);
    }
    return jobId;
}

async function readFailureMessage(response) {
    const text = await response.text().catch(error => normalizeError(error));
    return extractErrorMessage(text);
}

function extractErrorMessage(text) {
    if (!text) {
        return '';
    }

    try {
        const json = JSON.parse(text);
        return String(json?.error || json?.message || text).trim();
    } catch {
        return String(text).trim();
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
    $('#mcs_export_archive').on('click', onExportArchiveClick);
    $('#mcs_select_archive_upload').on('click', onSelectArchiveUploadClick);
    $('#mcs_upload_archive_input').on('change', onUploadArchiveInputChange);
    ensureDefaultFormState();
    refreshBackendFields();
    refreshModeUi();

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
