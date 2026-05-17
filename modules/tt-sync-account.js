import { normalizeError, readFailureMessage } from './errors.js';

const ACCOUNT_ROUTES = Object.freeze({
    devices: '/v2/devices',
    history: '/v2/history',
    login: '/v2/account/login',
    pairingUri: '/v2/account/pairing-uri',
    refresh: '/v2/account/token/refresh',
});
const DEFAULT_NAMESPACE = 'default';
const EMPTY_TEXT = '尚無資料';
const UNAVAILABLE_TEXT = '未回傳';
const DECIMAL_INTEGER_PATTERN = /^\d+$/;

export function bindTtSyncAccountPanel(deps) {
    const state = { accessToken: '', refreshToken: '', namespace: DEFAULT_NAMESPACE };
    bindAccountEvents(deps, state);
    renderAccountState(state);
}

function bindAccountEvents(deps, state) {
    $('#mcs_tts_account_login').on('click', () => loginAccount(deps, state));
    $('#mcs_tts_account_refresh_token').on('click', () => refreshAccountToken(deps, state));
    $('#mcs_tts_account_pairing_uri').on('click', () => createPairingUri(deps, state));
    $('#mcs_tts_account_refresh_data').on('click', () => refreshAccountData(deps, state));
}

async function loginAccount(deps, state) {
    await deps.runAction('TT-Sync 帳號已登入', async () => {
        const response = await accountRequest(deps, {
            body: loginBody(),
            route: ACCOUNT_ROUTES.login,
        });
        updateSession(state, response);
        renderAccountState(state, '已登入');
        await loadAccountData(deps, state);
    });
}

async function refreshAccountToken(deps, state) {
    await deps.runAction('TT-Sync 帳號 Token 已刷新', async () => {
        requireRefreshToken(state);
        const response = await accountRequest(deps, {
            body: { namespace: state.namespace, refreshToken: state.refreshToken },
            route: ACCOUNT_ROUTES.refresh,
        });
        updateSession(state, response);
        renderAccountState(state, 'Token 已刷新');
    });
}

async function createPairingUri(deps, state) {
    await deps.runAction('TT-Sync 帳號配對 URI 已產生', async () => {
        requireAccessToken(state);
        const response = await accountRequest(deps, {
            body: pairingUriBody(state),
            route: ACCOUNT_ROUTES.pairingUri,
            token: state.accessToken,
        });
        renderPairingUri(response);
        renderAccountState(state, expiryText(response));
    });
}

async function refreshAccountData(deps, state) {
    await deps.runAction('TT-Sync 帳號資料已更新', async () => {
        requireAccessToken(state);
        await loadAccountData(deps, state);
        renderAccountState(state, '帳號資料已更新');
    });
}

async function loadAccountData(deps, state) {
    const query = `?namespace=${encodeURIComponent(state.namespace)}`;
    const [devices, history] = await Promise.all([
        accountRequest(deps, { route: `${ACCOUNT_ROUTES.devices}${query}`, token: state.accessToken }),
        accountRequest(deps, { route: `${ACCOUNT_ROUTES.history}${query}`, token: state.accessToken }),
    ]);
    renderDevices(accountList(devices.devices, '帳號裝置列表格式不正確'));
    renderHistory(accountList(history.history, '帳號同步歷史格式不正確'));
}

async function accountRequest(deps, options) {
    const response = await deps.fetch(`${accountEndpoint()}${options.route}`, requestInit(options));
    if (!response.ok) {
        throw new Error(await readFailureMessage(response) || `HTTP ${response.status}`);
    }
    return readAccountJson(response, options.route);
}

async function readAccountJson(response, route) {
    try {
        return await response.json();
    } catch (error) {
        throw new Error(`TT-Sync 帳號 ${route} 回應 JSON 無法解析：${normalizeError(error)}`);
    }
}

function requestInit(options) {
    const init = { headers: { Accept: 'application/json' }, method: options.body ? 'POST' : 'GET' };
    if (options.token) {
        init.headers.Authorization = `Bearer ${options.token}`;
    }
    if (options.body) {
        init.body = JSON.stringify(options.body);
        init.headers['Content-Type'] = 'application/json';
    }
    return init;
}

function loginBody() {
    return {
        namespace: accountNamespace(),
        password: requiredValue('#mcs_tts_account_password', '請填寫帳號密碼'),
        username: requiredValue('#mcs_tts_account_username', '請填寫帳號名稱'),
    };
}

function pairingUriBody(state) {
    return {
        endpoint: accountEndpoint(),
        namespace: state.namespace,
        spki: requiredValue('#mcs_tts_account_spki', '請填寫服務端 SPKI pin'),
    };
}

function updateSession(state, response) {
    const accessToken = sessionText(response?.accessToken);
    const refreshToken = sessionText(response?.refreshToken);
    if (!accessToken || !refreshToken) {
        throw new Error('帳號登入回應缺少 token');
    }
    const namespace = sessionNamespace(response);
    state.accessToken = accessToken;
    state.refreshToken = refreshToken;
    state.namespace = namespace;
}

function renderAccountState(state, message = '') {
    const suffix = state.accessToken ? `namespace=${state.namespace}` : '尚未登入';
    $('#mcs_tts_account_status').text([message, suffix].filter(Boolean).join(' | '));
}

function renderPairingUri(response) {
    const pairingUri = responseText(response?.pairingUri);
    if (!pairingUri) {
        throw new Error('帳號配對回應缺少 pairingUri');
    }
    $('#mcs_tts_account_generated_uri').val(pairingUri);
    $('#mcs_tts_pair_uri').val(pairingUri);
}

function renderDevices(devices) {
    renderList('#mcs_tts_account_devices', devices, deviceText);
}

function renderHistory(history) {
    renderList('#mcs_tts_account_history', history, historyText);
}

function accountList(value, message) {
    if (value === undefined || value === null) {
        return [];
    }
    if (!Array.isArray(value)) {
        throw new Error(message);
    }
    if (!value.every(isAccountItem)) {
        throw new Error(message);
    }
    return value;
}

function isAccountItem(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function renderList(selector, items, formatter) {
    const container = document.querySelector(selector);
    container.replaceChildren();
    if (!items.length) {
        container.appendChild(emptyInfo());
        return;
    }
    for (const item of items) {
        container.appendChild(listItem(formatter(item)));
    }
}

function listItem(text) {
    const item = document.createElement('div');
    item.className = 'mcs-account-item';
    item.textContent = text;
    return item;
}

function emptyInfo() {
    const item = document.createElement('small');
    item.className = 'extensions_info mcs-empty';
    item.textContent = EMPTY_TEXT;
    return item;
}

function deviceText(device) {
    return [
        itemText(device.deviceName || device.device_name || device.deviceId),
        itemText(device.deviceId),
        timePart('seen', device.lastSeenAt),
        timePart('sync', device.lastSyncAt),
    ].filter(Boolean).join(' | ');
}

function historyText(item) {
    return [
        itemText(item.kind) || 'sync',
        itemText(item.planId),
        `up=${historyCountText(item.uploads)}`,
        `down=${historyCountText(item.downloads)}`,
        timePart('at', item.committedAt),
    ].filter(Boolean).join(' | ');
}

function historyCountText(value) {
    if (value === undefined || value === null || value === '') {
        return '0';
    }
    const count = nonNegativeIntegerValue(value);
    return count === null ? UNAVAILABLE_TEXT : String(count);
}

function nonNegativeIntegerValue(value) {
    if (typeof value === 'number') {
        return Number.isSafeInteger(value) && value >= 0 ? value : null;
    }
    if (typeof value !== 'string' || !DECIMAL_INTEGER_PATTERN.test(value)) {
        return null;
    }
    const number = Number(value);
    return Number.isSafeInteger(number) ? number : null;
}

function accountEndpoint() {
    return requiredUrl('#mcs_tts_account_endpoint', '請填寫帳號服務端 URL');
}

function accountNamespace() {
    return String($('#mcs_tts_account_namespace').val() || DEFAULT_NAMESPACE).trim() || DEFAULT_NAMESPACE;
}

function requiredUrl(selector, message) {
    const url = parseRequiredUrl(requiredValue(selector, message));
    return url.toString().replace(/\/$/, '');
}

function parseRequiredUrl(value) {
    try {
        const url = new URL(value);
        if (!isAccountEndpointUrl(url)) {
            throw new Error();
        }
        return url;
    } catch {
        throw new Error('帳號服務端 URL 格式不正確');
    }
}

function isAccountEndpointUrl(url) {
    return (url.protocol === 'http:' || url.protocol === 'https:')
        && !url.username
        && !url.password
        && !url.hash;
}

function requiredValue(selector, message) {
    const value = String($(selector).val() || '').trim();
    if (!value) {
        throw new Error(message);
    }
    return value;
}

function requireAccessToken(state) {
    if (!state.accessToken) {
        throw new Error('請先登入 TT-Sync 帳號');
    }
}

function requireRefreshToken(state) {
    if (!state.refreshToken) {
        throw new Error('請先登入 TT-Sync 帳號');
    }
}

function sessionText(value) {
    return typeof value === 'string' ? value : '';
}

function responseText(value) {
    return typeof value === 'string' ? value : '';
}

function itemText(value) {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? String(value) : '';
    }
    return typeof value === 'string' ? value : '';
}

function sessionNamespace(response) {
    if (!hasSessionField(response, 'namespace') || response.namespace === null || response.namespace === '') {
        return accountNamespace();
    }
    if (typeof response.namespace !== 'string') {
        throw new Error('帳號登入回應 namespace 格式不正確');
    }
    return response.namespace;
}

function hasSessionField(response, name) {
    return response !== null && typeof response === 'object' && Object.hasOwn(response, name);
}

function expiryText(response) {
    const expiresAt = responseText(response?.expiresAt);
    return expiresAt ? `配對 URI 到期：${expiresAt}` : '配對 URI 已產生';
}

function timePart(label, value) {
    const text = itemText(value);
    return text ? `${label}=${text}` : '';
}
