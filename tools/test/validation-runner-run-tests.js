import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertExistingFiles, sortedJsFiles } from '../validation-runner.js';

await testSortedJsFilesRejectsMissingDirectory();
await testSortedJsFilesReturnsSortedJavaScriptFiles();
await testAssertExistingFilesRejectsMissingFiles();
console.log('ok - validation runner exposes missing files and directories');

async function testSortedJsFilesRejectsMissingDirectory() {
    const root = await tempRoot();
    try {
        assert.throws(
            () => sortedJsFiles(root, ['missing']),
            /Validation directory is missing: missing/,
        );
    } finally {
        await rm(root, { force: true, recursive: true });
    }
}

async function testSortedJsFilesReturnsSortedJavaScriptFiles() {
    const root = await tempRoot();
    try {
        await mkdir(join(root, 'tools'));
        await writeFile(join(root, 'tools', 'z.js'), '');
        await writeFile(join(root, 'tools', 'a.js'), '');
        await writeFile(join(root, 'tools', 'ignored.txt'), '');
        assert.deepEqual(sortedJsFiles(root, ['tools']), [
            'tools/a.js',
            'tools/z.js',
        ]);
    } finally {
        await rm(root, { force: true, recursive: true });
    }
}

async function testAssertExistingFilesRejectsMissingFiles() {
    const root = await tempRoot();
    try {
        await writeFile(join(root, 'present.js'), '');
        assert.throws(
            () => assertExistingFiles(root, ['present.js', 'missing.js']),
            /Validation files are missing: missing\.js/,
        );
    } finally {
        await rm(root, { force: true, recursive: true });
    }
}

async function tempRoot() {
    return mkdtemp(join(tmpdir(), 'validation-runner-'));
}
