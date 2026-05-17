import assert from 'node:assert/strict';
import { normalizeCompatConfig, normalizeCompatSecrets } from '../../modules/config.js';

testNormalizeCompatConfigRejectsMalformedTextFields();
testNormalizeCompatConfigTrimsStrings();
testNormalizeCompatSecretsRejectsMalformedValues();
testNormalizeCompatSecretsTrimsStrings();
console.log('ok - config helpers validate compat secrets');

function testNormalizeCompatConfigRejectsMalformedTextFields() {
    assert.throws(
        () => normalizeCompatConfig({ remotePrefix: { prefix: 'cloud-sync' } }),
        /Invalid compat config remotePrefix/,
    );
}

function testNormalizeCompatConfigTrimsStrings() {
    const config = normalizeCompatConfig({
        endpoint: ' https://storage.example.test/dav ',
        remotePrefix: ' cloud-sync ',
        webdav: { authMode: ' basic ', username: ' user ' },
    });
    assert.equal(config.endpoint, 'https://storage.example.test/dav');
    assert.equal(config.remotePrefix, 'cloud-sync');
    assert.equal(config.webdav.authMode, 'basic');
    assert.equal(config.webdav.username, 'user');
}

function testNormalizeCompatSecretsRejectsMalformedValues() {
    assert.throws(
        () => normalizeCompatSecrets({ webdavPassword: { value: 'pass' } }),
        /Invalid compat secret webdavPassword/,
    );
}

function testNormalizeCompatSecretsTrimsStrings() {
    assert.deepEqual(normalizeCompatSecrets({
        s3AccessKey: '',
        webdavPassword: ' pass ',
        webdavToken: null,
    }), {
        s3AccessKey: null,
        s3SecretKey: null,
        s3SessionToken: null,
        webdavPassword: 'pass',
        webdavToken: null,
    });
}
