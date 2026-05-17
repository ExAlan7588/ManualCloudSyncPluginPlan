import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { forbidden, notFound } from './http-error.js';
import { sha256 } from './manifest.js';

export async function readJson(filePath, fallback) {
    try {
        return JSON.parse(await readFile(filePath, 'utf8'));
    } catch (error) {
        if (error.code === 'ENOENT' && fallback !== undefined) {
            return fallback;
        }
        if (error instanceof SyntaxError) {
            throw new Error(`Storage JSON is invalid: ${filePath}: ${error.message}`);
        }
        throw error;
    }
}

export async function writeJsonAtomic(filePath, value) {
    await writeFileAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export async function writeFileAtomic(filePath, value) {
    await mkdir(path.dirname(filePath), { recursive: true });
    const tmpPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
        await writeFile(tmpPath, value);
        await rename(tmpPath, filePath);
    } catch (error) {
        await rm(tmpPath, { force: true });
        throw error;
    }
}

export function validateStagedBuffer(entry, buffer) {
    if (buffer.length !== expectedSizeBytes(entry)) {
        throw forbidden(`Uploaded size does not match manifest for ${entry.path}`);
    }
    if (entry.sha256 && sha256(buffer) !== entry.sha256) {
        throw forbidden(`Uploaded sha256 does not match manifest for ${entry.path}`);
    }
}

function expectedSizeBytes(entry) {
    const value = entry?.sizeBytes;
    if (!isSizeBytes(value)) {
        throw forbidden(`Uploaded size does not match manifest for ${entry?.path}`);
    }
    return Number(value);
}

function isSizeBytes(value) {
    if (typeof value === 'number') {
        return Number.isSafeInteger(value) && value >= 0;
    }
    if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) {
        return false;
    }
    return Number.isSafeInteger(Number(value));
}

export function uploadEntry(plan, syncPath) {
    const uploads = planUploadEntries(plan);
    const entry = uploads.find(item => item.path === syncPath);
    if (!entry) {
        throw notFound(`Path is not part of this plan: ${syncPath}`);
    }
    return entry;
}

function planUploads(plan) {
    if (!Array.isArray(plan.uploads)) {
        throw new Error('Invalid plan uploads');
    }
    return plan.uploads;
}

function planUploadEntries(plan) {
    return planUploads(plan).map(entry => {
        if (typeof entry?.path !== 'string' || entry.path.trim() === '') {
            throw new Error('Invalid plan uploads path');
        }
        return entry;
    });
}
