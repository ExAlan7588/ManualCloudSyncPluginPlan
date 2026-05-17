import {
    AUTH_BASIC,
    AUTH_BEARER,
    CLOUD_SYNC_FORMAT_VERSION,
    JSON_CONTENT_TYPE,
    MODE_COMPAT,
    SYNC_FILE_PREFIX,
    SYNC_MANIFEST_EXTENSION,
    SYNC_ZIP_EXTENSION,
    WEBDAV_PROPFIND_BODY,
    ZIP_CONTENT_TYPE,
} from './constants.js';
import {
    buildCompatConfigView,
    ensureCompatBackend,
    normalizeCompatConfig,
    normalizeCompatSecrets,
    readCompatStore,
    validateBeforeSave,
} from './config.js';
import { importArchiveBlob, runCompatExportToFile as exportArchiveToFile } from './data-migration.js';
import { normalizeError, readFailureMessage } from './errors.js';
import { webDavHeaders } from './webdav-headers.js';
import { webDavXhrTransfer } from './webdav-transfer.js';

const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export { exportArchiveToFile as runCompatExportToFile };

export async function compatListQueue() {
    const connection = requireCompatConnection();
    const keys = await compatListManifestKeys(connection);
    const items = [];

    for (const key of keys) {
        const response = await webDavFetch({ connection, key, method: 'GET' });
        const manifest = parseManifest(key, await response.text());
        items.push(itemFromManifest(connection.config, key, manifest));
    }

    items.sort(compareQueueItems);
    return items;
}

export async function compatOldestQueueItem() {
    const queue = await compatListQueue();
    const item = queue[0];
    if (!item) {
        throw new Error('雲端同步佇列是空的');
    }
    return item;
}

export async function compatUploadArchive(file, context) {
    if (!(file instanceof Blob) || file.size <= 0) {
        throw new Error('請選擇有效的 zip 檔案');
    }

    const connection = requireCompatConnection();
    const fileName = nextSyncFileName();
    context.setStatus('計算同步包 SHA-256...');
    const digest = await hashBlob(file);
    const manifest = buildManifest(connection.config, fileName, digest);
    const manifestKey = manifestKeyForZip(connection.config.remotePrefix, fileName);
    const item = itemFromManifest(connection.config, manifestKey, manifest);
    await ensureRemoteAbsent(connection, [item.manifestKey, item.zipKey]);
    await uploadManifestThenZip({ connection, context, file, item, manifest });
    return { item };
}

export async function compatDownloadAndImport(item, context) {
    const connection = requireCompatConnection();
    const expectedBytes = Number(item.manifest.sizeBytes || 0);
    const blob = await downloadWebDavBlobWithProgress({ connection, context, key: item.zipKey, totalBytes: expectedBytes });
    context.setStatus('校驗下載檔案...');
    await verifyDownloadedBlob(blob, item.manifest);
    context.setStatus('匯入資料封存...');
    await importArchiveBlob(blob, item.manifest.file, context);
    await compatDeleteRemotePair(connection, item);
}

export async function compatDeleteRemoteItem(fileName) {
    validateSyncFileName(fileName);
    const connection = requireCompatConnection();
    await compatDeleteRemotePair(connection, {
        manifest: { file: fileName },
        manifestKey: manifestKeyForZip(connection.config.remotePrefix, fileName),
        zipKey: joinKey(connection.config.remotePrefix, fileName),
    });
}

function requireCompatConnection() {
    const stored = readCompatStore();
    const config = normalizeCompatConfig(stored.config);
    const secrets = normalizeCompatSecrets(stored.secrets);
    ensureCompatBackend(config);
    validateBeforeSave(config, secrets, {
        configView: buildCompatConfigView(config, secrets),
        mode: MODE_COMPAT,
    });
    return { config, secrets };
}

async function compatListManifestKeys(connection) {
    const response = await webDavFetch({
        connection,
        key: connection.config.remotePrefix,
        method: 'PROPFIND',
        options: {
            headers: { Depth: '1', 'Content-Type': 'application/xml' },
            body: WEBDAV_PROPFIND_BODY,
            allowNotFound: true,
        },
    });
    if (response.status === 404) {
        return [];
    }

    return parseManifestKeys(connection.config.remotePrefix, await response.text());
}

async function ensureRemoteAbsent(connection, keys) {
    for (const key of keys) {
        const response = await webDavFetch({
            connection,
            key,
            method: 'HEAD',
            options: { allowNotFound: true },
        });
        if (response.status !== 404) {
            throw new Error(`遠端同步項目已存在：${key}`);
        }
    }
}

async function uploadManifestThenZip(options) {
    options.context.setStatus('上傳同步 manifest...');
    await webDavFetch({
        connection: options.connection,
        key: options.item.manifestKey,
        method: 'PUT',
        options: {
            body: JSON.stringify(options.manifest, null, 2),
            headers: { 'Content-Type': JSON_CONTENT_TYPE },
        },
    });

    try {
        await uploadWebDavBlobWithProgress(options);
    } catch (error) {
        await cleanupFailedManifest(options.connection, options.item.manifestKey, error);
    }
}

async function cleanupFailedManifest(connection, manifestKey, uploadError) {
    try {
        await webDavFetch({ connection, key: manifestKey, method: 'DELETE' });
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
        await webDavFetch({ connection, key, method: 'DELETE' });
    } catch (error) {
        errors.push(`${key}: ${normalizeError(error)}`);
    }
}

async function webDavFetch(params) {
    const options = params.options || {};
    const headers = webDavHeaders(webDavAuthHeaders(params.connection), options.headers);

    const response = await fetchWebDav({
        body: options.body,
        connection: params.connection,
        headers,
        key: params.key,
        method: params.method,
    });
    await ensureWebDavResponse({
        allowNotFound: Boolean(options.allowNotFound),
        key: params.key,
        method: params.method,
        response,
    });
    return response;
}

async function fetchWebDav(options) {
    try {
        return await fetch(webDavUrlForKey(options.connection.config, options.key), {
            method: options.method,
            headers: options.headers,
            body: options.body,
            cache: 'no-store',
        });
    } catch (error) {
        throw new Error(`WebDAV ${options.method} 連線失敗，請確認手機能連到端點且伺服器允許 CORS：${normalizeError(error)}`);
    }
}

async function uploadWebDavBlobWithProgress(options) {
    await webDavXhrTransfer({
        context: options.context,
        key: options.item.zipKey,
        method: 'PUT',
        body: options.file,
        headers: webDavTransferHeaders(options.connection, { 'Content-Type': ZIP_CONTENT_TYPE }),
        progressTarget: 'upload',
        responseType: 'text',
        totalBytes: options.file.size,
        label: '上傳同步包',
        url: webDavUrlForKey(options.connection.config, options.item.zipKey),
    });
}

async function downloadWebDavBlobWithProgress(options) {
    return webDavXhrTransfer({
        context: options.context,
        key: options.key,
        method: 'GET',
        headers: webDavTransferHeaders(options.connection),
        progressTarget: 'download',
        responseType: 'blob',
        totalBytes: options.totalBytes,
        label: '下載同步包',
        url: webDavUrlForKey(options.connection.config, options.key),
    });
}

async function ensureWebDavResponse(options) {
    if (options.allowNotFound && options.response.status === 404) {
        return;
    }
    if (options.response.ok) {
        return;
    }

    const detail = await readFailureMessage(options.response);
    throw new Error(`WebDAV ${options.method} ${options.key} 回傳 HTTP ${options.response.status}${detail ? `：${detail}` : ''}`);
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

function webDavTransferHeaders(connection, extraHeaders = {}) {
    return { ...webDavAuthHeaders(connection), ...extraHeaders };
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

export function hrefFileName(href) {
    const normalized = href.trim().replace(/\/+$/, '');
    const segment = normalized.split('/').filter(Boolean).pop() || '';
    if (!segment) {
        return '';
    }
    try {
        return decodeURIComponent(segment);
    } catch (error) {
        throw new Error(`WebDAV PROPFIND href 編碼不正確：${href}：${normalizeError(error)}`);
    }
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
    if (!isNonNegativeInteger(manifest.sizeBytes)) {
        throw new Error('同步 manifest 的檔案大小不正確');
    }
    if (!isIsoTimestamp(manifest.createdAt)) {
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
    return /^[a-f0-9]{64}$/.test(String(value || ''));
}

function isNonNegativeInteger(value) {
    if (typeof value !== 'number' && !(typeof value === 'string' && /^\d+$/.test(value.trim()))) {
        return false;
    }
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 0;
}

function isIsoTimestamp(value) {
    const text = String(value || '').trim();
    return ISO_TIMESTAMP_PATTERN.test(text) && !Number.isNaN(Date.parse(text));
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
