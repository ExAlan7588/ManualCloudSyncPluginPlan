import assert from 'node:assert/strict';
import {
    activeAccessToken,
    activeRefreshSession,
    accountPairingResponse,
    assertAccountLogin,
    pruneExpiredSessions,
    prunePairingTokens,
    sessionResponse,
} from '../lib/account.js';

const TEST_USERNAME = 'test-user';
const TEST_PASSWORD = 'test-password';

await testAccountLoginAcceptsValidCredentials();
await testAccountLoginRejectsInvalidCredentials();
await testAccountLoginRequiresConfiguredCredentials();
await testAccountSessionsRejectNonIsoFutureExpiry();
await testAccountPairingTokensRejectNonIsoFutureExpiry();
await testAccountHelpersRejectMalformedRecordArrays();
await testSessionResponseRejectsMalformedFields();
await testAccountPairingResponseRejectsMalformedTokenFields();
console.log('ok - account credential checks are explicit');

async function testAccountLoginAcceptsValidCredentials() {
    withAccountEnv(() => {
        assertAccountLogin({ password: TEST_PASSWORD, username: TEST_USERNAME });
    });
}

async function testAccountLoginRejectsInvalidCredentials() {
    withAccountEnv(() => {
        assert.throws(
            () => assertAccountLogin({ password: TEST_PASSWORD, username: 'wrong-user' }),
            /Invalid account credentials/,
        );
        assert.throws(
            () => assertAccountLogin({ password: 'wrong-password', username: TEST_USERNAME }),
            /Invalid account credentials/,
        );
    });
}

async function testAccountLoginRequiresConfiguredCredentials() {
    const previousUsername = process.env.TT_SYNC_ACCOUNT_USERNAME;
    const previousPassword = process.env.TT_SYNC_ACCOUNT_PASSWORD;
    delete process.env.TT_SYNC_ACCOUNT_USERNAME;
    delete process.env.TT_SYNC_ACCOUNT_PASSWORD;
    try {
        assert.throws(
            () => assertAccountLogin({ password: TEST_PASSWORD, username: TEST_USERNAME }),
            /TT_SYNC_ACCOUNT_USERNAME and TT_SYNC_ACCOUNT_PASSWORD are required/,
        );
    } finally {
        restoreEnv('TT_SYNC_ACCOUNT_USERNAME', previousUsername);
        restoreEnv('TT_SYNC_ACCOUNT_PASSWORD', previousPassword);
    }
}

async function testAccountSessionsRejectNonIsoFutureExpiry() {
    const record = {
        sessions: [{
            accessToken: 'access-token',
            expiresAt: '9999',
            refreshExpiresAt: '9999',
            refreshToken: 'refresh-token',
        }],
    };
    assert.equal(activeAccessToken(record, 'access-token'), false);
    assert.equal(activeRefreshSession(record, 'refresh-token'), undefined);
    assert.deepEqual(pruneExpiredSessions(record.sessions), []);
}

async function testAccountPairingTokensRejectNonIsoFutureExpiry() {
    const tokens = [{ expiresAt: '9999', token: 'pairing-token' }];
    assert.deepEqual(prunePairingTokens(tokens), []);
}

async function testAccountHelpersRejectMalformedRecordArrays() {
    assert.throws(
        () => activeAccessToken({ sessions: 'bad' }, 'access-token'),
        /Invalid namespace sessions/,
    );
    assert.throws(
        () => prunePairingTokens('bad'),
        /Invalid namespace pairingTokens/,
    );
}

async function testSessionResponseRejectsMalformedFields() {
    const record = { namespace: 'default', serverId: 'server-1' };
    const session = validSession();
    assert.throws(
        () => sessionResponse(record, { ...session, accessToken: { value: 'access-token' } }),
        /Invalid session accessToken/,
    );
    assert.throws(
        () => sessionResponse(record, { ...session, expiresAt: '9999' }),
        /Invalid session expiresAt/,
    );
    assert.throws(
        () => sessionResponse({ ...record, namespace: '../default' }, session),
        /namespace must use A-Z/,
    );
    assert.throws(
        () => sessionResponse({ ...record, serverId: 'not-a-uuid' }, session),
        /Invalid session serverId/,
    );
}

function validSession() {
    return {
        accessToken: 'access-token',
        expiresAt: '2026-05-17T00:00:00.000Z',
        refreshExpiresAt: '2026-05-18T00:00:00.000Z',
        refreshToken: 'refresh-token',
    };
}

async function testAccountPairingResponseRejectsMalformedTokenFields() {
    const options = accountPairingOptions();
    assert.throws(
        () => accountPairingResponse({ ...options, token: { ...options.token, token: { value: 'pairing-token' } } }),
        /Invalid pairing token/,
    );
    assert.throws(
        () => accountPairingResponse({ ...options, token: { ...options.token, expiresAt: '9999' } }),
        /Invalid pairing expiresAt/,
    );
}

function accountPairingOptions() {
    return {
        endpoint: 'https://sync.example.test',
        namespace: 'default',
        spki: Buffer.alloc(32, 1).toString('base64url'),
        token: {
            expiresAt: '2026-05-18T00:00:00.000Z',
            token: 'pairing-token',
        },
    };
}

function withAccountEnv(callback) {
    const previousUsername = process.env.TT_SYNC_ACCOUNT_USERNAME;
    const previousPassword = process.env.TT_SYNC_ACCOUNT_PASSWORD;
    process.env.TT_SYNC_ACCOUNT_USERNAME = TEST_USERNAME;
    process.env.TT_SYNC_ACCOUNT_PASSWORD = TEST_PASSWORD;
    try {
        callback();
    } finally {
        restoreEnv('TT_SYNC_ACCOUNT_USERNAME', previousUsername);
        restoreEnv('TT_SYNC_ACCOUNT_PASSWORD', previousPassword);
    }
}

function restoreEnv(name, value) {
    if (value === undefined) {
        delete process.env[name];
        return;
    }
    process.env[name] = value;
}
