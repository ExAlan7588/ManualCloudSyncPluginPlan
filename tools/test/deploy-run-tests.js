import assert from 'node:assert/strict';
import { verifyTtSyncDeploy } from '../verify-tt-sync-deploy.js';

const tests = [
    ['deploy verifier accepts repo template placeholders explicitly', testDeployVerifierTemplate],
    ['deploy verifier rejects placeholder token for real env', testDeployVerifierRejectsPlaceholderToken],
    ['deploy verifier checks effective duplicate env value', testDeployVerifierChecksEffectiveDuplicateEnvValue],
    ['deploy verifier rejects non-decimal port env value', testDeployVerifierRejectsNonDecimalPort],
    ['deploy verifier rejects malformed env quotes', testDeployVerifierRejectsMalformedQuotes],
    ['deploy verifier accepts paired TLS env', testDeployVerifierAcceptsPairedTlsEnv],
    ['deploy verifier rejects incomplete TLS env', testDeployVerifierRejectsIncompleteTlsEnv],
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

async function testDeployVerifierChecksEffectiveDuplicateEnvValue() {
    const report = await verifyTtSyncDeploy({
        envText: [
            'TT_SYNC_DATA_DIR=/var/lib/manual-cloud-tt-sync',
            'TT_SYNC_HOST=0.0.0.0',
            'TT_SYNC_PORT=9443',
            'TT_SYNC_PUBLIC_URL=https://sync.example.com:9443',
            'TT_SYNC_PAIRING_TOKEN=real-token-for-deploy',
            'TT_SYNC_PAIRING_TOKEN=replace-with-strong-token',
        ].join('\n'),
        serviceText: serviceText(),
    });
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('env pairing token is not placeholder'));
}

async function testDeployVerifierRejectsNonDecimalPort() {
    const report = await verifyTtSyncDeploy({
        allowPlaceholders: true,
        envText: envText(['TT_SYNC_PORT=0x2500']),
        serviceText: serviceText(),
    });
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('env port'));
}

async function testDeployVerifierRejectsMalformedQuotes() {
    const report = await verifyTtSyncDeploy({
        envText: [
            'TT_SYNC_DATA_DIR=/var/lib/manual-cloud-tt-sync',
            'TT_SYNC_HOST=127.0.0.1',
            'TT_SYNC_PORT=8787',
            'TT_SYNC_PUBLIC_URL=https://sync.example.com',
            "TT_SYNC_PAIRING_TOKEN='replace-with-strong-token",
        ].join('\n'),
        serviceText: [
            'WorkingDirectory=/opt/manual-cloud-sync',
            'EnvironmentFile=/etc/manual-cloud-tt-sync.env',
            'ExecStart=/usr/bin/node server/tt-sync-server.js serve',
            'Restart=on-failure',
            'User=manual-cloud-sync',
            'NoNewPrivileges=true',
            'ProtectSystem=strict',
            'ReadWritePaths=/var/lib/manual-cloud-tt-sync',
        ].join('\n'),
    });
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('env quoted values are well formed'));
}

async function testDeployVerifierAcceptsPairedTlsEnv() {
    const report = await verifyTtSyncDeploy({
        allowPlaceholders: true,
        envText: envText([
            'TT_SYNC_TLS_CERT_PATH=/etc/manual-cloud-tt-sync/cert.pem',
            'TT_SYNC_TLS_KEY_PATH=/etc/manual-cloud-tt-sync/key.pem',
        ]),
        serviceText: serviceText(),
    });
    assert.equal(report.ok, true);
}

async function testDeployVerifierRejectsIncompleteTlsEnv() {
    const report = await verifyTtSyncDeploy({
        allowPlaceholders: true,
        envText: envText(['TT_SYNC_TLS_CERT_PATH=/etc/manual-cloud-tt-sync/cert.pem']),
        serviceText: serviceText(),
    });
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('env TLS cert and key are paired'));
}

function envText(lines = []) {
    return [
        'TT_SYNC_DATA_DIR=/var/lib/manual-cloud-tt-sync',
        'TT_SYNC_HOST=0.0.0.0',
        'TT_SYNC_PORT=9443',
        'TT_SYNC_PUBLIC_URL=https://sync.example.com:9443',
        'TT_SYNC_PAIRING_TOKEN=replace-with-strong-token',
        ...lines,
    ].join('\n');
}

function serviceText() {
    return [
        'WorkingDirectory=/opt/manual-cloud-sync',
        'EnvironmentFile=/etc/manual-cloud-tt-sync.env',
        'ExecStart=/usr/bin/node server/tt-sync-server.js serve',
        'Restart=on-failure',
        'User=manual-cloud-sync',
        'NoNewPrivileges=true',
        'ProtectSystem=strict',
        'ReadWritePaths=/var/lib/manual-cloud-tt-sync',
    ].join('\n');
}
