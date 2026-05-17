import { TRANSFER_PROGRESS_RENDER_INTERVAL_MS } from './constants.js';
import { formatTransferProgress } from './format.js';
import { webDavHeaderMap } from './webdav-headers.js';

export function webDavXhrTransfer(options) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const report = createTransferProgressReporter(options);
        xhr.open(options.method, options.url, true);
        xhr.responseType = options.responseType;
        setXhrHeaders(xhr, options.headers);
        bindXhrTransferEvents({ options, reject, report, resolve, xhr });
        report(0, options.totalBytes, true);
        xhr.send(options.body || null);
    });
}

function setXhrHeaders(xhr, headers) {
    for (const [name, value] of Object.entries(webDavHeaderMap(headers))) {
        xhr.setRequestHeader(name, value);
    }
}

function bindXhrTransferEvents(params) {
    const progressSource = params.options.progressTarget === 'upload' ? params.xhr.upload : params.xhr;
    progressSource.onprogress = event => params.report(
        event.loaded,
        progressEventTotal(event, params.options.totalBytes),
        false,
    );
    params.xhr.onload = () => resolveCompletedXhr(params);
    params.xhr.onerror = () => params.reject(new Error(`WebDAV ${params.options.method} 連線失敗，請確認端點與 CORS 設定`));
    params.xhr.onabort = () => params.reject(new Error(`WebDAV ${params.options.method} 已中止`));
    params.xhr.ontimeout = () => params.reject(new Error(`WebDAV ${params.options.method} 逾時`));
}

function resolveCompletedXhr(params) {
    const finalBytes = finalTransferBytes(params.xhr, params.options);
    params.report(finalBytes, finalBytes || params.options.totalBytes, true);
    if (params.xhr.status >= 200 && params.xhr.status < 300) {
        params.resolve(params.xhr.response);
        return;
    }

    params.reject(new Error(xhrFailureMessage(params.xhr, params.options)));
}

function createTransferProgressReporter(options) {
    const startedAt = performance.now();
    let lastRenderAt = 0;
    return (loadedBytes, totalBytes, force) => {
        const now = performance.now();
        if (!force && now - lastRenderAt < TRANSFER_PROGRESS_RENDER_INTERVAL_MS) {
            return;
        }

        lastRenderAt = now;
        options.context.setStatus(formatTransferProgress({
            label: options.label,
            loadedBytes,
            now,
            startedAt,
            totalBytes: totalBytes || options.totalBytes,
        }));
    };
}

function progressEventTotal(event, fallbackTotal) {
    return event.lengthComputable ? event.total : fallbackTotal;
}

function finalTransferBytes(xhr, options) {
    if (options.progressTarget === 'upload') {
        return options.totalBytes;
    }

    return xhr.response instanceof Blob ? xhr.response.size : options.totalBytes;
}

function xhrFailureMessage(xhr, options) {
    const detail = xhrResponseText(xhr);
    return `WebDAV ${options.method} ${options.key} 回傳 HTTP ${xhr.status}${detail ? `：${detail}` : ''}`;
}

function xhrResponseText(xhr) {
    try {
        return String(xhr.responseText || '').trim();
    } catch {
        return '';
    }
}
