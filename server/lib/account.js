import { randomBytes, timingSafeEqual } from 'node:crypto';
import { safeName } from './encoding.js';
import { serverError, unauthorized } from './http-error.js';

const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PAIRING_TOKEN_TTL_MS = 10 * 60 * 1000;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function consumePairingToken(record, actual) {
    const token = String(actual || '');
    const dynamic = activePairingToken(record, token);
    if (dynamic) {
        record.pairingTokens = optionalRecordArray(record.pairingTokens, 'namespace pairingTokens')
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
    record.pairingTokens = [token, ...prunePairingTokens(optionalRecordArray(record.pairingTokens, 'namespace pairingTokens'))];
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
    record.sessions = [session, ...pruneExpiredSessions(optionalRecordArray(record.sessions, 'namespace sessions'))];
    return session;
}

export function activeAccessToken(record, token) {
    return Boolean(activeAccessSession(record, token));
}

export function activeAccessSession(record, token) {
    const now = Date.now();
    return optionalRecordArray(record.sessions, 'namespace sessions').find(session => {
        return hasFutureIsoTimestamp(session.expiresAt, now) && constantTimeEqual(token, session.accessToken);
    });
}

export function activeRefreshSession(record, refreshToken) {
    const now = Date.now();
    return optionalRecordArray(record.sessions, 'namespace sessions').find(session => {
        return hasFutureIsoTimestamp(session.refreshExpiresAt, now)
            && constantTimeEqual(String(refreshToken || ''), session.refreshToken);
    });
}

export function pruneExpiredSessions(sessions) {
    const now = Date.now();
    return recordArray(sessions, 'namespace sessions').filter(session => {
        return hasFutureIsoTimestamp(session.expiresAt, now)
            || hasFutureIsoTimestamp(session.refreshExpiresAt, now);
    });
}

export function prunePairingTokens(tokens) {
    const now = Date.now();
    return recordArray(tokens, 'namespace pairingTokens').filter(token => hasFutureIsoTimestamp(token.expiresAt, now));
}

export function sessionResponse(record, session) {
    return {
        accessToken: sessionToken(session.accessToken, 'accessToken'),
        expiresAt: sessionTimestamp(session.expiresAt, 'expiresAt'),
        namespace: safeName(record.namespace, 'namespace'),
        refreshExpiresAt: sessionTimestamp(session.refreshExpiresAt, 'refreshExpiresAt'),
        refreshToken: sessionToken(session.refreshToken, 'refreshToken'),
        serverId: sessionServerId(record.serverId),
    };
}

export function accountPairingResponse(options) {
    const expiresAt = pairingTimestamp(options.token.expiresAt);
    return {
        expiresAt,
        namespace: options.namespace,
        pairingUri: tauriPairingUri({ ...options, token: { ...options.token, expiresAt } }),
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
    return optionalRecordArray(record.pairingTokens, 'namespace pairingTokens').find(item => {
        return hasFutureIsoTimestamp(item.expiresAt, now) && constantTimeEqual(token, item.token);
    });
}

function expiredPairingToken(record, token) {
    return optionalRecordArray(record.pairingTokens, 'namespace pairingTokens')
        .some(item => constantTimeEqual(token, item.token));
}

function assertPairingToken(actual, expected) {
    if (!expected) {
        throw serverError('TT_SYNC_PAIRING_TOKEN is required for pairing');
    }
    if (!constantTimeEqual(String(actual || ''), expected)) {
        throw unauthorized('Invalid pairing token');
    }
}

function hasFutureIsoTimestamp(value, now) {
    if (typeof value !== 'string' || !ISO_TIMESTAMP_PATTERN.test(value)) {
        return false;
    }
    return Date.parse(value) > now;
}

function sessionToken(value, label) {
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`Invalid session ${label}`);
    }
    return value;
}

function sessionTimestamp(value, label) {
    if (typeof value !== 'string' || !ISO_TIMESTAMP_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
        throw new Error(`Invalid session ${label}`);
    }
    return value;
}

function sessionServerId(value) {
    if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
        throw new Error('Invalid session serverId');
    }
    return value.toLowerCase();
}

function pairingToken(value) {
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error('Invalid pairing token');
    }
    return value;
}

function pairingTimestamp(value) {
    if (typeof value !== 'string' || !ISO_TIMESTAMP_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
        throw new Error('Invalid pairing expiresAt');
    }
    return value;
}

function optionalRecordArray(value, label) {
    if (value === undefined || value === null) {
        return [];
    }
    return recordArray(value, label);
}

function recordArray(value, label) {
    if (!Array.isArray(value)) {
        throw new Error(`Invalid ${label}`);
    }
    return value;
}

function tauriPairingUri(options) {
    const uri = new URL('tauritavern://tt-sync/pair');
    uri.searchParams.set('v', '2');
    uri.searchParams.set('url', options.endpoint);
    uri.searchParams.set('token', pairingToken(options.token.token));
    uri.searchParams.set('exp', String(Date.parse(options.token.expiresAt)));
    uri.searchParams.set('spki', options.spki);
    return uri.toString();
}
