import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readJson, writeFileAtomic } from '../lib/storage-io.js';

await testReadJsonLabelsMalformedStorageFile();
await testWriteFileAtomicCleansTempFileAfterRenameFailure();
console.log('ok - storage IO errors include context and clean temp files');

async function testReadJsonLabelsMalformedStorageFile() {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'tt-sync-storage-io-test-'));
    const filePath = path.join(rootDir, 'state.json');
    try {
        await writeFile(filePath, '{ broken');
        await assert.rejects(
            readJson(filePath),
            error => error.message.includes(`Storage JSON is invalid: ${filePath}:`)
                && error.message.includes('Expected property name'),
        );
    } finally {
        await rm(rootDir, { force: true, recursive: true });
    }
}

async function testWriteFileAtomicCleansTempFileAfterRenameFailure() {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'tt-sync-storage-io-test-'));
    try {
        await assert.rejects(
            writeFileAtomic(rootDir, 'content'),
            error => ['EISDIR', 'ENOTDIR', 'EINVAL'].includes(error.code),
        );
        const names = await readdir(path.dirname(rootDir));
        assert.equal(names.some(name => name.startsWith(path.basename(rootDir)) && name.endsWith('.tmp')), false);
    } finally {
        await rm(rootDir, { force: true, recursive: true });
    }
}
