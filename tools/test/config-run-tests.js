import assert from 'node:assert/strict';
import { normalizeCompatSecrets } from '../../modules/config.js';

testNormalizeCompatSecretsRejectsMalformedValues();
testNormalizeCompatSecretsTrimsStrings();
console.log('ok - config helpers validate compat secrets');

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
