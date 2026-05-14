import { badRequest } from './http-error.js';

const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export function decodeBase64Content(value, label) {
    if (typeof value !== 'string') {
        throw badRequest(`${label} must be a base64 string`);
    }
    if (!BASE64_PATTERN.test(value)) {
        throw badRequest(`${label} must be valid base64`);
    }
    return Buffer.from(value, 'base64');
}
