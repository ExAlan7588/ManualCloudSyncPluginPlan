#!/usr/bin/env node
import { opendir, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import {
    EXIT_FAILURE,
    EXIT_SUCCESS,
    isCliEntry,
    writeFormattedOutput,
    writeOptionalJsonFile,
} from './cli-helpers.js';

export const REQUIRED_TT_SYNC_EVENTS = Object.freeze([
    'tt_sync:progress',
    'tt_sync:completed',
    'tt_sync:error',
]);

export const REQUIRED_TT_SYNC_EVENT_FIELDS = Object.freeze({
    completed: ['direction', 'files_total', 'bytes_total', 'files_deleted'],
    progress: ['direction', 'phase', 'files_done', 'files_total', 'bytes_done', 'bytes_total', 'current_path'],
});

export const REQUIRED_TT_SYNC_DIFF_CONFLICT_SURFACES = Object.freeze([
    'conflictDecisionPayload',
    'conflictDto',
    'conflictEvent',
    'preTransferDiffEvent',
]);
export const EVENT_SURFACE_REPORT_SCHEMA_VERSION = 1;
export const EVENT_SURFACE_REPORT_TOOL = 'verify-tauritavern-events';

const DIFF_CONFLICT_SURFACE_GROUPS = Object.freeze({
    conflictDecisionPayload: ['conflictDecisions', 'conflict_decisions'],
    conflictDto: ['TtSyncConflict', 'TtSyncConflictEvent'],
    conflictEvent: ['tt_sync:conflict'],
    preTransferDiffEvent: ['tt_sync:diff', 'tt_sync:plan'],
});
const TEXT_EXTENSIONS = new Set(['.js', '.json', '.md', '.rs', '.toml', '.ts', '.txt']);
export async function verifyTauriTavernTtSyncEventSurface(options) {
    const sourceInfo = await sourceInfoFor(options?.source);
    const state = createState(sourceInfo);
    await scanEntry({ entryPath: sourceInfo.startPath, state });
    return reportFor(state);
}

export function formatEventSurfaceReport(report) {
    const lines = [
        `TT-Sync event surface verification ${report.ok ? 'passed' : 'failed'}`,
        `source: ${report.source}`,
        `source kind: ${report.sourceKind}`,
        `scanned files: ${report.scannedFiles}`,
    ];
    appendMissingSection(lines, 'missing events', report.missingEvents);
    appendMissingSection(lines, 'missing event fields', report.missingPayloadFields);
    appendEventSection(lines, report);
    appendFieldSection(lines, report);
    appendDiffConflictSection(lines, report);
    return lines.join('\n');
}

async function sourceInfoFor(source) {
    if (!source) {
        throw new Error(usageText());
    }
    const resolved = await realpath(path.resolve(source));
    const sourceStats = await stat(resolved);
    return {
        rootDir: sourceStats.isDirectory() ? resolved : path.dirname(resolved),
        source: resolved,
        sourceKind: sourceStats.isDirectory() ? 'source-tree' : 'source-file',
        startPath: resolved,
    };
}

function createState(sourceInfo) {
    return {
        diffConflict: groupedHits(),
        eventHits: hitsFor(REQUIRED_TT_SYNC_EVENTS),
        fieldHits: {
            completed: hitsFor(REQUIRED_TT_SYNC_EVENT_FIELDS.completed),
            progress: hitsFor(REQUIRED_TT_SYNC_EVENT_FIELDS.progress),
        },
        rootDir: sourceInfo.rootDir,
        scannedFiles: 0,
        source: sourceInfo.source,
        sourceKind: sourceInfo.sourceKind,
        visited: new Set(),
    };
}

function groupedHits() {
    return Object.fromEntries(Object.keys(DIFF_CONFLICT_SURFACE_GROUPS).map(key => [key, []]));
}

function hitsFor(values) {
    return new Map(values.map(value => [value, []]));
}

async function scanEntry(options) {
    const resolved = await realpath(options.entryPath);
    if (options.state.visited.has(resolved)) {
        return;
    }
    options.state.visited.add(resolved);
    const entryStats = await stat(resolved);
    if (entryStats.isDirectory()) {
        await scanDirectory({ dirPath: resolved, state: options.state });
        return;
    }
    if (entryStats.isFile() && isTextFile(resolved)) {
        await scanTextFile({ filePath: resolved, state: options.state });
    }
}

async function scanDirectory(options) {
    const directory = await opendir(options.dirPath);
    const names = [];
    for await (const entry of directory) {
        names.push(entry.name);
    }
    names.sort(compareText);
    for (const name of names) {
        await scanEntry({ entryPath: path.join(options.dirPath, name), state: options.state });
    }
}

async function scanTextFile(options) {
    const text = await readFile(options.filePath, 'utf8');
    const label = displayPath(options.state, options.filePath);
    options.state.scannedFiles += 1;
    recordTokenHits(options.state.eventHits, text, label);
    recordPayloadFields(options.state.fieldHits, text, label);
    recordDiffConflictHits(options.state.diffConflict, text, label);
}

function recordTokenHits(hitMap, text, label) {
    for (const [token, files] of hitMap) {
        if (text.includes(token)) {
            files.push(label);
        }
    }
}

function recordPayloadFields(fieldHits, text, label) {
    recordStructFields(fieldHits.progress, 'TtSyncProgressEvent', text, label);
    recordStructFields(fieldHits.completed, 'TtSyncCompletedEvent', text, label);
}

function recordStructFields(hitMap, structName, text, label) {
    const structBody = structBodyFor(text, structName);
    if (!structBody) {
        return;
    }
    for (const [field, files] of hitMap) {
        if (new RegExp(`\\bpub\\s+${escapeRegex(field)}\\b`).test(structBody)) {
            files.push(label);
        }
    }
}

function structBodyFor(text, structName) {
    const match = new RegExp(`struct\\s+${escapeRegex(structName)}\\s*\\{([\\s\\S]{0,1200})\\}`).exec(text);
    return match?.[1] || '';
}

function recordDiffConflictHits(groups, text, label) {
    for (const [group, tokens] of Object.entries(DIFF_CONFLICT_SURFACE_GROUPS)) {
        if (tokens.some(token => text.includes(token))) {
            groups[group].push(label);
        }
    }
}

function reportFor(state) {
    const events = [...state.eventHits].map(([name, files]) => itemReport(name, files));
    const payloadFields = payloadFieldReport(state.fieldHits);
    const missingPayloadFields = missingFields(payloadFields);
    const missingEvents = events.filter(item => !item.found).map(item => item.name);
    return {
        diffConflictSurface: diffConflictReport(state.diffConflict),
        events,
        missingEvents,
        missingPayloadFields,
        ok: missingEvents.length === 0 && missingPayloadFields.length === 0,
        payloadFields,
        schemaVersion: EVENT_SURFACE_REPORT_SCHEMA_VERSION,
        scannedAt: new Date().toISOString(),
        scannedFiles: state.scannedFiles,
        source: state.source,
        sourceKind: state.sourceKind,
        tool: EVENT_SURFACE_REPORT_TOOL,
    };
}

function payloadFieldReport(fieldHits) {
    return {
        completed: [...fieldHits.completed].map(([name, files]) => itemReport(name, files)),
        progress: [...fieldHits.progress].map(([name, files]) => itemReport(name, files)),
    };
}

function diffConflictReport(groups) {
    return Object.fromEntries(Object.entries(groups).map(([key, files]) => [key, itemReport(key, files)]));
}

function itemReport(name, files) {
    return {
        files: [...new Set(files)].sort(compareText),
        found: files.length > 0,
        name,
    };
}

function missingFields(payloadFields) {
    return Object.entries(payloadFields).flatMap(([group, fields]) => fields
        .filter(field => !field.found)
        .map(field => `${group}.${field.name}`));
}

function appendMissingSection(lines, title, values) {
    if (values.length === 0) {
        return;
    }
    lines.push(`${title}:`);
    lines.push(...values.map(value => `- ${value}`));
}

function appendEventSection(lines, report) {
    lines.push('events:');
    lines.push(...report.events.map(item => `- ${item.name}: ${fileList(item)}`));
}

function appendFieldSection(lines, report) {
    lines.push('payload fields:');
    for (const [group, fields] of Object.entries(report.payloadFields)) {
        lines.push(...fields.map(item => `- ${group}.${item.name}: ${fileList(item)}`));
    }
}

function appendDiffConflictSection(lines, report) {
    lines.push('diff/conflict surface:');
    for (const item of Object.values(report.diffConflictSurface)) {
        lines.push(`- ${item.name}: ${fileList(item)}`);
    }
}

function fileList(item) {
    return item.files.length > 0 ? item.files.join(', ') : 'not found';
}

function isTextFile(filePath) {
    return TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function displayPath(state, filePath) {
    return path.relative(state.rootDir, filePath) || path.basename(filePath);
}

function compareText(left, right) {
    return left.localeCompare(right);
}

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseCliOptions() {
    return parseArgs({
        allowPositionals: false,
        options: {
            help: { short: 'h', type: 'boolean' },
            json: { type: 'boolean' },
            manifest: { type: 'string' },
            source: { short: 's', type: 'string' },
        },
    }).values;
}

function usageText() {
    return [
        'Usage: node tools/verify-tauritavern-tt-sync-events.js --source <path> [--json] [--manifest <path>]',
        '',
        'Scans a TauriTavern source tree for required tt_sync event names and payload fields.',
    ].join('\n');
}

async function runCli() {
    try {
        const options = parseCliOptions();
        if (options.help) {
            console.log(usageText());
            return EXIT_SUCCESS;
        }
        const report = await verifyTauriTavernTtSyncEventSurface({ source: options.source });
        await writeOptionalJsonFile({ filePath: options.manifest, value: report });
        writeFormattedOutput({ format: formatEventSurfaceReport, json: options.json, value: report });
        return report.ok ? EXIT_SUCCESS : EXIT_FAILURE;
    } catch (error) {
        console.error(error.message);
        return EXIT_FAILURE;
    }
}

if (isCliEntry(import.meta.url)) {
    process.exitCode = await runCli();
}
