import assert from 'node:assert/strict';
import {
    activeAccessToken,
    activeRefreshSession,
    assertAccountLogin,
    pruneExpiredSessions,
    prunePairingTokens,
} from '../lib/account.js';

const TEST_USERNAME = 'test-user';
const TEST_PASSWORD = 'test-password';

await testAccountLoginAcceptsValidCredentials();
await testAccountLoginRejectsInvalidCredentials();
await testAccountLoginRequiresConfiguredCredentials();
await testAccountSessionsRejectNonIsoFutureExpiry();
await testAccountPairingTokensRejectNonIsoFutureExpiry();
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
