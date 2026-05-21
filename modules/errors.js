export function normalizeError(error) {
    const commandMissingMessage = backendCommandMissingMessage(error);
    if (commandMissingMessage) {
        return commandMissingMessage;
    }

    if (error instanceof Error && error.message) {
        return error.message;
    }

    if (typeof error === 'string') {
        return error;
    }

    return String(error || '未知錯誤');
}

export function backendCommandMissingMessage(error) {
    if (isCloudSyncCommandMissingError(error)) {
        return '目前的 TauriTavern 後端沒有雲端同步原生命令。GitHub 插件只能安裝前端面板；此版本會改用資料遷移相容模式。';
    }

    if (isTtSyncCommandMissingError(error)) {
        return '目前的 TauriTavern 後端沒有 TT-Sync 增量同步命令。此面板不會模擬成功；請使用包含 tt_sync_* commands 的 TauriTavern build。';
    }

    return '';
}

export function isCloudSyncCommandMissingError(error) {
    const message = error instanceof Error ? error.message : String(error || '');
    return /Command cloud_sync_[a-z_]+ not found/.test(message);
}

export function isTtSyncCommandMissingError(error) {
    const message = error instanceof Error ? error.message : String(error || '');
    return /Command tt_sync_[a-z_]+ not found/.test(message);
}

export async function readFailureMessage(response) {
    const text = await response.text().catch(error => normalizeError(error));
    return extractErrorMessage(text);
}

export async function readJsonResponse(response, label) {
    try {
        return await response.json();
    } catch (error) {
        throw new Error(`${label} JSON 無法解析：${normalizeError(error)}`);
    }
}

export function extractErrorMessage(text) {
    if (!text) {
        return '';
    }

    try {
        const json = JSON.parse(text);
        return String(json?.error || json?.message || text).trim();
    } catch {
        return String(text).trim();
    }
}
