#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isCliEntry } from './cli-helpers.js';
import { projectRoot, sortedJsFiles } from './validation-runner.js';

export const MAX_FILE_LINES = 600;
export const MAX_FUNCTION_LINES = 50;
export const MAX_POSITIONAL_PARAMETERS = 3;

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
    const spans = functionSpans(lines);
    return [
        ...fileSizeIssues(file, lines),
        ...functionSizeIssues(file, spans),
        ...parameterCountIssues(file, spans),
    ];
}

function fileSizeIssues(file, lines) {
    if (lines.length <= MAX_FILE_LINES) {
        return [];
    }
    return [{ actual: lines.length, file, kind: 'file-lines', limit: MAX_FILE_LINES }];
}

function functionSizeIssues(file, spans) {
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

function parameterCountIssues(file, spans) {
    return spans
        .filter(span => span.parameterCount > MAX_POSITIONAL_PARAMETERS)
        .map(span => ({
            actual: span.parameterCount,
            file,
            kind: 'function-parameters',
            limit: MAX_POSITIONAL_PARAMETERS,
            line: span.startLine,
            name: span.name,
        }));
}

function functionSpans(lines) {
    const spans = [];
    for (let index = 0; index < lines.length; index += 1) {
        const start = functionStart(lines[index]);
        if (start) {
            spans.push(functionSpan(lines, index, start));
        }
    }
    return spans.filter(Boolean);
}

function functionSpan(lines, startIndex, start) {
    let depth = 0;
    let opened = false;
    let nonblankLines = 0;
    for (let index = startIndex; index < lines.length; index += 1) {
        nonblankLines += lines[index].trim() ? 1 : 0;
        const delta = braceDelta(lines[index]);
        opened ||= delta > 0;
        depth += delta;
        if (opened && depth <= 0) {
            return { ...start, nonblankLines, startLine: startIndex + 1 };
        }
    }
    return null;
}

function functionStart(line) {
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
    const match = line.match(/\b(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)?\s*/);
    if (!match) {
        return null;
    }
    return functionStartFromParameters({
        line,
        name: match[1] || '<anonymous function>',
        startIndex: match.index + match[0].length,
    });
}

function assignedFunction(line) {
    const match = line.match(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?/);
    if (!match) {
        return null;
    }
    const startIndex = match.index + match[0].length;
    return arrowStart(line, match[1], startIndex) || assignedNamedFunctionStart(line, match[1], startIndex);
}

function methodFunction(line) {
    const match = line.match(/^\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*/);
    if (!match || CONTROL_KEYWORDS.has(match[1])) {
        return null;
    }
    return functionStartFromParameters({
        line,
        name: match[1],
        startIndex: match[0].length,
    });
}

function arrowCallback(line) {
    const arrowIndex = line.indexOf('=>');
    if (arrowIndex < 0 || !line.slice(arrowIndex).includes('{')) {
        return null;
    }
    const prefix = line.slice(0, arrowIndex).trimEnd();
    const openIndex = prefix.lastIndexOf('(');
    if (openIndex >= 0) {
        return functionStartFromParameters({ line, name: '<arrow callback>', startIndex: openIndex });
    }
    const parameter = prefix.match(/[A-Za-z_$][\w$]*$/);
    return parameter ? functionStartForCount('<arrow callback>', 1) : null;
}

function assignedNamedFunctionStart(line, name, startIndex) {
    const match = line.slice(startIndex).match(/function\s*\*?\s*(?:[A-Za-z_$][\w$]*)?\s*/);
    if (!match || match.index !== 0) {
        return null;
    }
    return functionStartFromParameters({ line, name, startIndex: startIndex + match[0].length });
}

function arrowStart(line, name, startIndex) {
    const cursor = skipWhitespace(line, startIndex);
    if (line[cursor] === '(') {
        return functionStartFromParameters({ line, name, startIndex: cursor });
    }
    const parameter = line.slice(cursor).match(/^[A-Za-z_$][\w$]*/);
    if (!parameter || !line.slice(cursor + parameter[0].length).trimStart().startsWith('=>')) {
        return null;
    }
    return functionStartForCount(name, 1);
}

function functionStartFromParameters(options) {
    const parameters = parameterTextFrom(options.line, options.startIndex);
    if (!parameters) {
        return null;
    }
    return functionStartForCount(options.name, parameterCount(parameters.text));
}

function functionStartForCount(name, parameterCount) {
    return { name, parameterCount };
}

function parameterTextFrom(line, startIndex) {
    const openIndex = line.indexOf('(', startIndex);
    if (openIndex < 0) {
        return null;
    }
    let depth = 0;
    for (let index = openIndex; index < line.length; index += 1) {
        depth += line[index] === '(' ? 1 : 0;
        depth -= line[index] === ')' ? 1 : 0;
        if (depth === 0) {
            return { endIndex: index, text: line.slice(openIndex + 1, index) };
        }
    }
    return null;
}

function parameterCount(text) {
    if (!text.trim()) {
        return 0;
    }
    let count = 1;
    const depth = { brace: 0, bracket: 0, paren: 0 };
    for (const character of text) {
        updateParameterDepth(depth, character);
        if (character === ',' && depth.brace === 0 && depth.bracket === 0 && depth.paren === 0) {
            count += 1;
        }
    }
    return count;
}

function updateParameterDepth(depth, character) {
    depth.brace += character === '{' ? 1 : 0;
    depth.brace -= character === '}' ? 1 : 0;
    depth.bracket += character === '[' ? 1 : 0;
    depth.bracket -= character === ']' ? 1 : 0;
    depth.paren += character === '(' ? 1 : 0;
    depth.paren -= character === ')' ? 1 : 0;
}

function skipWhitespace(line, startIndex) {
    let index = startIndex;
    while (line[index] === ' ' || line[index] === '\t') {
        index += 1;
    }
    return index;
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
    if (issue.kind === 'function-parameters') {
        return `${issue.file}:${issue.line} ${issue.name} has ${issue.actual} positional parameters; limit is ${issue.limit}`;
    }
    return `${issue.file}:${issue.line} ${issue.name} has ${issue.actual} nonblank lines; limit is ${issue.limit}`;
}

if (isCliEntry(import.meta.url)) {
    assertCodeMetrics(projectRoot());
}
