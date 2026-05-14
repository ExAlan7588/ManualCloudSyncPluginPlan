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
    if (buffer.length !== Number(entry.sizeBytes)) {
        throw forbidden(`Uploaded size does not match manifest for ${entry.path}`);
    }
    if (entry.sha256 && sha256(buffer) !== entry.sha256) {
        throw forbidden(`Uploaded sha256 does not match manifest for ${entry.path}`);
    }
}

export function uploadEntry(plan, syncPath) {
    const entry = plan.uploads.find(item => item.path === syncPath);
    if (!entry) {
        throw notFound(`Path is not part of this plan: ${syncPath}`);
    }
    return entry;
}
