const PLAN_SIZE_BYTES_ERROR = 'Invalid plan sizeBytes';

export function planSummary(plan) {
    const fields = planFields(plan);
    const kind = planKind(plan);
    return {
        id: plan.id,
        kind,
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
            deleteFiles: kind === 'push' ? fields.remoteDeletes.length : fields.localDeletes.length,
            downloadBytes: sumBytes(fields.downloads),
            downloadFiles: fields.downloads.length,
            uploadBytes: sumBytes(fields.uploads.filter(entry => !entry.conflict)),
            uploadFiles: fields.uploads.filter(entry => !entry.conflict).length,
        },
    };
}

export function progressSummary(plan) {
    const fields = planFields(plan);
    const kind = planKind(plan);
    const totalFiles = fields.uploads.length + fields.downloads.length;
    const totalBytes = sumBytes([...fields.uploads, ...fields.downloads]);
    const staged = currentStagedEntries(fields);
    const committed = Boolean(plan.committedAt);
    const filesTransferred = committed ? totalFiles : staged.length;
    return {
        bytesTransferred: committed ? totalBytes : sumBytes(staged),
        committed,
        currentPath: currentProgressPath(fields),
        filesTransferred,
        partial_upload_safe: kind === 'push' && !committed,
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
        conflicts: planConflictArray(plan.conflicts),
        downloads: planEntryArray(plan.downloads, 'downloads'),
        localDeletes: planPathArray(plan.localDeletes, 'localDeletes'),
        remoteDeletes: planPathArray(plan.remoteDeletes, 'remoteDeletes'),
        staged: planStaged(plan.staged),
        uploads: planEntryArray(plan.uploads, 'uploads'),
    };
}

function planKind(plan) {
    if (plan.kind !== 'push' && plan.kind !== 'pull') {
        throw new Error('Invalid plan kind');
    }
    return plan.kind;
}

function planArray(value, label) {
    if (!Array.isArray(value)) {
        throw new Error(`Invalid plan ${label}`);
    }
    return value;
}

function planStaged(value) {
    if (value === undefined || value === null) {
        return {};
    }
    if (Array.isArray(value) || typeof value !== 'object') {
        throw new Error('Invalid plan staged');
    }
    return value;
}

function planEntryArray(value, label) {
    return planArray(value, label).map(entry => {
        assertPlanPath(entry?.path, label);
        return entry;
    });
}

function planPathArray(value, label) {
    return planArray(value, label).map(path => {
        assertPlanPath(path, label);
        return path;
    });
}

function planConflictArray(value) {
    return planArray(value, 'conflicts').map(conflict => {
        assertPlanPath(conflict?.path, 'conflicts');
        assertConflictEntry(conflict?.local);
        assertConflictEntry(conflict?.remote);
        return conflict;
    });
}

function assertConflictEntry(value) {
    if (value === undefined || value === null) {
        return;
    }
    if (Array.isArray(value) || typeof value !== 'object') {
        throw new Error('Invalid plan conflicts entry');
    }
}

function assertPlanPath(value, label) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new Error(`Invalid plan ${label} path`);
    }
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

function currentProgressPath(fields) {
    const staged = new Set(Object.keys(fields.staged));
    const pending = [...fields.uploads, ...fields.downloads].find(entry => !staged.has(entry.path));
    return pending?.path || '';
}

function currentStagedEntries(fields) {
    const transferPaths = new Set([...fields.uploads, ...fields.downloads].map(entry => entry.path));
    return Object.entries(fields.staged)
        .filter(([path]) => transferPaths.has(path))
        .map(([, entry]) => entry);
}

function progressPhase(plan, staged) {
    if (plan.committedAt) {
        return 'committed';
    }
    return staged.length > 0 ? 'transferring' : 'planned';
}
