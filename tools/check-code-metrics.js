#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isCliEntry } from './cli-helpers.js';
import { projectRoot, sortedJsFiles } from './validation-runner.js';

export const MAX_FILE_LINES = 600;
export const MAX_FUNCTION_LINES = 50;

const ROOT_FILES = Object.freeze(['index.js']);
const CHECK_DIRECTORIES = Object.freeze([
    'modules',
    'server/lib',
    'server',
    'server/test',
    'tools',
    'tools/test',
]);
const CONTROL_KEYWORDS = new Set(['catch', 'for', 'function', 'if', 'switch', 'while']);

export function metricTargetFiles(root) {
    return [...ROOT_FILES, ...sortedJsFiles(root, CHECK_DIRECTORIES)];
}

export function codeMetricIssues(root, files = metricTargetFiles(root)) {
    return files.flatMap(file => fileMetricIssues(root, file));
}

export function assertCodeMetrics(root, files = metricTargetFiles(root)) {
    const issues = codeMetricIssues(root, files);
    if (issues.length > 0) {
        throw new Error(`Code metric limits exceeded:\n${formatCodeMetricIssues(issues)}`);
    }
}

export function formatCodeMetricIssues(issues) {
    return issues.map(formatCodeMetricIssue).join('\n');
}

function fileMetricIssues(root, file) {
    const source = readFileSync(join(root, file), 'utf8');
    const lines = sourceLines(source);
    return [
        ...fileSizeIssues(file, lines),
        ...functionSizeIssues(file, lines),
    ];
}

function fileSizeIssues(file, lines) {
    if (lines.length <= MAX_FILE_LINES) {
        return [];
    }
    return [{ actual: lines.length, file, kind: 'file-lines', limit: MAX_FILE_LINES }];
}

function functionSizeIssues(file, lines) {
    const spans = functionSpans(lines);
    return spans
        .filter(span => span.nonblankLines > MAX_FUNCTION_LINES)
        .map(span => ({
            actual: span.nonblankLines,
            file,
            kind: 'function-lines',
            limit: MAX_FUNCTION_LINES,
            line: span.startLine,
            name: span.name,
        }));
}

function functionSpans(lines) {
    const spans = [];
    for (let index = 0; index < lines.length; index += 1) {
        const name = functionStartName(lines[index]);
        if (name) {
            spans.push(functionSpan(lines, index, name));
        }
    }
    return spans.filter(Boolean);
}

function functionSpan(lines, startIndex, name) {
    let depth = 0;
    let opened = false;
    let nonblankLines = 0;
    for (let index = startIndex; index < lines.length; index += 1) {
        nonblankLines += lines[index].trim() ? 1 : 0;
        const delta = braceDelta(lines[index]);
        opened ||= delta > 0;
        depth += delta;
        if (opened && depth <= 0) {
            return { name, nonblankLines, startLine: startIndex + 1 };
        }
    }
    return null;
}

function functionStartName(line) {
    const scrubbed = scrubLine(line);
    if (!scrubbed.includes('{')) {
        return null;
    }
    return namedFunction(scrubbed)
        || assignedFunction(scrubbed)
        || methodFunction(scrubbed)
        || arrowCallback(scrubbed);
}

function namedFunction(line) {
    const match = line.match(/\b(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)?\s*\([^)]*\)\s*\{/);
    return match ? match[1] || '<anonymous function>' : null;
}

function assignedFunction(line) {
    const pattern = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\s*\*?\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>?\s*\{/;
    return line.match(pattern)?.[1] || null;
}

function methodFunction(line) {
    const match = line.match(/^\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/);
    if (!match || CONTROL_KEYWORDS.has(match[1])) {
        return null;
    }
    return match[1];
}

function arrowCallback(line) {
    return /=>\s*\{/.test(line) ? '<arrow callback>' : null;
}

function braceDelta(line) {
    let delta = 0;
    for (const character of scrubLine(line)) {
        delta += character === '{' ? 1 : 0;
        delta -= character === '}' ? 1 : 0;
    }
    return delta;
}

function scrubLine(line) {
    return stripLineComment(stripQuotedText(line));
}

function stripLineComment(line) {
    return line.replace(/\/\/.*$/, '');
}

function stripQuotedText(line) {
    let quoted = null;
    let escaped = false;
    return Array.from(line, character => {
        if (escaped) {
            escaped = false;
            return ' ';
        }
        if (quoted) {
            if (character === '\\') {
                escaped = true;
            } else if (character === quoted) {
                quoted = null;
            }
            return ' ';
        }
        if (character === '\'' || character === '"' || character === '`') {
            quoted = character;
            return ' ';
        }
        return character;
    }).join('');
}

function sourceLines(source) {
    if (source === '') {
        return [];
    }
    return source.endsWith('\n') ? source.slice(0, -1).split('\n') : source.split('\n');
}

function formatCodeMetricIssue(issue) {
    if (issue.kind === 'file-lines') {
        return `${issue.file}: file has ${issue.actual} lines; limit is ${issue.limit}`;
    }
    return `${issue.file}:${issue.line} ${issue.name} has ${issue.actual} nonblank lines; limit is ${issue.limit}`;
}

if (isCliEntry(import.meta.url)) {
    assertCodeMetrics(projectRoot());
}
