import assert from 'node:assert/strict';
import { normalizeCompatConfig, normalizeCompatSecrets, validateBeforeSave } from '../../modules/config.js';
import { BACKEND_WEBDAV, MODE_COMPAT } from '../../modules/constants.js';

testNormalizeCompatConfigRejectsMalformedTextFields();
testNormalizeCompatConfigRejectsMalformedBooleanFields();
testNormalizeCompatConfigTrimsStrings();
testNormalizeCompatSecretsRejectsMalformedValues();
testNormalizeCompatSecretsTrimsStrings();
testValidateBeforeSaveRejectsMalformedSecretFlags();
console.log('ok - config helpers validate compat secrets');

function testNormalizeCompatConfigRejectsMalformedTextFields() {
    assert.throws(
        () => normalizeCompatConfig({ remotePrefix: { prefix: 'cloud-sync' } }),
        /Invalid compat config remotePrefix/,
    );
}

function testNormalizeCompatConfigRejectsMalformedBooleanFields() {
    assert.throws(
        () => normalizeCompatConfig({ s3: { pathStyle: 'false' } }),
        /Invalid compat config s3.pathStyle/,
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
    assert.equal(config.s3.pathStyle, true);
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

function testValidateBeforeSaveRejectsMalformedSecretFlags() {
    assert.throws(
        () => validateBeforeSave(
            {
                backend: BACKEND_WEBDAV,
                endpoint: 'https://storage.example.test/dav',
                remotePrefix: 'cloud-sync',
                webdav: { authMode: 'basic', username: 'user' },
            },
            { webdavPassword: null },
            {
                configView: { secrets: { hasWebdavPassword: 'yes' } },
                mode: MODE_COMPAT,
            },
        ),
        /Invalid saved secret flag hasWebdavPassword/,
    );
}
