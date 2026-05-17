import assert from 'node:assert/strict';
import { webDavUrlForKey } from '../../modules/webdav-url.js';

testWebDavUrlRejectsMalformedKey();
testWebDavUrlEncodesValidKey();
console.log('ok - WebDAV URL helpers validate keys');

function testWebDavUrlRejectsMalformedKey() {
    assert.throws(
        () => webDavUrlForKey(configFixture(), { path: 'cloud-sync/file.zip' }),
        /WebDAV key 必須是非空文字/,
    );
}

function testWebDavUrlEncodesValidKey() {
    assert.equal(
        webDavUrlForKey(configFixture(), 'cloud sync/file name.zip'),
        'https://storage.example.test/dav/cloud%20sync/file%20name.zip',
    );
}

function configFixture() {
    return { endpoint: 'https://storage.example.test/dav' };
}
