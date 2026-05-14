export function planSummary(plan) {
    return {
        id: plan.id,
        kind: plan.kind,
        ok: Boolean(plan.committedAt),
        namespace: plan.namespace,
        uploads: plan.uploads,
        downloads: plan.downloads,
        remoteDeletes: plan.remoteDeletes,
        localDeletes: plan.localDeletes,
        conflicts: plan.conflicts,
        committedAt: plan.committedAt,
        progress: progressSummary(plan),
        summary: {
            conflictFiles: plan.conflicts.length,
            deleteFiles: plan.kind === 'push' ? plan.remoteDeletes.length : plan.localDeletes.length,
            downloadBytes: sumBytes(plan.downloads),
            downloadFiles: plan.downloads.length,
            uploadBytes: sumBytes(plan.uploads.filter(entry => !entry.conflict)),
            uploadFiles: plan.uploads.filter(entry => !entry.conflict).length,
        },
    };
}

export function progressSummary(plan) {
    const totalFiles = plan.uploads.length + plan.downloads.length;
    const totalBytes = sumBytes([...plan.uploads, ...plan.downloads]);
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
    return entries.reduce((total, entry) => total + Number(entry.sizeBytes || 0), 0);
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
