import { invoke } from '/tauri-bridge.js';
import { renderExtensionTemplateAsync } from '/scripts/extensions.js';
import { t } from '/scripts/i18n.js';
import { Popup } from '/scripts/popup.js';

const MODULE_NAME = resolveModuleName(import.meta.url);
const CONFIG_VERSION = 1;
const RELOAD_DELAY_MS = 800;
const BYTE_UNIT_STEP = 1024;
const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];
const DEFAULT_S3_REGION = 'us-east-1';
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
        throw new Error(`Manual Cloud Sync cannot resolve extension path from: ${moduleUrl}`);
    }

    const relativePath = decodeURIComponent(extensionPath.slice(markerIndex + marker.length));
    if (!relativePath.endsWith('/index.js')) {
        throw new Error(`Manual Cloud Sync entry script must be named index.js: ${relativePath}`);
    }

    return relativePath.slice(0, -'/index.js'.length);
}

function setStatus(message) {
    $('#mcs_status').text(String(message || ''));
}

function setBusy(busy) {
    state.busy = busy;
    $('#mcs_save_config, #mcs_refresh_queue, #mcs_upload_now, #mcs_download_now')
        .prop('disabled', busy);
}

function normalizeError(error) {
    if (error instanceof Error && error.message) {
        return error.message;
    }

    if (typeof error === 'string') {
        return error;
    }

    return String(error || t`Unknown error`);
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
        remotePrefix: String($('#mcs_remote_prefix').val() || '').trim(),
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
    $('#mcs_backend').val(config.backend || 'web_dav');
    $('#mcs_endpoint').val(config.endpoint || '');
    $('#mcs_remote_prefix').val(config.remotePrefix || '');
    $('#mcs_device_id').val(config.deviceId || '');
    $('#mcs_webdav_auth_mode').val(config.webdav?.authMode || 'basic');
    $('#mcs_webdav_username').val(config.webdav?.username || '');
    $('#mcs_s3_bucket').val(config.s3?.bucket || '');
    $('#mcs_s3_region').val(config.s3?.region || DEFAULT_S3_REGION);
    $('#mcs_s3_path_style').prop('checked', config.s3?.pathStyle ?? true);
    applySecretPlaceholders(view?.secrets || {});
    refreshBackendFields();
}

function applySecretPlaceholders(secrets) {
    $('#mcs_webdav_password').attr('placeholder', secrets.hasWebdavPassword ? t`Saved` : '');
    $('#mcs_webdav_token').attr('placeholder', secrets.hasWebdavToken ? t`Saved` : '');
    $('#mcs_s3_access_key').attr('placeholder', secrets.hasS3AccessKey ? t`Saved` : '');
    $('#mcs_s3_secret_key').attr('placeholder', secrets.hasS3SecretKey ? t`Saved` : '');
    $('#mcs_s3_session_token').attr('placeholder', secrets.hasS3SessionToken ? t`Saved` : '');
}

function clearSecretInputs() {
    $('#mcs_webdav_password, #mcs_webdav_token, #mcs_s3_access_key, #mcs_s3_secret_key, #mcs_s3_session_token')
        .val('');
}

function refreshBackendFields() {
    const backend = String($('#mcs_backend').val() || 'web_dav');
    const webdavAuthMode = String($('#mcs_webdav_auth_mode').val() || 'basic');
    $('#mcs_webdav_fields').toggle(backend === 'web_dav');
    $('#mcs_s3_fields').toggle(backend === 's3');
    $('.mcs-basic-field').toggle(webdavAuthMode === 'basic');
    $('.mcs-bearer-field').toggle(webdavAuthMode === 'bearer');
}

async function loadConfig() {
    const view = await invokeCommand('cloud_sync_get_config');
    state.configView = view;
    fillConfig(view);
    return view;
}

async function saveConfig() {
    const view = await invokeCommand('cloud_sync_save_config', {
        dto: {
            config: readConfig(),
            secrets: readSecrets(),
        },
    });
    state.configView = view;
    clearSecretInputs();
    fillConfig(view);
    return view;
}

async function onSaveClick() {
    await runAction(t`Cloud sync config saved`, async () => {
        await saveConfig();
        renderQueue([]);
    });
}

async function onRefreshQueueClick() {
    await runAction(t`Cloud sync queue refreshed`, async () => {
        await saveConfig();
        const queue = await invokeCommand('cloud_sync_list_queue');
        renderQueue(queue);
    });
}

async function onUploadClick() {
    await runAction(t`Cloud sync upload completed`, async () => {
        await saveConfig();
        const result = await invokeCommand('cloud_sync_upload_now');
        renderQueue([result.item]);
    });
}

async function onDownloadClick() {
    const confirmed = await Popup.show.confirm(
        t`Confirm cloud sync download`,
        t`Downloaded data will mirror the remote package and remove local files that are not in it. Continue?`,
    );
    if (!confirmed) {
        return;
    }

    await runAction(t`Cloud sync download completed`, async () => {
        await saveConfig();
        await invokeCommand('cloud_sync_download_now');
        setTimeout(() => location.reload(), RELOAD_DELAY_MS);
    });
}

async function runAction(successMessage, action) {
    if (state.busy) {
        toastr.warning(t`Cloud sync is already running`);
        return;
    }

    setBusy(true);
    setStatus(t`Working...`);
    try {
        await action();
        setStatus(successMessage);
        toastr.success(successMessage);
    } catch (error) {
        const message = normalizeError(error);
        setStatus(message);
        toastr.error(message, t`Cloud sync failed`);
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
    element.textContent = t`Queue is empty`;
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
        manifest.deviceId || '',
    ].filter(Boolean).join(' | ');
}

function deleteButton(fileName) {
    const button = document.createElement('button');
    button.className = 'menu_button menu_button_icon margin0';
    button.type = 'button';
    button.title = t`Delete remote item`;
    button.innerHTML = '<i class="fa-solid fa-trash"></i>';
    button.addEventListener('click', () => onDeleteRemoteItem(fileName));
    return button;
}

async function onDeleteRemoteItem(fileName) {
    if (!fileName) {
        return;
    }

    await runAction(t`Remote sync item deleted`, async () => {
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

function findExtensionSettingsTarget() {
    for (const targetId of EXTENSION_SETTINGS_TARGETS) {
        const target = document.getElementById(targetId);
        if (target) {
            return target;
        }
    }

    throw new Error('Manual Cloud Sync mount target not found: #extensions_settings2 or #extensions_settings');
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
        throw new Error('Manual Cloud Sync settings are already mounted');
    }

    const html = await renderExtensionTemplateAsync(MODULE_NAME, 'settings');
    container.insertAdjacentHTML('beforeend', html);
    $('#mcs_backend, #mcs_webdav_auth_mode').on('change', refreshBackendFields);
    $('#mcs_save_config').on('click', onSaveClick);
    $('#mcs_refresh_queue').on('click', onRefreshQueueClick);
    $('#mcs_upload_now').on('click', onUploadClick);
    $('#mcs_download_now').on('click', onDownloadClick);

    try {
        await loadConfig();
        renderQueue([]);
    } catch (error) {
        setStatus(normalizeError(error));
    }
});
