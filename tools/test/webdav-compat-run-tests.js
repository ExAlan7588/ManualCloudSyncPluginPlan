import assert from 'node:assert/strict';
import { hrefFileName } from '../../modules/webdav-compat.js';

testHrefFileNameRejectsMalformedInputWithContext();
console.log('ok - WebDAV compat helpers expose malformed href context');

function testHrefFileNameRejectsMalformedInputWithContext() {
    assert.throws(
        () => hrefFileName({ href: '/dav/cloud-sync/sync-0102030405.manifest.json' }),
        /WebDAV PROPFIND href 必須是文字/,
    );
}
