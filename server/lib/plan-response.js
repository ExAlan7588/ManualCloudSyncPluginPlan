const PLAN_SIZE_BYTES_ERROR = 'Invalid plan sizeBytes';

export function planSummary(plan) {
    const fields = planFields(plan);
    return {
        id: plan.id,
        kind: plan.kind,
        ok: Boolean(plan.committedAt),
        namespace: plan.namespace,
        uploads: fields.uploads,
        downloads: fields.downloads,
        remoteDeletes: fields.remoteDeletes,
        localDeletes: fields.localDeletes,
        conflicts: fields.conflicts,
        committedAt: plan.committedAt,
        progress: progressSummary({ ...plan, ...fields }),
        summary: {
            conflictFiles: fields.conflicts.length,
            deleteFiles: plan.kind === 'push' ? fields.remoteDeletes.length : fields.localDeletes.length,
            downloadBytes: sumBytes(fields.downloads),
            downloadFiles: fields.downloads.length,
            uploadBytes: sumBytes(fields.uploads.filter(entry => !entry.conflict)),
            uploadFiles: fields.uploads.filter(entry => !entry.conflict).length,
        },
    };
}

export function progressSummary(plan) {
    const fields = planFields(plan);
    const totalFiles = fields.uploads.length + fields.downloads.length;
    const totalBytes = sumBytes([...fields.uploads, ...fields.downloads]);
    const staged = Object.values(plan.staged || {});
    const committed = Boolean(plan.committedAt);
    const filesTransferred = committed ? totalFiles : staged.length;
    return {
        bytesTransferred: committed ? totalBytes : sumBytes(staged),
        committed,
        currentPath: currentProgressPath(plan),
        filesTransferred,
        partial_upload_safe: plan.kind === 'push' && !committed,
        pending_files: Math.max(totalFiles - filesTransferred, 0),
        phase: progressPhase(plan, staged),
        staged_files: staged.length,
        totalBytes,
        totalFiles,
    };
}

function sumBytes(entries) {
    return entries.reduce((total, entry) => total + sizeBytes(entry), 0);
}

function planFields(plan) {
    return {
        conflicts: planArray(plan.conflicts, 'conflicts'),
        downloads: planArray(plan.downloads, 'downloads'),
        localDeletes: planArray(plan.localDeletes, 'localDeletes'),
        remoteDeletes: planArray(plan.remoteDeletes, 'remoteDeletes'),
        uploads: planArray(plan.uploads, 'uploads'),
    };
}

function planArray(value, label) {
    if (!Array.isArray(value)) {
        throw new Error(`Invalid plan ${label}`);
    }
    return value;
}

function sizeBytes(entry) {
    const value = entry?.sizeBytes;
    if (!hasValidSizeBytes(value)) {
        throw new Error(PLAN_SIZE_BYTES_ERROR);
    }
    return Number(value);
}

function hasValidSizeBytes(value) {
    if (typeof value === 'number') {
        return Number.isSafeInteger(value) && value >= 0;
    }
    if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) {
        return false;
    }
    return Number.isSafeInteger(Number(value));
}

function currentProgressPath(plan) {
    const staged = new Set(Object.keys(plan.staged || {}));
    const pending = [...plan.uploads, ...plan.downloads].find(entry => !staged.has(entry.path));
    return pending?.path || '';
}

function progressPhase(plan, staged) {
    if (plan.committedAt) {
        return 'committed';
    }
    return staged.length > 0 ? 'transferring' : 'planned';
}
