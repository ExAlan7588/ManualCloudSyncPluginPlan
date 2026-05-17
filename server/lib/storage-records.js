import { randomUUID } from 'node:crypto';
import { safeName } from './encoding.js';

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const DEVICE_PUBLIC_KEY_BYTES = 32;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function addDevice(record, deviceName) {
    const devices = namespaceDevices(record);
    const device = {
        deviceId: randomUUID(),
        deviceName: deviceNameField(deviceName),
        pairedAt: new Date().toISOString(),
    };
    devices.push(device);
    return device;
}

export function upsertDevice(record, input) {
    const devices = namespaceDevices(record);
    const deviceId = deviceIdField(input.deviceId);
    const publicKey = devicePublicKey(input.publicKey);
    const deviceName = deviceNameField(input.deviceName);
    const existing = devices.find(device => device.deviceId === deviceId);
    if (existing) {
        Object.assign(existing, {
            deviceName,
            publicKey,
            pairedAt: existing.pairedAt || new Date().toISOString(),
        });
        return existing;
    }
    const device = { ...input, deviceId, deviceName, publicKey, pairedAt: new Date().toISOString() };
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
    const fields = planArrayFields(plan);
    return Array.from(new Set([
        ...fields.uploads.map(entry => entry.path),
        ...fields.remoteDeletes,
        ...fields.conflicts.map(item => item.path),
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
        authToken: pairingToken(record.authToken, 'authToken'),
        deviceId: deviceIdField(device.deviceId),
        endpoint: pairingEndpoint(endpoint),
        namespace: safeName(record.namespace, 'namespace'),
        serverId: pairingServerId(record.serverId),
    };
}

export function withoutConflictFlag(entry) {
    const { conflict: _conflict, ...rest } = entry;
    return rest;
}

function planArrayFields(plan) {
    return {
        conflicts: planEntryArray(plan.conflicts, 'plan conflicts'),
        downloads: planEntryArray(plan.downloads, 'plan downloads'),
        remoteDeletes: planPathArray(plan.remoteDeletes, 'plan remoteDeletes'),
        uploads: planEntryArray(plan.uploads, 'plan uploads'),
    };
}

function namespaceDevices(record) {
    return arrayField(record.devices, 'namespace devices');
}

function deviceNameField(value) {
    if (value === undefined || value === null || value === '') {
        return '';
    }
    if (typeof value !== 'string') {
        throw new Error('Invalid device name');
    }
    return value.trim();
}

function deviceIdField(value) {
    if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
        throw new Error('Invalid device id');
    }
    return value.toLowerCase();
}

function devicePublicKey(value) {
    if (typeof value !== 'string' || !BASE64URL_PATTERN.test(value)) {
        throw new Error('Invalid device publicKey');
    }
    if (Buffer.from(value, 'base64url').length !== DEVICE_PUBLIC_KEY_BYTES) {
        throw new Error('Invalid device publicKey');
    }
    return value;
}

function pairingToken(value, label) {
    if (typeof value !== 'string' || !value.trim() || !BASE64URL_PATTERN.test(value)) {
        throw new Error(`Invalid pairing ${label}`);
    }
    return value;
}

function pairingServerId(value) {
    if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
        throw new Error('Invalid pairing serverId');
    }
    return value.toLowerCase();
}

function pairingEndpoint(value) {
    const text = String(value || '').trim();
    if (!text) {
        return '';
    }
    try {
        const url = new URL(text);
        if (url.protocol !== 'https:' && url.protocol !== 'http:') {
            throw new Error('Invalid pairing endpoint');
        }
        if (url.username || url.password || url.hash) {
            throw new Error('Invalid pairing endpoint');
        }
        return url.toString().replace(/\/$/, '');
    } catch {
        throw new Error('Invalid pairing endpoint');
    }
}

function arrayField(value, label) {
    if (!Array.isArray(value)) {
        throw new Error(`Invalid ${label}`);
    }
    return value;
}

function planEntryArray(value, label) {
    return arrayField(value, label).map(entry => {
        assertPlanPath(entry?.path, label);
        return entry;
    });
}

function planPathArray(value, label) {
    return arrayField(value, label).map(path => {
        assertPlanPath(path, label);
        return path;
    });
}

function assertPlanPath(value, label) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new Error(`Invalid ${label} path`);
    }
}
