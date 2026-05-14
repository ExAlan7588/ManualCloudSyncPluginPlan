import assert from 'node:assert/strict';
import { webDavXhrTransfer } from '../../modules/webdav-transfer.js';

const originalXhr = globalThis.XMLHttpRequest;
const originalPerformance = globalThis.performance;

try {
    await testWebDavTransferSetsHeadersAndResolves();
    console.log('ok - WebDAV transfer helper sets headers and resolves responses');
    await testWebDavTransferReportsHttpFailureDetail();
    console.log('ok - WebDAV transfer helper reports HTTP failure detail');
} finally {
    globalThis.XMLHttpRequest = originalXhr;
    globalThis.performance = originalPerformance;
}

async function testWebDavTransferSetsHeadersAndResolves() {
    const statuses = [];
    const xhr = installFakeXhr();
    const transfer = webDavXhrTransfer({
        body: 'payload',
        context: { setStatus: message => statuses.push(message) },
        headers: { Authorization: 'Basic abc', 'Content-Type': 'application/zip' },
        key: 'remote/file.zip',
        label: '上傳同步包',
        method: 'PUT',
        progressTarget: 'upload',
        responseType: 'text',
        totalBytes: 7,
        url: 'https://storage.example.com/remote/file.zip',
    });
    xhr.instance.status = 204;
    xhr.instance.response = '';
    xhr.instance.onload();
    assert.equal(await transfer, '');
    assert.equal(xhr.instance.method, 'PUT');
    assert.equal(xhr.instance.url, 'https://storage.example.com/remote/file.zip');
    assert.equal(xhr.instance.headers.Authorization, 'Basic abc');
    assert.equal(xhr.instance.headers['Content-Type'], 'application/zip');
    assert.ok(statuses[0].startsWith('上傳同步包'));
}

async function testWebDavTransferReportsHttpFailureDetail() {
    const xhr = installFakeXhr();
    const transfer = webDavXhrTransfer({
        context: { setStatus: () => {} },
        headers: {},
        key: 'remote/file.zip',
        label: '下載同步包',
        method: 'GET',
        progressTarget: 'download',
        responseType: 'blob',
        totalBytes: 12,
        url: 'https://storage.example.com/remote/file.zip',
    });
    xhr.instance.status = 507;
    xhr.instance.responseText = 'quota exceeded';
    xhr.instance.onload();
    await assert.rejects(transfer, /WebDAV GET remote\/file\.zip 回傳 HTTP 507：quota exceeded/);
}

function installFakeXhr() {
    const holder = {};
    globalThis.performance = { now: () => 1000 };
    globalThis.XMLHttpRequest = class FakeXMLHttpRequest {
        constructor() {
            this.headers = {};
            this.upload = {};
            holder.instance = this;
        }

        open(method, url, async) {
            this.async = async;
            this.method = method;
            this.url = url;
        }

        setRequestHeader(name, value) {
            this.headers[name] = value;
        }

        send(body) {
            this.body = body;
        }
    };
    return holder;
}
