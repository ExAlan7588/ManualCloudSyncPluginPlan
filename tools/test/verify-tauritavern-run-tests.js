import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { REQUIRED_TT_SYNC_COMMANDS, verifyTauriTavernCommands } from '../verify-tauritavern-tt-sync.js';

const VERIFIER_FIXTURE_DIR = 'src-tauri/src';
const VERIFIER_FIXTURE_FILE = 'commands.rs';
const VERIFIER_MISSING_COMMAND = 'tt_sync_unpair';
const ZIP_CENTRAL_COMPRESSED_SIZE_OFFSET = 20;
const ZIP_CENTRAL_FIXED_BYTES = 46;
const ZIP_CENTRAL_LOCAL_HEADER_OFFSET = 42;
const ZIP_CENTRAL_METHOD_OFFSET = 10;
const ZIP_CENTRAL_NAME_LENGTH_OFFSET = 28;
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP_CENTRAL_UNCOMPRESSED_SIZE_OFFSET = 24;
const ZIP_CENTRAL_VERSION_MADE_OFFSET = 4;
const ZIP_CENTRAL_VERSION_NEEDED_OFFSET = 6;
const ZIP_DEFLATE_METHOD = 8;
const ZIP_EMPTY_VALUE = 0;
const ZIP_ENTRY_COUNT = 1;
const ZIP_EOCD_CENTRAL_OFFSET_OFFSET = 16;
const ZIP_EOCD_CENTRAL_SIZE_OFFSET = 12;
const ZIP_EOCD_DISK_ENTRY_COUNT_OFFSET = 8;
const ZIP_EOCD_FIXED_BYTES = 22;
const ZIP_EOCD_SIGNATURE = 0x06054b50;
const ZIP_EOCD_TOTAL_ENTRY_COUNT_OFFSET = 10;
const ZIP_LOCAL_COMPRESSED_SIZE_OFFSET = 18;
const ZIP_LOCAL_FIXED_BYTES = 30;
const ZIP_LOCAL_METHOD_OFFSET = 8;
const ZIP_LOCAL_NAME_LENGTH_OFFSET = 26;
const ZIP_LOCAL_SIGNATURE = 0x04034b50;
const ZIP_LOCAL_UNCOMPRESSED_SIZE_OFFSET = 22;
const ZIP_LOCAL_VERSION_OFFSET = 4;
const ZIP_VERSION = 20;

const tests = [
    ['TauriTavern command verifier passes when commands exist', testVerifierFindsCommands],
    ['TauriTavern command verifier scans compressed zip artifacts', testVerifierScansCompressedZip],
    ['TauriTavern command verifier rejects docs-only command strings', testVerifierRejectsDocsOnly],
    ['TauriTavern command verifier fails when commands are missing', testVerifierMissingCommands],
];

for (const [name, test] of tests) {
    try {
        await test();
        console.log(`ok - ${name}`);
    } catch (error) {
        console.error(`not ok - ${name}`);
        console.error(error);
        process.exitCode = 1;
        break;
    }
}

async function testVerifierFindsCommands() {
    await withVerifierFixture(async root => {
        await writeVerifierFixture({ commands: REQUIRED_TT_SYNC_COMMANDS, root });
        const report = await verifyTauriTavernCommands({ source: root });
        assert.equal(report.ok, true);
        assert.equal(report.missingCommands.length, 0);
        assert.equal(report.commands.every(command => command.found), true);
    });
}

async function testVerifierMissingCommands() {
    await withVerifierFixture(async root => {
        const commands = REQUIRED_TT_SYNC_COMMANDS.filter(command => command !== VERIFIER_MISSING_COMMAND);
        await writeVerifierFixture({ commands, root });
        const report = await verifyTauriTavernCommands({ source: root });
        assert.equal(report.ok, false);
        assert.deepEqual(report.missingCommands, [VERIFIER_MISSING_COMMAND]);
    });
}

async function testVerifierScansCompressedZip() {
    await withVerifierFixture(async root => {
        const artifactPath = path.join(root, 'app-release.apk');
        const source = verifierSourceFor(REQUIRED_TT_SYNC_COMMANDS);
        await writeFile(artifactPath, zipArtifactFor({ content: source, name: 'classes.dex' }));
        const report = await verifyTauriTavernCommands({ source: artifactPath });
        assert.equal(report.ok, true);
        assert.equal(report.commands.every(command => command.files.includes('app-release.apk!/classes.dex')), true);
    });
}

async function testVerifierRejectsDocsOnly() {
    await withVerifierFixture(async root => {
        const docsPath = path.join(root, 'README.md');
        await writeFile(docsPath, REQUIRED_TT_SYNC_COMMANDS.join('\n'));
        const report = await verifyTauriTavernCommands({ source: root });
        assert.equal(report.ok, false);
        assert.deepEqual(report.missingCommands, REQUIRED_TT_SYNC_COMMANDS);
        assert.equal(report.commands.every(command => command.ignoredFiles.includes('README.md')), true);
    });
}

async function withVerifierFixture(callback) {
    const root = await mkdtemp(path.join(tmpdir(), 'tt-sync-verifier-'));
    try {
        await callback(root);
    } finally {
        await rm(root, { force: true, recursive: true });
    }
}

async function writeVerifierFixture(options) {
    const fixtureDir = path.join(options.root, VERIFIER_FIXTURE_DIR);
    const fixturePath = path.join(fixtureDir, VERIFIER_FIXTURE_FILE);
    await mkdir(fixtureDir, { recursive: true });
    await writeFile(fixturePath, verifierSourceFor(options.commands));
}

function verifierSourceFor(commands) {
    return commands.map(command => `#[tauri::command]\npub async fn ${command}() {}\n`).join('\n');
}

function zipArtifactFor(options) {
    const name = Buffer.from(options.name);
    const content = Buffer.from(options.content);
    const compressed = deflateRawSync(content);
    const local = zipLocalHeader({ compressed, content, name });
    const localPayloadSize = local.length + name.length + compressed.length;
    const central = zipCentralHeader({ compressed, content, name });
    const eocd = zipEndOfCentralDirectory({ centralOffset: localPayloadSize, centralSize: central.length + name.length });
    return Buffer.concat([local, name, compressed, central, name, eocd]);
}

function zipLocalHeader(options) {
    const header = Buffer.alloc(ZIP_LOCAL_FIXED_BYTES);
    header.writeUInt32LE(ZIP_LOCAL_SIGNATURE, ZIP_EMPTY_VALUE);
    header.writeUInt16LE(ZIP_VERSION, ZIP_LOCAL_VERSION_OFFSET);
    header.writeUInt16LE(ZIP_DEFLATE_METHOD, ZIP_LOCAL_METHOD_OFFSET);
    header.writeUInt32LE(options.compressed.length, ZIP_LOCAL_COMPRESSED_SIZE_OFFSET);
    header.writeUInt32LE(options.content.length, ZIP_LOCAL_UNCOMPRESSED_SIZE_OFFSET);
    header.writeUInt16LE(options.name.length, ZIP_LOCAL_NAME_LENGTH_OFFSET);
    return header;
}

function zipCentralHeader(options) {
    const header = Buffer.alloc(ZIP_CENTRAL_FIXED_BYTES);
    header.writeUInt32LE(ZIP_CENTRAL_SIGNATURE, ZIP_EMPTY_VALUE);
    header.writeUInt16LE(ZIP_VERSION, ZIP_CENTRAL_VERSION_MADE_OFFSET);
    header.writeUInt16LE(ZIP_VERSION, ZIP_CENTRAL_VERSION_NEEDED_OFFSET);
    header.writeUInt16LE(ZIP_DEFLATE_METHOD, ZIP_CENTRAL_METHOD_OFFSET);
    header.writeUInt32LE(options.compressed.length, ZIP_CENTRAL_COMPRESSED_SIZE_OFFSET);
    header.writeUInt32LE(options.content.length, ZIP_CENTRAL_UNCOMPRESSED_SIZE_OFFSET);
    header.writeUInt16LE(options.name.length, ZIP_CENTRAL_NAME_LENGTH_OFFSET);
    header.writeUInt32LE(ZIP_EMPTY_VALUE, ZIP_CENTRAL_LOCAL_HEADER_OFFSET);
    return header;
}

function zipEndOfCentralDirectory(options) {
    const header = Buffer.alloc(ZIP_EOCD_FIXED_BYTES);
    header.writeUInt32LE(ZIP_EOCD_SIGNATURE, ZIP_EMPTY_VALUE);
    header.writeUInt16LE(ZIP_ENTRY_COUNT, ZIP_EOCD_DISK_ENTRY_COUNT_OFFSET);
    header.writeUInt16LE(ZIP_ENTRY_COUNT, ZIP_EOCD_TOTAL_ENTRY_COUNT_OFFSET);
    header.writeUInt32LE(options.centralSize, ZIP_EOCD_CENTRAL_SIZE_OFFSET);
    header.writeUInt32LE(options.centralOffset, ZIP_EOCD_CENTRAL_OFFSET_OFFSET);
    return header;
}
