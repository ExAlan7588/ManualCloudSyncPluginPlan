import { randomBytes, timingSafeEqual } from 'node:crypto';
import { serverError, unauthorized } from './http-error.js';

const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PAIRING_TOKEN_TTL_MS = 10 * 60 * 1000;

export function consumePairingToken(record, actual) {
    const token = String(actual || '');
    const dynamic = activePairingToken(record, token);
    if (dynamic) {
        record.pairingTokens = (record.pairingTokens || [])
            .filter(item => item.token !== dynamic.token);
        return;
    }
    if (expiredPairingToken(record, token)) {
        throw unauthorized('Expired pairing token');
    }
    assertPairingToken(token, process.env.TT_SYNC_PAIRING_TOKEN);
}

export function addPairingToken(record) {
    const now = Date.now();
    const token = {
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + PAIRING_TOKEN_TTL_MS).toISOString(),
        token: randomToken(),
    };
    record.pairingTokens = [token, ...prunePairingTokens(record.pairingTokens || [])];
    return token;
}

export function addSession(record, deviceId = '') {
    const now = Date.now();
    const session = {
        accessToken: randomToken(),
        deviceId,
        expiresAt: new Date(now + ACCESS_TOKEN_TTL_MS).toISOString(),
        refreshExpiresAt: new Date(now + REFRESH_TOKEN_TTL_MS).toISOString(),
        refreshToken: randomToken(),
    };
    record.sessions = [session, ...pruneExpiredSessions(record.sessions || [])];
    return session;
}

export function activeAccessToken(record, token) {
    return Boolean(activeAccessSession(record, token));
}

export function activeAccessSession(record, token) {
    const now = Date.now();
    return (record.sessions || []).find(session => {
        return Date.parse(session.expiresAt) > now && constantTimeEqual(token, session.accessToken);
    });
}

export function activeRefreshSession(record, refreshToken) {
    const now = Date.now();
    return (record.sessions || []).find(session => {
        return Date.parse(session.refreshExpiresAt) > now && constantTimeEqual(String(refreshToken || ''), session.refreshToken);
    });
}

export function pruneExpiredSessions(sessions) {
    const now = Date.now();
    return sessions.filter(session => Date.parse(session.expiresAt) > now || Date.parse(session.refreshExpiresAt) > now);
}

export function prunePairingTokens(tokens) {
    const now = Date.now();
    return tokens.filter(token => Date.parse(token.expiresAt) > now);
}

export function sessionResponse(record, session) {
    return {
        accessToken: session.accessToken,
        expiresAt: session.expiresAt,
        namespace: record.namespace,
        refreshExpiresAt: session.refreshExpiresAt,
        refreshToken: session.refreshToken,
        serverId: record.serverId,
    };
}

export function accountPairingResponse(options) {
    return {
        expiresAt: options.token.expiresAt,
        namespace: options.namespace,
        pairingUri: tauriPairingUri(options),
    };
}

export function assertAccountLogin(options) {
    if (!process.env.TT_SYNC_ACCOUNT_USERNAME || !process.env.TT_SYNC_ACCOUNT_PASSWORD) {
        throw serverError('TT_SYNC_ACCOUNT_USERNAME and TT_SYNC_ACCOUNT_PASSWORD are required for account login');
    }
    if (!constantTimeEqual(String(options.username || ''), process.env.TT_SYNC_ACCOUNT_USERNAME)) {
        throw unauthorized('Invalid account credentials');
    }
    if (!constantTimeEqual(String(options.password || ''), process.env.TT_SYNC_ACCOUNT_PASSWORD)) {
        throw unauthorized('Invalid account credentials');
    }
}

export function randomToken(size = 32) {
    return randomBytes(size).toString('base64url');
}

export function constantTimeEqual(left, right) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function activePairingToken(record, token) {
    const now = Date.now();
    return (record.pairingTokens || []).find(item => {
        return Date.parse(item.expiresAt) > now && constantTimeEqual(token, item.token);
    });
}

function expiredPairingToken(record, token) {
    return (record.pairingTokens || []).some(item => constantTimeEqual(token, item.token));
}

function assertPairingToken(actual, expected) {
    if (!expected) {
        throw serverError('TT_SYNC_PAIRING_TOKEN is required for pairing');
    }
    if (!constantTimeEqual(String(actual || ''), expected)) {
        throw unauthorized('Invalid pairing token');
    }
}

function tauriPairingUri(options) {
    const uri = new URL('tauritavern://tt-sync/pair');
    uri.searchParams.set('v', '2');
    uri.searchParams.set('url', options.endpoint);
    uri.searchParams.set('token', options.token.token);
    uri.searchParams.set('exp', String(Date.parse(options.token.expiresAt)));
    uri.searchParams.set('spki', options.spki);
    return uri.toString();
}
