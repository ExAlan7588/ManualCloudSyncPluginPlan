import { randomUUID } from 'node:crypto';

export function addDevice(record, deviceName) {
    const devices = namespaceDevices(record);
    const device = {
        deviceId: randomUUID(),
        deviceName: String(deviceName || '').trim(),
        pairedAt: new Date().toISOString(),
    };
    devices.push(device);
    return device;
}

export function upsertDevice(record, input) {
    const devices = namespaceDevices(record);
    const existing = devices.find(device => device.deviceId === input.deviceId);
    if (existing) {
        Object.assign(existing, {
            deviceName: input.deviceName,
            publicKey: input.publicKey,
            pairedAt: existing.pairedAt || new Date().toISOString(),
        });
        return existing;
    }
    const device = { ...input, pairedAt: new Date().toISOString() };
    devices.push(device);
    return device;
}

export function touchDevice(record, deviceId, patch) {
    if (!deviceId) {
        return;
    }
    const devices = namespaceDevices(record);
    const existing = devices.find(device => device.deviceId === deviceId);
    if (existing) {
        Object.assign(existing, patch);
        return;
    }
    devices.push({ deviceId, deviceName: '', pairedAt: new Date().toISOString(), ...patch });
}

export function affectedPaths(plan) {
    const uploads = arrayField(plan.uploads, 'plan uploads');
    const remoteDeletes = arrayField(plan.remoteDeletes, 'plan remoteDeletes');
    const conflicts = arrayField(plan.conflicts, 'plan conflicts');
    return Array.from(new Set([
        ...uploads.map(entry => entry.path),
        ...remoteDeletes,
        ...conflicts.map(item => item.path),
    ]));
}

export function rollbackPointSummary(snapshot) {
    const files = arrayField(snapshot.files, 'rollback files');
    return {
        affectedFiles: files.length,
        createdAt: snapshot.createdAt,
        id: snapshot.id,
        planId: snapshot.planId,
    };
}

export function historyEntry(plan) {
    const fields = planArrayFields(plan);
    return {
        committedAt: plan.committedAt,
        conflicts: fields.conflicts.length,
        deviceId: plan.deviceId,
        downloads: fields.downloads.length,
        kind: plan.kind,
        planId: plan.id,
        remoteDeletes: fields.remoteDeletes.length,
        uploads: fields.uploads.length,
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

function planArrayFields(plan) {
    return {
        conflicts: arrayField(plan.conflicts, 'plan conflicts'),
        downloads: arrayField(plan.downloads, 'plan downloads'),
        remoteDeletes: arrayField(plan.remoteDeletes, 'plan remoteDeletes'),
        uploads: arrayField(plan.uploads, 'plan uploads'),
    };
}

function namespaceDevices(record) {
    return arrayField(record.devices, 'namespace devices');
}

function arrayField(value, label) {
    if (!Array.isArray(value)) {
        throw new Error(`Invalid ${label}`);
    }
    return value;
}
