import {
    JOB_POLL_INTERVAL_MS,
    JSON_CONTENT_TYPE,
    TERMINAL_JOB_STATES,
} from './constants.js';
import { normalizeError, readFailureMessage, readJsonResponse } from './errors.js';
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

    const jobId = requireJobId(await readJsonResponse(response, '資料匯入啟動回應'), '資料匯入 job id 缺失');
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

    return requireJobId(await readJsonResponse(response, '資料匯出啟動回應'), '資料匯出 job id 缺失');
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
    const payload = await postJson(url, { job_id: jobId }, '資料匯出儲存');
    return { savedTarget: String(payload?.saved_target || '') };
}

async function shareIosDataArchive(jobId) {
    const payload = await postJson('/api/extensions/data-migration/export/ios/share', { job_id: jobId }, 'iOS 分享');
    if (!payload?.completed) {
        throw new Error('iOS 分享已取消，沒有匯出檔案');
    }

    return { savedTarget: '' };
}

async function pollDataArchiveJob(options) {
    while (true) {
        const status = await fetchDataArchiveJob(options.jobId);
        const state = requireJobState(status);
        updateStatusFromDataArchiveJob(status, options.setStatus);
        if (TERMINAL_JOB_STATES.has(state)) {
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

    return readJsonResponse(response, '資料遷移 job 狀態回應');
}

function updateStatusFromDataArchiveJob(status, setStatus) {
    const parts = [status?.stage, formatProgress(status?.progress_percent), status?.message]
        .map(statusText)
        .filter(Boolean);
    if (parts.length > 0) {
        setStatus(parts.join(' | '));
    }
}

function statusText(value) {
    if (!isStatusTextValue(value)) {
        return '';
    }
    return String(value || '').trim();
}

function isStatusTextValue(value) {
    if (typeof value === 'number') {
        return Number.isFinite(value);
    }
    return typeof value === 'bigint' || typeof value === 'string';
}

function requireJobState(status) {
    const state = status?.state;
    if (typeof state !== 'string' || !state || state.trim() !== state) {
        throw new Error('資料遷移 job 狀態格式不正確');
    }
    return state;
}

async function postJson(url, body, label = '資料遷移 API') {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': JSON_CONTENT_TYPE },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        throw new Error(await readFailureMessage(response));
    }

    return readJsonResponse(response, `${label}回應`);
}

function requireJobId(payload, message) {
    const jobId = payload?.job_id;
    if (typeof jobId !== 'string' || !jobId.trim()) {
        throw new Error(message);
    }
    return jobId.trim();
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
