import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    MAX_FILE_LINES,
    MAX_FUNCTION_LINES,
    codeMetricIssues,
} from '../check-code-metrics.js';

await testAcceptsCompactFunction();
await testRejectsOversizedFile();
await testRejectsOversizedFunction();
console.log('ok - code metrics expose file and function limit violations');

async function testAcceptsCompactFunction() {
    await withTempRoot(async root => {
        await writeFile(join(root, 'compact.js'), 'export function ok() {\n    return true;\n}\n');
        assert.deepEqual(codeMetricIssues(root, ['compact.js']), []);
    });
}

async function testRejectsOversizedFile() {
    await withTempRoot(async root => {
        const source = Array.from({ length: MAX_FILE_LINES + 1 }, () => 'const value = 1;').join('\n');
        await writeFile(join(root, 'large.js'), `${source}\n`);
        assert.deepEqual(codeMetricIssues(root, ['large.js']), [{
            actual: MAX_FILE_LINES + 1,
            file: 'large.js',
            kind: 'file-lines',
            limit: MAX_FILE_LINES,
        }]);
    });
}

async function testRejectsOversizedFunction() {
    await withTempRoot(async root => {
        await writeFile(join(root, 'large-function.js'), oversizedFunctionSource());
        assert.deepEqual(codeMetricIssues(root, ['large-function.js']), [{
            actual: MAX_FUNCTION_LINES + 1,
            file: 'large-function.js',
            kind: 'function-lines',
            limit: MAX_FUNCTION_LINES,
            line: 1,
            name: 'tooLarge',
        }]);
    });
}

function oversizedFunctionSource() {
    const body = Array.from({ length: MAX_FUNCTION_LINES - 3 }, () => '    total += 1;');
    return [
        'export function tooLarge() {',
        '    let total = 0;',
        ...body,
        '    return total;',
        '}',
        '',
    ].join('\n');
}

async function withTempRoot(callback) {
    const root = await mkdtemp(join(tmpdir(), 'code-metrics-'));
    try {
        await callback(root);
    } finally {
        await rm(root, { force: true, recursive: true });
    }
}
