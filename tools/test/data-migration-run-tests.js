import assert from 'node:assert/strict';
import { importArchiveBlob } from '../../modules/data-migration.js';

const originalFetch = globalThis.fetch;
const originalSetTimeout = globalThis.setTimeout;

try {
    await testImportRejectsMalformedJobId();
    await testImportRejectsMalformedJobState();
    await testImportStatusRejectsMalformedTextValues();
    console.log('ok - data migration validates job payloads');
} finally {
    restoreGlobal('fetch', originalFetch);
    restoreGlobal('setTimeout', originalSetTimeout);
}

async function testImportRejectsMalformedJobId() {
    globalThis.fetch = async url => {
        if (String(url).includes('/import')) {
            return jsonResponse({ job_id: { value: 'job-1' } });
        }
        throw new Error(`unexpected fetch: ${url}`);
    };

    await assert.rejects(
        importArchiveBlob(new Blob(['zip']), 'sync.zip', { setStatus() {} }),
        /資料匯入 job id 缺失/,
    );
}

async function testImportRejectsMalformedJobState() {
    let jobPolls = 0;
    globalThis.setTimeout = fn => {
        fn();
        return 0;
    };
    globalThis.fetch = async url => {
        if (String(url).includes('/job?')) {
            jobPolls += 1;
            if (jobPolls > 1) {
                throw new Error('invalid state was polled again');
            }
            return jsonResponse({ state: { value: 'completed' } });
        }
        return jsonResponse({ job_id: 'job-1' });
    };

    await assert.rejects(
        importArchiveBlob(new Blob(['zip']), 'sync.zip', { setStatus() {} }),
        /資料遷移 job 狀態格式不正確/,
    );
}

async function testImportStatusRejectsMalformedTextValues() {
    const statuses = [];
    globalThis.fetch = async url => {
        if (String(url).includes('/job?')) {
            return jsonResponse({
                message: true,
                progress_percent: '25',
                stage: { name: 'Importing' },
                state: 'completed',
            });
        }
        return jsonResponse({ job_id: 'job-1' });
    };

    await importArchiveBlob(new Blob(['zip']), 'sync.zip', {
        setStatus: message => statuses.push(message),
    });
    assert.deepEqual(statuses, ['25.0%']);
}

function jsonResponse(payload) {
    return new Response(JSON.stringify(payload), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
    });
}

function restoreGlobal(name, previous) {
    if (previous === undefined) {
        delete globalThis[name];
        return;
    }
    globalThis[name] = previous;
}
