import assert from 'node:assert/strict';
import { verifyTtSyncDeploy } from '../verify-tt-sync-deploy.js';

const tests = [
    ['deploy verifier accepts repo template placeholders explicitly', testDeployVerifierTemplate],
    ['deploy verifier rejects placeholder token for real env', testDeployVerifierRejectsPlaceholderToken],
    ['deploy verifier rejects malformed env quotes', testDeployVerifierRejectsMalformedQuotes],
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
