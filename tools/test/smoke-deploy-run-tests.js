import assert from 'node:assert/strict';
import http from 'node:http';
import { smokeTtSyncServer } from '../smoke-tt-sync-server.js';
import { verifyTtSyncDeploy } from '../verify-tt-sync-deploy.js';

const PAIRING_TOKEN_ENV = 'TT_SYNC_PAIRING_TOKEN';
const TEST_BULK_FILE_BYTES = 128;
const TEST_BULK_FILES = 3;

const tests = [
    ['server smoke verifier passes against explicit local server', testLocalSmoke],
    ['server smoke verifier supports bulk fixture', testBulkSmokeFixture],
    ['server smoke verifier requires endpoint or local mode', testRequiresTarget],
    ['server smoke verifier requires remote pairing token', testRequiresRemotePairingToken],
    ['server smoke verifier reports raw non-json responses', testRemoteSmokeReportsRawResponse],
    ['deploy verifier accepts repo template placeholders explicitly', testDeployVerifierTemplate],
    ['deploy verifier rejects placeholder token for real env', testDeployVerifierRejectsPlaceholderToken],
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
    assert.match(report.serverId, /^minimal-smoke-/);
    assert.match(report.smokePath, /^default-user\/chats\/tt-sync-smoke-/);
    assertCheckNames(report);
}

async function testBulkSmokeFixture() {
    const report = await smokeTtSyncServer({
        bulkFileBytes: TEST_BULK_FILE_BYTES,
        bulkFiles: TEST_BULK_FILES,
        local: true,
    });
    assert.equal(report.fixture.fileCount, TEST_BULK_FILES);
    assert.equal(report.fixture.totalBytes, TEST_BULK_FILES * TEST_BULK_FILE_BYTES);
    assert.equal(report.smokePaths.length, TEST_BULK_FILES);
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

async function testRemoteSmokeReportsRawResponse() {
    const server = http.createServer((_request, response) => {
        response.writeHead(200, { 'Content-Type': 'text/plain' });
        response.end('not-json');
    });
    await listen(server);
    try {
        const address = server.address();
        const endpoint = `http://127.0.0.1:${address.port}`;
        await assert.rejects(
            smokeTtSyncServer({ endpoint, pairingToken: 'token-without-status-json' }),
            /HTTP 200: not-json/,
        );
    } finally {
        await close(server);
    }
}

async function testDeployVerifierTemplate() {
    const report = await verifyTtSyncDeploy({ allowPlaceholders: true });
    assert.equal(report.ok, true);
    assert.deepEqual(report.failed, []);
}

async function testDeployVerifierRejectsPlaceholderToken() {
    const report = await verifyTtSyncDeploy();
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('env pairing token is not placeholder'));
}

function assertCheckNames(report) {
    const names = report.checks.map(check => check.name);
    assert.ok(report.checks.every(check => check.ok === true), 'all smoke checks must report ok=true');
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

async function listen(server) {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
}

async function close(server) {
    await new Promise(resolve => server.close(resolve));
}
