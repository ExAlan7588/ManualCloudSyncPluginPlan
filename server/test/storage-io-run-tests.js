import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { writeRequestStreamAtomic } from '../lib/stream-io.js';
import { readJson, uploadEntry, validateStagedBuffer, writeFileAtomic } from '../lib/storage-io.js';

await testReadJsonLabelsMalformedStorageFile();
await testWriteFileAtomicCleansTempFileAfterRenameFailure();
await testValidateStagedBufferRejectsMalformedSizeBytes();
await testUploadEntryRejectsMalformedUploads();
await testWriteRequestStreamRejectsMalformedExpectedBytes();
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

async function testValidateStagedBufferRejectsMalformedSizeBytes() {
    assert.throws(
        () => validateStagedBuffer({ path: 'default-user/chats/example.jsonl', sizeBytes: '0x10' }, Buffer.alloc(16)),
        /Uploaded size does not match manifest/,
    );
}

async function testUploadEntryRejectsMalformedUploads() {
    assert.throws(
        () => uploadEntry({ uploads: {} }, 'default-user/chats/example.jsonl'),
        /Invalid plan uploads/,
    );
}

async function testWriteRequestStreamRejectsMalformedExpectedBytes() {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'tt-sync-stream-io-test-'));
    try {
        await assert.rejects(
            writeRequestStreamAtomic({
                expectedBytes: '0x10',
                expectedSha256: '',
                filePath: path.join(rootDir, 'upload.bin'),
                maxBytes: 32,
                stream: Readable.from([Buffer.alloc(16)]),
                syncPath: 'default-user/chats/example.jsonl',
            }),
            /Uploaded size does not match manifest/,
        );
    } finally {
        await rm(rootDir, { force: true, recursive: true });
    }
}
