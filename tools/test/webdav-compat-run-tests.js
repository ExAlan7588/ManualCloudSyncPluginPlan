import assert from 'node:assert/strict';
import { compatDownloadAndImport, hrefFileName } from '../../modules/webdav-compat.js';

testHrefFileNameRejectsMalformedInputWithContext();
await testCompatDownloadRejectsMalformedQueueItem();
await testCompatDownloadRejectsMissingManifestKey();
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

async function testCompatDownloadRejectsMissingManifestKey() {
    await assert.rejects(
        compatDownloadAndImport({
            manifest: validManifest(),
            zipKey: 'cloud-sync/sync-0102030405.zip',
        }, { setStatus() {} }),
        /WebDAV 佇列項目格式不正確/,
    );
}

function validManifest() {
    return {
        createdAt: '2026-05-17T00:00:00.000Z',
        file: 'sync-0102030405.zip',
        formatVersion: 1,
        sha256: 'a'.repeat(64),
        sizeBytes: 1,
    };
}
