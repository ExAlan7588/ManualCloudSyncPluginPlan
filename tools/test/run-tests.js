import assert from 'node:assert/strict';
import { smokeTtSyncServer } from '../smoke-tt-sync-server.js';

const PAIRING_TOKEN_ENV = 'TT_SYNC_PAIRING_TOKEN';

const tests = [
    ['server smoke verifier passes against explicit local server', testLocalSmoke],
    ['server smoke verifier requires endpoint or local mode', testRequiresTarget],
    ['server smoke verifier requires remote pairing token', testRequiresRemotePairingToken],
];

for (const [name, test] of tests) {
    try {
        await test();
        console.log(`ok - ${name}`);
    } catch (error) {
        console.error(`not ok - ${name}`);
        console.error(error);
        process.exitCode = 1;
        break;
    }
}

async function testLocalSmoke() {
    const previousToken = process.env[PAIRING_TOKEN_ENV];
    process.env[PAIRING_TOKEN_ENV] = 'preserve-this-token';
    const report = await smokeTtSyncServer({ local: true }).finally(() => {
        assert.equal(process.env[PAIRING_TOKEN_ENV], 'preserve-this-token');
        restorePairingToken(previousToken);
    });
    assert.equal(report.ok, true);
    assert.equal(report.mode, 'local');
    assert.match(report.endpoint, /^http:\/\/127\.0\.0\.1:/);
    assert.match(report.namespace, /^smoke-/);
    assert.match(report.smokePath, /^default-user\/chats\/tt-sync-smoke-/);
    assertCheckNames(report);
}

async function testRequiresTarget() {
    await assert.rejects(
        smokeTtSyncServer({ pairingToken: 'token-without-endpoint' }),
        /Either --endpoint <url> or --local is required/,
    );
}

async function testRequiresRemotePairingToken() {
    const previousToken = process.env[PAIRING_TOKEN_ENV];
    delete process.env[PAIRING_TOKEN_ENV];
    try {
        await assert.rejects(
            smokeTtSyncServer({ endpoint: 'http://127.0.0.1:9' }),
            /--pairing-token or TT_SYNC_PAIRING_TOKEN is required/,
        );
    } finally {
        restorePairingToken(previousToken);
    }
}

function assertCheckNames(report) {
    const names = report.checks.map(check => check.name);
    assert.deepEqual(names, [
        'status',
        'pair',
        'session',
        'progress planned',
        'progress transferring',
        'progress committed',
        'push commit',
        'pull mtime header',
        'empty diff',
        'device history',
    ]);
}

function restorePairingToken(previousToken) {
    if (previousToken === undefined) {
        delete process.env[PAIRING_TOKEN_ENV];
        return;
    }
    process.env[PAIRING_TOKEN_ENV] = previousToken;
}
