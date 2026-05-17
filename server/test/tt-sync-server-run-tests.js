import assert from 'node:assert/strict';
import { buildPairingUri } from '../tt-sync-server.js';

const TEST_TOKEN = 'test-pairing-token';

await testPairingUriUsesHttpsWhenTlsIsConfigured();
await testPairingUriRejectsIncompleteTlsConfig();
await testPairingUriRejectsNonDecimalPort();
console.log('ok - TT-Sync server TLS entrypoint config');

async function testPairingUriUsesHttpsWhenTlsIsConfigured() {
    const uri = new URL(buildPairingUri({
        host: 'sync.example.test',
        port: 9443,
        tlsCertPath: '/tmp/cert.pem',
        tlsKeyPath: '/tmp/key.pem',
        token: TEST_TOKEN,
    }));
    assert.equal(uri.searchParams.get('endpoint'), 'https://sync.example.test:9443');
}

async function testPairingUriRejectsIncompleteTlsConfig() {
    assert.throws(
        () => buildPairingUri({ tlsCertPath: '/tmp/cert.pem', token: TEST_TOKEN }),
        /TT_SYNC_TLS_CERT_PATH and TT_SYNC_TLS_KEY_PATH must be set together/,
    );
}

async function testPairingUriRejectsNonDecimalPort() {
    assert.throws(
        () => buildPairingUri({ port: '0x2500', token: TEST_TOKEN }),
        /server port must be a decimal TCP port number/,
    );
}
