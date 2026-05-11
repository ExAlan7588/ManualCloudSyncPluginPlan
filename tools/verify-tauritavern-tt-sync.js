#!/usr/bin/env node
import { opendir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { inflateRawSync } from 'node:zlib';

export const REQUIRED_TT_SYNC_COMMANDS = Object.freeze([
    'tt_sync_pair',
    'tt_sync_list_servers',
    'tt_sync_check_diff',
    'tt_sync_push',
    'tt_sync_pull',
    'tt_sync_unpair',
]);

const COMMAND_ENCODING = 'utf8';
const EXIT_FAILURE = 1;
const EXIT_SUCCESS = 0;
const JSON_INDENT = 2;
const ZIP_CENTRAL_COMMENT_LENGTH_OFFSET = 32;
const ZIP_CENTRAL_COMPRESSED_SIZE_OFFSET = 20;
const ZIP_CENTRAL_EXTRA_LENGTH_OFFSET = 30;
const ZIP_CENTRAL_FIXED_BYTES = 46;
const ZIP_CENTRAL_LOCAL_HEADER_OFFSET = 42;
const ZIP_CENTRAL_METHOD_OFFSET = 10;
const ZIP_CENTRAL_NAME_LENGTH_OFFSET = 28;
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP_DEFLATE_METHOD = 8;
const ZIP_EOCD_CENTRAL_OFFSET_OFFSET = 16;
const ZIP_EOCD_CENTRAL_SIZE_OFFSET = 12;
const ZIP_EOCD_FIXED_BYTES = 22;
const ZIP_EOCD_SIGNATURE = 0x06054b50;
const ZIP_LOCAL_EXTRA_LENGTH_OFFSET = 28;
const ZIP_LOCAL_FIXED_BYTES = 30;
const ZIP_LOCAL_NAME_LENGTH_OFFSET = 26;
const ZIP_LOCAL_SIGNATURE = 0x04034b50;
const ZIP_MAX_COMMENT_BYTES = 0xffff;
const ZIP_STORE_METHOD = 0;
const ZIP_UINT32_MAX = 0xffffffff;
const ZIP_LIKE_EXTENSIONS = new Set(['.aab', '.apk', '.jar', '.zip']);

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
        rootDir: sourceStats.isDirectory() ? resolved : path.dirname(resolved),
        source: resolved,
        startPath: resolved,
    };
}

function createScanState(sourceInfo) {
    return {
        commandBuffers: new Map(REQUIRED_TT_SYNC_COMMANDS.map(command => [
            command,
            Buffer.from(command, COMMAND_ENCODING),
        ])),
        hits: new Map(REQUIRED_TT_SYNC_COMMANDS.map(command => [command, []])),
        rootDir: sourceInfo.rootDir,
        scannedFiles: 0,
        skippedSpecialEntries: [],
        source: sourceInfo.source,
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
    scanBuffer({ buffer, label, state: options.state });
    for (const entry of zipEntriesFrom({ buffer, label })) {
        options.state.scannedFiles += 1;
        scanBuffer({ buffer: entry.content, label: `${label}!/${entry.name}`, state: options.state });
    }
}

function scanBuffer(options) {
    for (const [command, commandBuffer] of options.state.commandBuffers) {
        if (options.buffer.includes(commandBuffer)) {
            options.state.hits.get(command).push(options.label);
        }
    }
}

function reportFor(state) {
    const commands = REQUIRED_TT_SYNC_COMMANDS.map(command => commandReport(state, command));
    const missingCommands = commands.filter(command => !command.found).map(command => command.name);
    return {
        commands,
        missingCommands,
        ok: missingCommands.length === 0,
        scannedAt: new Date().toISOString(),
        scannedFiles: state.scannedFiles,
        skippedSpecialEntries: state.skippedSpecialEntries,
        source: state.source,
    };
}

function commandReport(state, command) {
    return {
        files: [...state.hits.get(command)].sort(compareText),
        found: state.hits.get(command).length > 0,
        name: command,
    };
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
        const files = command.files.length > 0 ? command.files.join(', ') : 'not found';
        options.lines.push(`- ${command.name}: ${files}`);
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

function zipEntriesFrom(options) {
    const eocdOffset = findEndOfCentralDirectory(options.buffer);
    if (eocdOffset < 0) {
        return [];
    }
    try {
        return readZipEntries({ eocdOffset, ...options });
    } catch (error) {
        if (isZipLike(options.label)) {
            throw error;
        }
        return [];
    }
}

function readZipEntries(options) {
    const centralDirectory = centralDirectoryFrom(options);
    const entries = [];
    let cursor = centralDirectory.offset;
    const endOffset = centralDirectory.offset + centralDirectory.size;
    while (cursor < endOffset) {
        const entry = centralEntryFrom({ cursor, ...options });
        entries.push(zipEntryContent({ entry, ...options }));
        cursor += entry.headerSize;
    }
    return entries;
}

function findEndOfCentralDirectory(buffer) {
    if (buffer.length < ZIP_EOCD_FIXED_BYTES) {
        return -1;
    }
    const searchStart = Math.max(0, buffer.length - ZIP_MAX_COMMENT_BYTES - ZIP_EOCD_FIXED_BYTES);
    for (let index = buffer.length - ZIP_EOCD_FIXED_BYTES; index >= searchStart; index -= 1) {
        if (buffer.readUInt32LE(index) === ZIP_EOCD_SIGNATURE) {
            return index;
        }
    }
    return -1;
}

function centralDirectoryFrom(options) {
    const size = options.buffer.readUInt32LE(options.eocdOffset + ZIP_EOCD_CENTRAL_SIZE_OFFSET);
    const offset = options.buffer.readUInt32LE(options.eocdOffset + ZIP_EOCD_CENTRAL_OFFSET_OFFSET);
    if (size === ZIP_UINT32_MAX || offset === ZIP_UINT32_MAX) {
        throw new Error(`ZIP64 archives are not supported by this verifier: ${options.label}`);
    }
    assertReadableRange({ buffer: options.buffer, label: options.label, length: size, offset });
    return { offset, size };
}

function centralEntryFrom(options) {
    assertReadableRange({
        buffer: options.buffer,
        label: options.label,
        length: ZIP_CENTRAL_FIXED_BYTES,
        offset: options.cursor,
    });
    if (options.buffer.readUInt32LE(options.cursor) !== ZIP_CENTRAL_SIGNATURE) {
        throw new Error(`Invalid ZIP central directory in ${options.label}`);
    }
    return centralEntryFields(options);
}

function centralEntryFields(options) {
    const nameLength = options.buffer.readUInt16LE(options.cursor + ZIP_CENTRAL_NAME_LENGTH_OFFSET);
    const extraLength = options.buffer.readUInt16LE(options.cursor + ZIP_CENTRAL_EXTRA_LENGTH_OFFSET);
    const commentLength = options.buffer.readUInt16LE(options.cursor + ZIP_CENTRAL_COMMENT_LENGTH_OFFSET);
    const headerSize = ZIP_CENTRAL_FIXED_BYTES + nameLength + extraLength + commentLength;
    const nameOffset = options.cursor + ZIP_CENTRAL_FIXED_BYTES;
    const compressedSize = options.buffer.readUInt32LE(options.cursor + ZIP_CENTRAL_COMPRESSED_SIZE_OFFSET);
    const localHeaderOffset = options.buffer.readUInt32LE(options.cursor + ZIP_CENTRAL_LOCAL_HEADER_OFFSET);
    assertReadableRange({ buffer: options.buffer, label: options.label, length: nameLength, offset: nameOffset });
    assertReadableRange({ buffer: options.buffer, label: options.label, length: headerSize, offset: options.cursor });
    assertZip32Entry({ compressedSize, label: options.label, localHeaderOffset });
    return {
        compressedSize,
        headerSize,
        localHeaderOffset,
        method: options.buffer.readUInt16LE(options.cursor + ZIP_CENTRAL_METHOD_OFFSET),
        name: options.buffer.toString(COMMAND_ENCODING, nameOffset, nameOffset + nameLength),
    };
}

function zipEntryContent(options) {
    const dataStart = zipEntryDataStart(options);
    assertReadableRange({
        buffer: options.buffer,
        label: `${options.label}!/${options.entry.name}`,
        length: options.entry.compressedSize,
        offset: dataStart,
    });
    const compressed = options.buffer.subarray(dataStart, dataStart + options.entry.compressedSize);
    return {
        content: inflateZipEntry({ compressed, entry: options.entry, label: options.label }),
        name: options.entry.name,
    };
}

function zipEntryDataStart(options) {
    assertReadableRange({
        buffer: options.buffer,
        label: options.label,
        length: ZIP_LOCAL_FIXED_BYTES,
        offset: options.entry.localHeaderOffset,
    });
    if (options.buffer.readUInt32LE(options.entry.localHeaderOffset) !== ZIP_LOCAL_SIGNATURE) {
        throw new Error(`Invalid ZIP local header in ${options.label}!/${options.entry.name}`);
    }
    const nameLength = options.buffer.readUInt16LE(options.entry.localHeaderOffset + ZIP_LOCAL_NAME_LENGTH_OFFSET);
    const extraLength = options.buffer.readUInt16LE(options.entry.localHeaderOffset + ZIP_LOCAL_EXTRA_LENGTH_OFFSET);
    return options.entry.localHeaderOffset + ZIP_LOCAL_FIXED_BYTES + nameLength + extraLength;
}

function inflateZipEntry(options) {
    if (options.entry.method === ZIP_STORE_METHOD) {
        return options.compressed;
    }
    if (options.entry.method === ZIP_DEFLATE_METHOD) {
        return inflateRawSync(options.compressed);
    }
    throw new Error(`Unsupported ZIP compression method ${options.entry.method} in ${options.label}!/${options.entry.name}`);
}

function assertReadableRange(options) {
    const endOffset = options.offset + options.length;
    if (options.offset < 0 || options.length < 0 || endOffset > options.buffer.length) {
        throw new Error(`Invalid ZIP range in ${options.label}`);
    }
}

function assertZip32Entry(options) {
    if (options.compressedSize === ZIP_UINT32_MAX || options.localHeaderOffset === ZIP_UINT32_MAX) {
        throw new Error(`ZIP64 entries are not supported by this verifier: ${options.label}`);
    }
}

function isZipLike(label) {
    return ZIP_LIKE_EXTENSIONS.has(path.extname(label).toLowerCase());
}

function isCliEntry() {
    return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isCliEntry()) {
    process.exitCode = await runCli();
}
