#!/usr/bin/env node
import { opendir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { ZIP_LIKE_EXTENSIONS, zipEntriesFrom } from './zip-entries.js';

export const REQUIRED_TT_SYNC_COMMANDS = Object.freeze([
    'tt_sync_cancel',
    'tt_sync_pair',
    'tt_sync_list_servers',
    'tt_sync_push',
    'tt_sync_pull',
    'tt_sync_remove_server',
]);
export const COMMAND_REPORT_SCHEMA_VERSION = 1;
export const COMMAND_REPORT_TOOL = 'verify-tauritavern-tt-sync';

const COMMAND_ENCODING = 'utf8';
const EXIT_FAILURE = 1;
const EXIT_SUCCESS = 0;
const JSON_INDENT = 2;
const TRUSTED_BINARY_EXTENSIONS = new Set([
    '.arsc',
    '.class',
    '.dex',
    '.dll',
    '.dylib',
    '.exe',
    '.node',
    '.so',
    '.wasm',
]);
const TEXT_EXTENSIONS = new Set([
    '.css',
    '.html',
    '.java',
    '.js',
    '.json',
    '.jsx',
    '.kt',
    '.md',
    '.mjs',
    '.rs',
    '.swift',
    '.toml',
    '.ts',
    '.tsx',
    '.txt',
    '.yaml',
    '.yml',
]);
const TEXT_SAMPLE_BYTES = 4096;
const BINARY_CONTROL_RATIO = 0.08;
const ASCII_PRINTABLE_MIN = 32;
const ASCII_PRINTABLE_MAX = 126;
const ASCII_TAB = 9;
const ASCII_LF = 10;
const ASCII_CR = 13;

export async function verifyTauriTavernCommands(options) {
    const sourceInfo = await sourceInfoFor(options?.source);
    const state = createScanState(sourceInfo);
    await scanEntry({ entryPath: sourceInfo.startPath, state });
    return reportFor(state);
}

export function formatVerificationReport(report) {
    const lines = [
        `TT-Sync command verification ${report.ok ? 'passed' : 'failed'}`,
        `source: ${report.source}`,
        `scanned files: ${report.scannedFiles}`,
    ];
    appendMissingSection({ lines, report });
    appendCommandSection({ lines, report });
    appendIgnoredSection({ lines, report });
    appendSpecialEntrySection({ lines, report });
    return lines.join('\n');
}

async function sourceInfoFor(source) {
    if (!source) {
        throw new Error(usageText());
    }
    const resolved = await realpath(path.resolve(source));
    const sourceStats = await stat(resolved);
    return {
        isSingleFile: sourceStats.isFile(),
        rootDir: sourceStats.isDirectory() ? resolved : path.dirname(resolved),
        source: resolved,
        sourceKind: sourceKindFor(resolved, sourceStats),
        startPath: resolved,
    };
}

function sourceKindFor(sourcePath, sourceStats) {
    if (sourceStats.isDirectory()) {
        return 'source-tree';
    }
    return isBuildArtifactSource(sourcePath) ? 'build-artifact' : 'source-file';
}

function isBuildArtifactSource(sourcePath) {
    const extension = path.extname(sourcePath).toLowerCase();
    return ZIP_LIKE_EXTENSIONS.has(extension) || TRUSTED_BINARY_EXTENSIONS.has(extension) || !isTextExtension(sourcePath);
}

function createScanState(sourceInfo) {
    return {
        commandBuffers: new Map(REQUIRED_TT_SYNC_COMMANDS.map(command => [
            command,
            Buffer.from(command, COMMAND_ENCODING),
        ])),
        ignoredHits: new Map(REQUIRED_TT_SYNC_COMMANDS.map(command => [command, []])),
        hits: new Map(REQUIRED_TT_SYNC_COMMANDS.map(command => [command, []])),
        isSingleFile: sourceInfo.isSingleFile,
        rootDir: sourceInfo.rootDir,
        scannedFiles: 0,
        skippedSpecialEntries: [],
        source: sourceInfo.source,
        sourceKind: sourceInfo.sourceKind,
        visited: new Set(),
    };
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
    if (entryStats.isFile()) {
        await scanFile({ filePath: resolved, state: options.state });
        return;
    }
    options.state.skippedSpecialEntries.push(displayPath(options.state, resolved));
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

async function scanFile(options) {
    const buffer = await readFile(options.filePath);
    options.state.scannedFiles += 1;
    const label = displayPath(options.state, options.filePath);
    const entries = zipEntriesFrom({ buffer, label });
    if (entries.length === 0) {
        scanBuffer({ buffer, label, state: options.state });
    }
    for (const entry of entries) {
        options.state.scannedFiles += 1;
        scanBuffer({ buffer: entry.content, label: `${label}!/${entry.name}`, state: options.state });
    }
}

function scanBuffer(options) {
    for (const [command, commandBuffer] of options.state.commandBuffers) {
        if (options.buffer.includes(commandBuffer)) {
            recordCommandHit({ command, ...options });
        }
    }
}

function recordCommandHit(options) {
    const evidence = evidenceFor(options);
    const trusted = evidence.filter(item => item.trusted);
    for (const item of trusted) {
        options.state.hits.get(options.command).push({ file: options.label, kind: item.kind });
    }
    if (trusted.length === 0) {
        options.state.ignoredHits.get(options.command).push(options.label);
    }
}

function evidenceFor(options) {
    if (isTrustedBuildArtifact({ buffer: options.buffer, label: options.label, state: options.state })) {
        return [{ kind: 'build-artifact-string', trusted: true }];
    }
    const text = options.buffer.toString(COMMAND_ENCODING);
    const evidence = [];
    if (hasTauriCommandDeclaration({ command: options.command, label: options.label, text })) {
        evidence.push({ kind: 'tauri-command-declaration', trusted: true });
    }
    if (hasTauriHandlerRegistration({ command: options.command, label: options.label, text })) {
        evidence.push({ kind: 'tauri-handler-registration', trusted: true });
    }
    return evidence.length > 0 ? evidence : [{ kind: 'untrusted-string', trusted: false }];
}

function reportFor(state) {
    const commands = REQUIRED_TT_SYNC_COMMANDS.map(command => commandReport(state, command));
    const missingCommands = commands.filter(command => !command.found).map(command => command.name);
    return {
        commands,
        missingCommands,
        ok: missingCommands.length === 0,
        schemaVersion: COMMAND_REPORT_SCHEMA_VERSION,
        scannedAt: new Date().toISOString(),
        scannedFiles: state.scannedFiles,
        skippedSpecialEntries: state.skippedSpecialEntries,
        source: state.source,
        sourceKind: state.sourceKind,
        tool: COMMAND_REPORT_TOOL,
    };
}

function commandReport(state, command) {
    const evidence = [...state.hits.get(command)].sort(compareEvidence);
    return {
        evidence,
        files: evidence.map(item => item.file),
        found: commandEvidenceCoversCommand(evidence),
        ignoredFiles: [...state.ignoredHits.get(command)].sort(compareText),
        name: command,
    };
}

function commandEvidenceCoversCommand(evidence) {
    const kinds = new Set(evidence.map(item => item.kind));
    return kinds.has('build-artifact-string')
        || (kinds.has('tauri-command-declaration') && kinds.has('tauri-handler-registration'));
}

function displayPath(state, filePath) {
    return path.relative(state.rootDir, filePath) || path.basename(filePath);
}

function appendMissingSection(options) {
    if (options.report.missingCommands.length === 0) {
        return;
    }
    options.lines.push('missing commands:');
    options.lines.push(...options.report.missingCommands.map(command => `- ${command}`));
}

function appendCommandSection(options) {
    options.lines.push('command evidence:');
    for (const command of options.report.commands) {
        const files = command.evidence.length > 0 ? evidenceLabels(command.evidence).join(', ') : 'not found';
        options.lines.push(`- ${command.name}: ${files}`);
    }
}

function evidenceLabels(evidence) {
    return evidence.map(item => `${item.file} (${item.kind})`);
}

function appendIgnoredSection(options) {
    const ignored = options.report.commands.filter(command => command.ignoredFiles.length > 0);
    if (ignored.length === 0) {
        return;
    }
    options.lines.push('ignored command strings:');
    for (const command of ignored) {
        options.lines.push(`- ${command.name}: ${command.ignoredFiles.join(', ')}`);
    }
}

function appendSpecialEntrySection(options) {
    if (options.report.skippedSpecialEntries.length === 0) {
        return;
    }
    options.lines.push('skipped non-regular entries:');
    options.lines.push(...options.report.skippedSpecialEntries.map(entry => `- ${entry}`));
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
        'Usage: node tools/verify-tauritavern-tt-sync.js --source <path> [--json] [--manifest <path>]',
        '',
        'Scans a TauriTavern source tree, APK/AAB, or build artifact for required tt_sync_* command names.',
    ].join('\n');
}

async function runCli() {
    try {
        const options = parseCliOptions();
        if (options.help) {
            console.log(usageText());
            return EXIT_SUCCESS;
        }
        const report = await verifyTauriTavernCommands({ source: options.source });
        await writeManifest({ manifestPath: options.manifest, report });
        writeCliOutput({ json: options.json, report });
        return report.ok ? EXIT_SUCCESS : EXIT_FAILURE;
    } catch (error) {
        console.error(error.message);
        return EXIT_FAILURE;
    }
}

async function writeManifest(options) {
    if (!options.manifestPath) {
        return;
    }
    await writeFile(options.manifestPath, `${JSON.stringify(options.report, null, JSON_INDENT)}\n`);
}

function writeCliOutput(options) {
    if (options.json) {
        console.log(JSON.stringify(options.report, null, JSON_INDENT));
        return;
    }
    console.log(formatVerificationReport(options.report));
}

function compareText(left, right) {
    return left.localeCompare(right);
}

function compareEvidence(left, right) {
    return compareText(`${left.file}:${left.kind}`, `${right.file}:${right.kind}`);
}

function hasTauriCommandDeclaration(options) {
    if (!isRustSource(options.label)) {
        return false;
    }
    const escaped = escapeRegex(options.command);
    const visibility = '(?:pub(?:\\([^)]*\\))?\\s+)?';
    const pattern = new RegExp(`#\\[\\s*tauri::command[^\\]]*\\][\\s\\S]{0,300}\\b${visibility}(?:async\\s+)?fn\\s+${escaped}\\b`);
    return pattern.test(options.text);
}

function hasTauriHandlerRegistration(options) {
    if (!isRustSource(options.label)) {
        return false;
    }
    return hasGenerateHandlerRegistration(options) || hasQualifiedRustHandlerRegistration(options);
}

function hasGenerateHandlerRegistration(options) {
    const escaped = escapeRegex(options.command);
    const pattern = new RegExp(`tauri::generate_handler!\\s*\\[[\\s\\S]{0,2000}\\b${escaped}\\b[\\s\\S]{0,2000}\\]`);
    return pattern.test(options.text);
}

function hasQualifiedRustHandlerRegistration(options) {
    if (!options.text.includes('tauri::generate_handler!')) {
        return false;
    }
    const escaped = escapeRegex(options.command);
    const pattern = new RegExp(`\\bsuper::[A-Za-z0-9_:]+::${escaped}\\b`);
    return pattern.test(options.text);
}

function isRustSource(label) {
    return path.extname(artifactLabel(label)).toLowerCase() === '.rs';
}

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isTrustedBuildArtifact(options) {
    if (TRUSTED_BINARY_EXTENSIONS.has(path.extname(artifactLabel(options.label)).toLowerCase())) {
        return true;
    }
    return options.state.isSingleFile && looksBinary(options.buffer) && !isTextExtension(options.label);
}

function artifactLabel(label) {
    return label.includes('!/') ? label.slice(label.lastIndexOf('!/') + 2) : label;
}

function isTextExtension(label) {
    return TEXT_EXTENSIONS.has(path.extname(artifactLabel(label)).toLowerCase());
}

function looksBinary(buffer) {
    const sampleSize = Math.min(buffer.length, TEXT_SAMPLE_BYTES);
    if (sampleSize === 0) {
        return false;
    }
    let controlBytes = 0;
    for (let index = 0; index < sampleSize; index += 1) {
        if (!isPrintableByte(buffer[index])) {
            controlBytes += 1;
        }
    }
    return controlBytes / sampleSize > BINARY_CONTROL_RATIO;
}

function isPrintableByte(value) {
    return value === ASCII_TAB
        || value === ASCII_LF
        || value === ASCII_CR
        || (value >= ASCII_PRINTABLE_MIN && value <= ASCII_PRINTABLE_MAX);
}

function isCliEntry() {
    return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isCliEntry()) {
    process.exitCode = await runCli();
}
