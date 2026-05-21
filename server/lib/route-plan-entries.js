import { badRequest, notFound } from './http-error.js';

export function findPlanEntry(entries, syncPath, label) {
    const entry = planEntries(entries, label).find(item => item.path === syncPath);
    if (!entry) {
        throw notFound(`Path is not part of this plan: ${syncPath}`);
    }
    return entry;
}

export function planEntries(entries, label) {
    if (!Array.isArray(entries)) {
        throw new Error(`Invalid plan ${label}`);
    }
    return entries.map(entry => {
        assertPlanEntryPath(entry?.path, label);
        assertPlanEntryModifiedMs(entry?.modifiedMs, label);
        assertPlanEntrySizeBytes(entry?.sizeBytes, label);
        return entry;
    });
}

export function bundleFilePath(file) {
    if (typeof file?.path !== 'string') {
        throw badRequest('Bundle file path must be a string');
    }
    return file.path;
}

function assertPlanEntryPath(value, label) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new Error(`Invalid plan ${label} path`);
    }
}

function assertPlanEntryModifiedMs(value, label) {
    if (!isNonNegativeIntegerInput(value)) {
        throw new Error(`Invalid plan ${label} modifiedMs`);
    }
}

function assertPlanEntrySizeBytes(value, label) {
    if (!isNonNegativeIntegerInput(value)) {
        throw new Error(`Invalid plan ${label} sizeBytes`);
    }
}

function isNonNegativeIntegerInput(value) {
    if (typeof value === 'number') {
        return Number.isSafeInteger(value) && value >= 0;
    }
    if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) {
        return false;
    }
    return Number.isSafeInteger(Number(value));
}
