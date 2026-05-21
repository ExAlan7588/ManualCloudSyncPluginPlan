import {
    AUTH_BASIC,
    AUTH_BEARER,
    BACKEND_S3,
    BACKEND_WEBDAV,
    COMPAT_STORAGE_KEY,
    CONFIG_VERSION,
    DEFAULT_REMOTE_PREFIX,
    DEFAULT_S3_REGION,
    MODE_COMPAT,
} from './constants.js';
import { normalizeError } from './errors.js';

const CONFIG_FIELD_BINDINGS = Object.freeze([
    ['#mcs_backend', config => config.backend || BACKEND_WEBDAV],
    ['#mcs_endpoint', config => config.endpoint || ''],
    ['#mcs_remote_prefix', config => config.remotePrefix || DEFAULT_REMOTE_PREFIX],
    ['#mcs_device_id', config => config.deviceId || ''],
    ['#mcs_webdav_auth_mode', config => config.webdav?.authMode || AUTH_BASIC],
    ['#mcs_webdav_username', config => config.webdav?.username || ''],
    ['#mcs_s3_bucket', config => config.s3?.bucket || ''],
    ['#mcs_s3_region', config => config.s3?.region || DEFAULT_S3_REGION],
]);

export function readConfig() {
    return {
        version: CONFIG_VERSION,
        backend: $('#mcs_backend').val(),
        endpoint: String($('#mcs_endpoint').val() || '').trim(),
        remotePrefix: String($('#mcs_remote_prefix').val() || '').trim() || DEFAULT_REMOTE_PREFIX,
        deviceId: String($('#mcs_device_id').val() || '').trim(),
        webdav: readWebDavConfig(),
        s3: readS3Config(),
    };
}

export function readSecrets() {
    return {
        webdavPassword: optionalSecret('#mcs_webdav_password'),
        webdavToken: optionalSecret('#mcs_webdav_token'),
        s3AccessKey: optionalSecret('#mcs_s3_access_key'),
        s3SecretKey: optionalSecret('#mcs_s3_secret_key'),
        s3SessionToken: optionalSecret('#mcs_s3_session_token'),
    };
}

export function fillConfig(view) {
    const config = view?.config || {};
    for (const [selector, valueFor] of CONFIG_FIELD_BINDINGS) {
        $(selector).val(valueFor(config));
    }
    $('#mcs_s3_path_style').prop('checked', config.s3?.pathStyle ?? true);
    applySecretPlaceholders(view?.secrets || {});
    refreshBackendFields();
}

export function applySecretPlaceholders(secrets) {
    $('#mcs_webdav_password').attr('placeholder', secrets.hasWebdavPassword ? '已儲存' : '');
    $('#mcs_webdav_token').attr('placeholder', secrets.hasWebdavToken ? '已儲存' : '');
    $('#mcs_s3_access_key').attr('placeholder', secrets.hasS3AccessKey ? '已儲存' : '');
    $('#mcs_s3_secret_key').attr('placeholder', secrets.hasS3SecretKey ? '已儲存' : '');
    $('#mcs_s3_session_token').attr('placeholder', secrets.hasS3SessionToken ? '已儲存' : '');
}

export function clearSecretInputs() {
    $('#mcs_webdav_password, #mcs_webdav_token, #mcs_s3_access_key, #mcs_s3_secret_key, #mcs_s3_session_token')
        .val('');
}

export function refreshBackendFields() {
    const backend = String($('#mcs_backend').val() || BACKEND_WEBDAV);
    const webdavAuthMode = String($('#mcs_webdav_auth_mode').val() || AUTH_BASIC);
    const isWebDav = backend === BACKEND_WEBDAV;
    const isBasic = webdavAuthMode === AUTH_BASIC;
    $('#mcs_webdav_basic_credentials').prop('hidden', !(isWebDav && isBasic));
    $('#mcs_webdav_advanced_fields').prop('hidden', !isWebDav);
    $('#mcs_s3_fields').prop('hidden', backend !== BACKEND_S3);
    $('.mcs-bearer-field').prop('hidden', !(isWebDav && webdavAuthMode === AUTH_BEARER));
}

export function loadCompatConfigView() {
    const stored = readCompatStore();
    const config = normalizeCompatConfig(stored.config);
    const secrets = normalizeCompatSecrets(stored.secrets);
    return buildCompatConfigView(config, secrets);
}

export function saveCompatConfig(config, secretInputs) {
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
    return buildCompatConfigView(savedConfig, mergedSecrets);
}

export function readCompatStore() {
    const raw = localStorage.getItem(COMPAT_STORAGE_KEY);
    if (!raw) {
        return {};
    }

    try {
        return compatStore(JSON.parse(raw));
    } catch (error) {
        throw new Error(`相容模式設定 JSON 解析失敗：${normalizeError(error)}`);
    }
}

function compatStore(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('相容模式設定必須是物件');
    }
    return value;
}

export function normalizeCompatConfig(config) {
    return {
        version: CONFIG_VERSION,
        backend: compatString(config?.backend, 'backend', BACKEND_WEBDAV),
        endpoint: compatString(config?.endpoint, 'endpoint', ''),
        remotePrefix: compatString(config?.remotePrefix, 'remotePrefix', DEFAULT_REMOTE_PREFIX),
        deviceId: compatString(config?.deviceId, 'deviceId', ''),
        webdav: {
            authMode: compatString(config?.webdav?.authMode, 'webdav.authMode', AUTH_BASIC),
            username: compatString(config?.webdav?.username, 'webdav.username', ''),
        },
        s3: {
            bucket: compatString(config?.s3?.bucket, 's3.bucket', ''),
            region: compatString(config?.s3?.region, 's3.region', DEFAULT_S3_REGION),
            pathStyle: compatBoolean(config?.s3?.pathStyle, 's3.pathStyle', true),
        },
    };
}

export function normalizeCompatSecrets(secrets) {
    return {
        webdavPassword: compatSecret(secrets?.webdavPassword, 'webdavPassword'),
        webdavToken: compatSecret(secrets?.webdavToken, 'webdavToken'),
        s3AccessKey: compatSecret(secrets?.s3AccessKey, 's3AccessKey'),
        s3SecretKey: compatSecret(secrets?.s3SecretKey, 's3SecretKey'),
        s3SessionToken: compatSecret(secrets?.s3SessionToken, 's3SessionToken'),
    };
}

export function buildCompatConfigView(config, secrets) {
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

export function validateBeforeSave(config, secrets, context) {
    validateEndpoint(config.endpoint);
    validateRemotePrefix(config.remotePrefix);

    if (context.mode === MODE_COMPAT) {
        ensureCompatBackend(config);
    }

    if (config.backend === BACKEND_WEBDAV) {
        validateWebDavConfig(config, secrets, context.configView);
        return;
    }

    if (config.backend === BACKEND_S3) {
        validateS3Config(config, secrets, context.configView);
        return;
    }

    throw new Error(`不支援的同步後端：${config.backend}`);
}

export function ensureCompatBackend(config) {
    if (config.backend === BACKEND_WEBDAV) {
        return;
    }

    throw new Error('資料遷移相容模式只支援 WebDAV；S3 需要含 cloud_sync_* 原生命令的 TauriTavern build。');
}

function readWebDavConfig() {
    return {
        authMode: $('#mcs_webdav_auth_mode').val(),
        username: String($('#mcs_webdav_username').val() || '').trim(),
    };
}

function readS3Config() {
    return {
        bucket: String($('#mcs_s3_bucket').val() || '').trim(),
        region: String($('#mcs_s3_region').val() || '').trim() || DEFAULT_S3_REGION,
        pathStyle: Boolean($('#mcs_s3_path_style').prop('checked')),
    };
}

function optionalSecret(selector) {
    const value = String($(selector).val() || '').trim();
    return value ? value : null;
}

function compatString(value, label, fallback) {
    if (value === undefined || value === null || value === '') {
        return fallback;
    }
    if (typeof value !== 'string') {
        throw new Error(`Invalid compat config ${label}`);
    }
    return value.trim() || fallback;
}

function compatSecret(value, label) {
    if (value === undefined || value === null) {
        return null;
    }
    if (typeof value !== 'string') {
        throw new Error(`Invalid compat secret ${label}`);
    }
    return value.trim() || null;
}

function compatBoolean(value, label, fallback) {
    if (value === undefined || value === null) {
        return fallback;
    }
    if (typeof value !== 'boolean') {
        throw new Error(`Invalid compat config ${label}`);
    }
    return value;
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

function createDeviceId() {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    const suffix = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return `mcs-${suffix}`;
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

function validateWebDavConfig(config, secrets, configView) {
    const authMode = config.webdav.authMode || AUTH_BASIC;
    if (authMode === AUTH_BASIC) {
        requireText(config.webdav.username, '請填寫 WebDAV 使用者名稱');
        requireSecret({
            configView,
            message: '請填寫 WebDAV 密碼',
            savedKey: 'hasWebdavPassword',
            value: secrets.webdavPassword,
        });
        return;
    }

    if (authMode === AUTH_BEARER) {
        requireSecret({
            configView,
            message: '請填寫 WebDAV Bearer Token',
            savedKey: 'hasWebdavToken',
            value: secrets.webdavToken,
        });
        return;
    }

    throw new Error(`不支援的 WebDAV 驗證方式：${authMode}`);
}

function validateS3Config(config, secrets, configView) {
    requireText(config.s3.bucket, '請填寫 S3 Bucket');
    requireText(config.s3.region, '請填寫 S3 Region');
    requireSecret({
        configView,
        message: '請填寫 S3 Access Key',
        savedKey: 'hasS3AccessKey',
        value: secrets.s3AccessKey,
    });
    requireSecret({
        configView,
        message: '請填寫 S3 Secret Key',
        savedKey: 'hasS3SecretKey',
        value: secrets.s3SecretKey,
    });
}

function requireText(value, message) {
    if (!String(value || '').trim()) {
        throw new Error(message);
    }
}

function requireSecret(options) {
    if (String(options.value || '').trim() || savedSecretFlag(options.configView, options.savedKey)) {
        return;
    }

    throw new Error(options.message);
}

function savedSecretFlag(configView, savedKey) {
    const value = configView?.secrets?.[savedKey];
    if (value === undefined || value === null) {
        return false;
    }
    if (typeof value !== 'boolean') {
        throw new Error(`Invalid saved secret flag ${savedKey}`);
    }
    return value;
}
