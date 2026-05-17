import assert from 'node:assert/strict';
import { webDavAuthHeaders, webDavUrlForKey } from '../../modules/webdav-url.js';

testWebDavAuthRejectsMalformedConnection();
testWebDavAuthBuildsBasicHeader();
testWebDavUrlRejectsMalformedKey();
testWebDavUrlEncodesValidKey();
console.log('ok - WebDAV URL helpers validate keys');

function testWebDavAuthRejectsMalformedConnection() {
    assert.throws(
        () => webDavAuthHeaders({ config: {} }),
        /WebDAV connection 格式不正確/,
    );
}

function testWebDavAuthBuildsBasicHeader() {
    const headers = webDavAuthHeaders({
        config: { webdav: { authMode: 'basic', username: 'user' } },
        secrets: { webdavPassword: 'pass' },
    });
    assert.equal(headers.Authorization, `Basic ${btoa('user:pass')}`);
}

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
