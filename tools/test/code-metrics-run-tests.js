import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    MAX_FILE_LINES,
    MAX_FUNCTION_LINES,
    MAX_NESTING_DEPTH,
    MAX_POSITIONAL_PARAMETERS,
    MAX_CYCLOMATIC_COMPLEXITY,
    codeMetricIssues,
} from '../check-code-metrics.js';

await testAcceptsCompactFunction();
await testRejectsOversizedFile();
await testRejectsOversizedFunction();
await testRejectsTooManyPositionalParameters();
await testAllowsOptionsObjectParameter();
await testRejectsExcessiveNesting();
await testRejectsExcessiveComplexity();
await testIgnoresObjectLiteralNesting();
await testIgnoresNullishCoalescingComplexity();
console.log('ok - code metrics expose file, function, parameter, nesting, and complexity violations');

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

async function testRejectsTooManyPositionalParameters() {
    await withTempRoot(async root => {
        await writeFile(join(root, 'many-parameters.js'), 'export function tooMany(one, two, three, four) {\n    return one + two + three + four;\n}\n');
        assert.deepEqual(codeMetricIssues(root, ['many-parameters.js']), [{
            actual: MAX_POSITIONAL_PARAMETERS + 1,
            file: 'many-parameters.js',
            kind: 'function-parameters',
            limit: MAX_POSITIONAL_PARAMETERS,
            line: 1,
            name: 'tooMany',
        }]);
    });
}

async function testAllowsOptionsObjectParameter() {
    await withTempRoot(async root => {
        await writeFile(join(root, 'options.js'), 'export function ok({ one, two, three, four }) {\n    return one + two + three + four;\n}\n');
        assert.deepEqual(codeMetricIssues(root, ['options.js']), []);
    });
}

async function testRejectsExcessiveNesting() {
    await withTempRoot(async root => {
        await writeFile(join(root, 'nested.js'), excessiveNestingSource());
        assert.deepEqual(codeMetricIssues(root, ['nested.js']), [{
            actual: MAX_NESTING_DEPTH + 1,
            file: 'nested.js',
            kind: 'function-nesting',
            limit: MAX_NESTING_DEPTH,
            line: 1,
            name: 'tooNested',
        }]);
    });
}

async function testRejectsExcessiveComplexity() {
    await withTempRoot(async root => {
        await writeFile(join(root, 'complex.js'), excessiveComplexitySource());
        assert.deepEqual(codeMetricIssues(root, ['complex.js']), [{
            actual: MAX_CYCLOMATIC_COMPLEXITY + 1,
            file: 'complex.js',
            kind: 'function-complexity',
            limit: MAX_CYCLOMATIC_COMPLEXITY,
            line: 1,
            name: 'tooComplex',
        }]);
    });
}

async function testIgnoresObjectLiteralNesting() {
    await withTempRoot(async root => {
        await writeFile(join(root, 'literal.js'), objectLiteralSource());
        assert.deepEqual(codeMetricIssues(root, ['literal.js']), []);
    });
}

async function testIgnoresNullishCoalescingComplexity() {
    await withTempRoot(async root => {
        await writeFile(join(root, 'nullish.js'), nullishCoalescingSource());
        assert.deepEqual(codeMetricIssues(root, ['nullish.js']), []);
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

function excessiveNestingSource() {
    return [
        'export function tooNested(value) {',
        '    if (value) {',
        '        for (const item of value) {',
        '            while (item.active) {',
        '                if (item.ready) {',
        '                    return true;',
        '                }',
        '            }',
        '        }',
        '    }',
        '    return false;',
        '}',
        '',
    ].join('\n');
}

function excessiveComplexitySource() {
    return [
        'export function tooComplex(value) {',
        ...Array.from({ length: MAX_CYCLOMATIC_COMPLEXITY }, (_, index) => `    if (value === ${index}) { return ${index}; }`),
        '    return null;',
        '}',
        '',
    ].join('\n');
}

function objectLiteralSource() {
    return [
        'export function literal() {',
        '    return {',
        '        one: {',
        '            two: {',
        '                three: {',
        '                    four: true,',
        '                },',
        '            },',
        '        },',
        '    };',
        '}',
        '',
    ].join('\n');
}

function nullishCoalescingSource() {
    return [
        'export function nullish(value) {',
        '    return value ?? true;',
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
