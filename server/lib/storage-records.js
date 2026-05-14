import { randomUUID } from 'node:crypto';

export function addDevice(record, deviceName) {
    const device = {
        deviceId: randomUUID(),
        deviceName: String(deviceName || '').trim(),
        pairedAt: new Date().toISOString(),
    };
    record.devices.push(device);
    return device;
}

export function upsertDevice(record, input) {
    const existing = record.devices.find(device => device.deviceId === input.deviceId);
    if (existing) {
        Object.assign(existing, {
            deviceName: input.deviceName,
            publicKey: input.publicKey,
            pairedAt: existing.pairedAt || new Date().toISOString(),
        });
        return existing;
    }
    const device = { ...input, pairedAt: new Date().toISOString() };
    record.devices.push(device);
    return device;
}

export function touchDevice(record, deviceId, patch) {
    if (!deviceId) {
        return;
    }
    const existing = record.devices.find(device => device.deviceId === deviceId);
    if (existing) {
        Object.assign(existing, patch);
        return;
    }
    record.devices.push({ deviceId, deviceName: '', pairedAt: new Date().toISOString(), ...patch });
}

export function affectedPaths(plan) {
    return Array.from(new Set([
        ...plan.uploads.map(entry => entry.path),
        ...plan.remoteDeletes,
        ...plan.conflicts.map(item => item.path),
    ]));
}

export function rollbackPointSummary(snapshot) {
    return {
        affectedFiles: snapshot.files.length,
        createdAt: snapshot.createdAt,
        id: snapshot.id,
        planId: snapshot.planId,
    };
}

export function historyEntry(plan) {
    return {
        committedAt: plan.committedAt,
        conflicts: plan.conflicts.length,
        deviceId: plan.deviceId,
        downloads: plan.downloads.length,
        kind: plan.kind,
        planId: plan.id,
        remoteDeletes: plan.remoteDeletes.length,
        uploads: plan.uploads.length,
    };
}

export function cappedList(items, limit) {
    return items.slice(0, limit);
}

export function pairingResponse(record, device, endpoint) {
    return {
        authToken: record.authToken,
        deviceId: device.deviceId,
        endpoint: String(endpoint || ''),
        namespace: record.namespace,
        serverId: record.serverId,
    };
}

export function withoutConflictFlag(entry) {
    const { conflict: _conflict, ...rest } = entry;
    return rest;
}
