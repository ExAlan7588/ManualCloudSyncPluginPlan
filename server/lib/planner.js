import { randomUUID } from 'node:crypto';
import { entriesEqual, manifestMap, normalizeManifest } from './manifest.js';

export function buildPushPlan(input) {
    const local = normalizeManifest(input.localManifest);
    const remote = normalizeManifest(input.remoteManifest);
    const base = input.baseManifest ? normalizeManifest(input.baseManifest) : null;
    const localMap = manifestMap(local);
    const remoteMap = manifestMap(remote);
    const baseMap = base ? manifestMap(base) : null;
    const changes = collectPushChanges({ baseMap, localMap, remoteMap });
    return planEnvelope({ ...input, kind: 'push', local, remote, ...changes });
}

export function buildPullPlan(input) {
    const local = normalizeManifest(input.localManifest);
    const remote = normalizeManifest(input.remoteManifest);
    const base = input.baseManifest ? normalizeManifest(input.baseManifest) : null;
    const localMap = manifestMap(local);
    const remoteMap = manifestMap(remote);
    const baseMap = base ? manifestMap(base) : null;
    const changes = collectPullChanges({ baseMap, localMap, remoteMap });
    return planEnvelope({ ...input, kind: 'pull', local, remote, ...changes });
}

function planEnvelope(input) {
    return {
        id: randomUUID(),
        kind: input.kind,
        namespace: input.namespace,
        deviceId: input.deviceId,
        createdAt: new Date().toISOString(),
        committedAt: '',
        localManifest: input.local,
        remoteManifest: input.remote,
        uploads: input.uploads || [],
        downloads: input.downloads || [],
        remoteDeletes: input.remoteDeletes || [],
        localDeletes: input.localDeletes || [],
        conflicts: input.conflicts || [],
        staged: {},
    };
}

function collectPushChanges(options) {
    const uploads = [];
    const remoteDeletes = [];
    const conflicts = [];
    for (const [path, local] of options.localMap.entries()) {
        const remote = options.remoteMap.get(path);
        const base = options.baseMap?.get(path);
        if (!remote || !entriesEqual(local, remote)) {
            collectPushUpload({ base, conflicts, local, remote, uploads });
        }
    }
    for (const [path, remote] of options.remoteMap.entries()) {
        collectPushDelete({ base: options.baseMap?.get(path), conflicts, local: options.localMap.get(path), path, remote, remoteDeletes });
    }
    return { conflicts, remoteDeletes, uploads };
}

function collectPushUpload(options) {
    if (isConflict(options.base, options.local, options.remote)) {
        options.conflicts.push(conflictEntry(options.local.path, options.local, options.remote));
        options.uploads.push({ ...options.local, conflict: true });
        return;
    }
    options.uploads.push(options.local);
}

function collectPushDelete(options) {
    if (options.local) {
        return;
    }
    if (options.base && !entriesEqual(options.base, options.remote)) {
        options.conflicts.push(conflictEntry(options.path, null, options.remote));
        return;
    }
    options.remoteDeletes.push(options.path);
}

function collectPullChanges(options) {
    const downloads = [];
    const localDeletes = [];
    const conflicts = [];
    for (const [path, remote] of options.remoteMap.entries()) {
        const local = options.localMap.get(path);
        const base = options.baseMap?.get(path);
        if (!local || !entriesEqual(local, remote)) {
            collectPullDownload({ base, conflicts, downloads, local, remote });
        }
    }
    for (const [path, local] of options.localMap.entries()) {
        collectPullDelete({ base: options.baseMap?.get(path), conflicts, local, localDeletes, path, remote: options.remoteMap.get(path) });
    }
    return { conflicts, downloads, localDeletes };
}

function collectPullDownload(options) {
    if (isConflict(options.base, options.local, options.remote)) {
        options.conflicts.push(conflictEntry(options.remote.path, options.local, options.remote));
    }
    options.downloads.push(options.remote);
}

function collectPullDelete(options) {
    if (options.remote) {
        return;
    }
    if (options.base && !entriesEqual(options.base, options.local)) {
        options.conflicts.push(conflictEntry(options.path, options.local, null));
        return;
    }
    options.localDeletes.push(options.path);
}

function isConflict(base, local, remote) {
    if (!base || !local || !remote) {
        return false;
    }
    return !entriesEqual(local, base) && !entriesEqual(remote, base) && !entriesEqual(local, remote);
}

function conflictEntry(path, local, remote) {
    return { path, local, remote };
}
