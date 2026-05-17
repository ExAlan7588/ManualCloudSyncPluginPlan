import assert from 'node:assert/strict';
import { compatDownloadAndImport, hrefFileName } from '../../modules/webdav-compat.js';

testHrefFileNameRejectsMalformedInputWithContext();
await testCompatDownloadRejectsMalformedQueueItem();
console.log('ok - WebDAV compat helpers validate malformed inputs');

function testHrefFileNameRejectsMalformedInputWithContext() {
    assert.throws(
        () => hrefFileName({ href: '/dav/cloud-sync/sync-0102030405.manifest.json' }),
        /WebDAV PROPFIND href 必須是文字/,
    );
}

async function testCompatDownloadRejectsMalformedQueueItem() {
    await assert.rejects(
        compatDownloadAndImport({}, { setStatus() {} }),
        /WebDAV 佇列項目格式不正確/,
    );
}
