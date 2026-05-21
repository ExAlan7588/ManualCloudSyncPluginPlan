import { formatBytes } from './format.js';

export const EMPTY_VALUE = '未回傳';

const DECIMAL_INTEGER_PATTERN = /^\d+$/;

export function hasObjectPayload(value) {
    return isRecordObject(value) && Object.keys(value).length > 0;
}

export function isRecordObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function firstValue(object, keys, fallback) {
    for (const key of keys) {
        if (object?.[key] !== undefined && object?.[key] !== null) {
            return object[key];
        }
    }
    return fallback;
}

export function firstObject(object, keys) {
    for (const key of keys) {
        if (isRecordObject(object?.[key])) {
            return object[key];
        }
    }
    return null;
}

export function scalarText(value) {
    if (!isTextScalar(value)) {
        return '';
    }
    return String(value || '').trim();
}

export function stringValue(value) {
    return scalarText(value) || EMPTY_VALUE;
}

export function nonNegativeIntegerValue(value) {
    if (typeof value === 'number') {
        return Number.isSafeInteger(value) && value >= 0 ? value : null;
    }
    if (typeof value !== 'string' || !DECIMAL_INTEGER_PATTERN.test(value.trim())) {
        return null;
    }
    const number = Number(value);
    return Number.isSafeInteger(number) ? number : null;
}

export function formatOptionalCount(value) {
    const number = nonNegativeIntegerValue(value);
    return Number.isFinite(number) ? String(number) : EMPTY_VALUE;
}

export function formatOptionalBytes(value) {
    const number = nonNegativeIntegerValue(value);
    return Number.isFinite(number) ? formatBytes(number) : EMPTY_VALUE;
}

export function isTextScalar(value) {
    if (typeof value === 'number') {
        return Number.isFinite(value);
    }
    return typeof value === 'bigint' || typeof value === 'string';
}
