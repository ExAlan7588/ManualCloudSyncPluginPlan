import assert from 'node:assert/strict';
import { importArchiveBlob } from '../../modules/data-migration.js';

const originalFetch = globalThis.fetch;

try {
    await testImportRejectsMalformedJobId();
    await testImportStatusRejectsMalformedTextValues();
    console.log('ok - data migration validates job id and status text');
} finally {
    restoreGlobal('fetch', originalFetch);
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
