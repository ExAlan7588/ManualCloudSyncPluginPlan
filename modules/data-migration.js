import {
    JOB_POLL_INTERVAL_MS,
    JSON_CONTENT_TYPE,
    TERMINAL_JOB_STATES,
} from './constants.js';
import { normalizeError, readFailureMessage } from './errors.js';
import { formatProgress } from './format.js';

let mobileRuntimePromise = null;

export async function runCompatExportToFile(context) {
    const jobId = await startDataArchiveExportJob();
    const finalStatus = await pollDataArchiveJob({ jobId, setStatus: context.setStatus });
    if (finalStatus.state !== 'completed') {
        throw new Error(finalStatus.error || `資料匯出未完成：${finalStatus.state}`);
    }

    const result = await saveDataArchiveExport(jobId);
    context.setStatus(result.savedTarget ? `資料封存已匯出：${result.savedTarget}` : '資料封存已匯出');
}

export async function importArchiveBlob(blob, fileName, context) {
    const formData = new FormData();
    formData.append('archive', blob, fileName);
    const response = await fetch('/api/extensions/data-migration/import', {
        method: 'POST',
        body: formData,
    });
    if (!response.ok) {
        throw new Error(await readFailureMessage(response));
    }

    const jobId = requireJobId(await response.json(), '資料匯入 job id 缺失');
    const finalStatus = await pollDataArchiveJob({ jobId, setStatus: context.setStatus });
    if (finalStatus.state !== 'completed') {
        throw new Error(finalStatus.error || `資料匯入未完成：${finalStatus.state}`);
    }
}

async function startDataArchiveExportJob() {
    const response = await fetch('/api/extensions/data-migration/export', { method: 'POST' });
    if (!response.ok) {
        throw new Error(await readFailureMessage(response));
    }

    return requireJobId(await response.json(), '資料匯出 job id 缺失');
}

async function saveDataArchiveExport(jobId) {
    const runtime = await resolveMobileRuntime();
    if (runtime.isAndroidRuntime()) {
        return postDataArchiveSave('/api/extensions/data-migration/export/android/save', jobId);
    }
    if (runtime.isIosRuntime()) {
        return shareIosDataArchive(jobId);
    }

    return postDataArchiveSave('/api/extensions/data-migration/export/save', jobId);
}

async function resolveMobileRuntime() {
    try {
        const module = await loadMobileRuntimeModule();
        return {
            isAndroidRuntime: requireRuntimeFunction(module, 'isAndroidRuntime'),
            isIosRuntime: requireRuntimeFunction(module, 'isIosRuntime'),
        };
    } catch (error) {
        throw new Error(`資料遷移匯出需要 TauriTavern runtime helper：${normalizeError(error)}`);
    }
}

async function loadMobileRuntimeModule() {
    if (!mobileRuntimePromise) {
        mobileRuntimePromise = import('/scripts/util/mobile-runtime.js').catch(error => {
            mobileRuntimePromise = null;
            throw error;
        });
    }

    return mobileRuntimePromise;
}

function requireRuntimeFunction(module, name) {
    const fn = module?.[name];
    if (typeof fn !== 'function') {
        throw new Error(`mobile-runtime.js 缺少 ${name}`);
    }

    return fn;
}

async function postDataArchiveSave(url, jobId) {
    const payload = await postJson(url, { job_id: jobId });
    return { savedTarget: String(payload?.saved_target || '') };
}

async function shareIosDataArchive(jobId) {
    const payload = await postJson('/api/extensions/data-migration/export/ios/share', { job_id: jobId });
    if (!payload?.completed) {
        throw new Error('iOS 分享已取消，沒有匯出檔案');
    }

    return { savedTarget: '' };
}

async function pollDataArchiveJob(options) {
    while (true) {
        const status = await fetchDataArchiveJob(options.jobId);
        updateStatusFromDataArchiveJob(status, options.setStatus);
        if (TERMINAL_JOB_STATES.has(status.state)) {
            return status;
        }
        await sleep(JOB_POLL_INTERVAL_MS);
    }
}

async function fetchDataArchiveJob(jobId) {
    const response = await fetch(`/api/extensions/data-migration/job?id=${encodeURIComponent(jobId)}`, {
        method: 'GET',
        cache: 'no-store',
    });
    if (!response.ok) {
        throw new Error(await readFailureMessage(response));
    }

    return response.json();
}

function updateStatusFromDataArchiveJob(status, setStatus) {
    const parts = [status?.stage, formatProgress(status?.progress_percent), status?.message]
        .map(value => String(value || '').trim())
        .filter(Boolean);
    if (parts.length > 0) {
        setStatus(parts.join(' | '));
    }
}

async function postJson(url, body) {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': JSON_CONTENT_TYPE },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        throw new Error(await readFailureMessage(response));
    }

    return response.json();
}

function requireJobId(payload, message) {
    const jobId = String(payload?.job_id || '').trim();
    if (!jobId) {
        throw new Error(message);
    }
    return jobId;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
