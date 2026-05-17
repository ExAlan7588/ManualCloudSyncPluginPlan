import { AUTH_BASIC, AUTH_BEARER } from './constants.js';

export function webDavAuthHeaders(connection) {
    validateWebDavConnection(connection);
    const authMode = connection.config.webdav.authMode || AUTH_BASIC;
    if (authMode === AUTH_BASIC) {
        const username = requiredAuthText(connection.config.webdav.username, 'WebDAV Basic credentials 格式不正確');
        const password = requiredAuthText(connection.secrets.webdavPassword, 'WebDAV Basic credentials 格式不正確');
        return { Authorization: `Basic ${base64Utf8(`${username}:${password}`)}` };
    }
    if (authMode === AUTH_BEARER) {
        const token = requiredAuthText(connection.secrets.webdavToken, 'WebDAV Bearer token 格式不正確');
        return { Authorization: `Bearer ${token}` };
    }

    throw new Error(`不支援的 WebDAV 驗證方式：${authMode}`);
}

function validateWebDavConnection(connection) {
    if (!connection || typeof connection !== 'object' || Array.isArray(connection)) {
        throw new Error('WebDAV connection 格式不正確');
    }
    if (!connection.config?.webdav || typeof connection.config.webdav !== 'object') {
        throw new Error('WebDAV connection 格式不正確');
    }
    if (!connection.secrets || typeof connection.secrets !== 'object') {
        throw new Error('WebDAV connection 格式不正確');
    }
}

function requiredAuthText(value, message) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new Error(message);
    }
    return value;
}

export function webDavTransferHeaders(connection, extraHeaders = {}) {
    return { ...webDavAuthHeaders(connection), ...extraHeaders };
}

export function webDavUrlForKey(config, key) {
    if (typeof key !== 'string' || key.trim() === '') {
        throw new Error('WebDAV key 必須是非空文字');
    }
    const url = webDavEndpointUrl(config?.endpoint);
    const basePath = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
    const suffix = key.split('/').filter(Boolean).map(encodeURIComponent).join('/');
    url.pathname = `${basePath}${suffix}`.replace(/\/{2,}/g, '/');
    return url.toString();
}

function webDavEndpointUrl(endpoint) {
    if (typeof endpoint !== 'string' || endpoint.trim() === '') {
        throw new Error('WebDAV endpoint 格式不正確');
    }
    try {
        return new URL(endpoint);
    } catch {
        throw new Error('WebDAV endpoint 格式不正確');
    }
}

function base64Utf8(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary);
}
