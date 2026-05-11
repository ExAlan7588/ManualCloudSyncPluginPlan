#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { REQUIRED_TT_SYNC_COMMANDS } from './verify-tauritavern-tt-sync.js';

export const REQUIRED_SMOKE_CHECKS = Object.freeze([
    'status',
    'pair',
    'session',
    'progress planned',
    'progress transferring',
    'progress committed',
    'push commit',
    'pull mtime header',
    'empty diff',
    'device history',
]);

export const REQUIRED_DEPLOY_CHECKS = Object.freeze([
    'service starts node server',
    'service hardening no new privileges',
    'service hardening protect system',
    'env public URL',
    'env port',
    'env pairing token is not placeholder',
    'service can write data dir',
]);

const FIELD_POSITIVE_NUMBER = 'positiveNumber';
const FIELD_TEXT = 'text';

export const REQUIRED_DEVICE_CHECKS = Object.freeze([
    ['realLargeFirstSyncCompleted', 'real large first sync completed', [
        ['metrics.durationMs', FIELD_POSITIVE_NUMBER],
        ['metrics.fileCount', FIELD_POSITIVE_NUMBER],
        ['metrics.totalBytes', FIELD_POSITIVE_NUMBER],
    ]],
    ['commandContractVerified', 'TauriTavern backend command contract verified', [
        ['commandReport.scannedAt', FIELD_TEXT],
        ['commandReport.source', FIELD_TEXT],
    ]],
    ['phoneDesktopPairingSaved', 'phone and desktop save paired server', [
        ['desktop.savedServerId', FIELD_TEXT],
        ['phone.savedServerId', FIELD_TEXT],
    ]],
    ['liveProgressBridgeVisible', 'live progress bridge visible in TauriTavern', [
        ['progress.eventCount', FIELD_POSITIVE_NUMBER],
        ['progress.lastPhase', FIELD_TEXT],
    ]],
    ['pullMtimePreserved', 'pull preserves local filesystem mtime', [
        ['mtime.actualModifiedMs', FIELD_POSITIVE_NUMBER],
        ['mtime.expectedModifiedMs', FIELD_POSITIVE_NUMBER],
    ]],
    ['pullInterruptionSafe', 'pull interruption keeps existing local files safe', [
        ['interruption.afterHash', FIELD_TEXT],
        ['interruption.beforeHash', FIELD_TEXT],
        ['interruption.error', FIELD_TEXT],
    ]],
    ['lanCloudSyncMutex', 'LAN Sync and cloud sync are mutually exclusive', [
        ['mutex.blockedOperation', FIELD_TEXT],
        ['mutex.visibleError', FIELD_TEXT],
    ]],
    ['androidWeakNetworkErrorVisible', 'Android weak-network error is visible', [
        ['android.networkProfile', FIELD_TEXT],
        ['android.visibleError', FIELD_TEXT],
    ]],
]);

const EXIT_FAILURE = 1;
const EXIT_SUCCESS = 0;
const JSON_INDENT = 2;

export async function verifyIncrementalCloudSyncEvidence(options = {}) {
    const evidence = await loadEvidence(options);
    const checks = [
        ...commandChecks(evidence.commandReport),
        ...deployChecks(evidence.deployReport),
        ...smokeChecks(evidence.smokeReport),
        ...deviceChecks(evidence.deviceEvidence),
        ...consistencyChecks(evidence),
    ];
    return reportFor(checks);
}

export function formatEvidenceReport(report) {
    const lines = [
        `Incremental cloud sync evidence ${report.ok ? 'passed' : 'failed'}`,
        `verified at: ${report.verifiedAt}`,
        'checks:',
    ];
    lines.push(...report.checks.map(formatCheckLine));
    return lines.join('\n');
}

async function loadEvidence(options) {
    return {
        commandReport: await loadReport({ label: 'command report', object: options.commandReport, path: options.commandReportPath }),
        deployReport: await loadReport({ label: 'deploy report', object: options.deployReport, path: options.deployReportPath }),
        deviceEvidence: await loadReport({ label: 'device evidence', object: options.deviceEvidence, path: options.deviceEvidencePath }),
        smokeReport: await loadReport({ label: 'smoke report', object: options.smokeReport, path: options.smokeReportPath }),
    };
}

async function loadReport(options) {
    if (options.object) {
        return options.object;
    }
    if (!options.path) {
        throw new Error(`${options.label} path is required`);
    }
    return JSON.parse(await readFile(options.path, 'utf8'));
}

function commandChecks(report) {
    return [
        check('command report ok', report?.ok === true, 'command report must have ok=true'),
        check('command report scannedAt', hasText(report?.scannedAt), 'command report must include scannedAt'),
        check('command report source', hasText(report?.source), 'command report must include source path or artifact'),
        check('command report scanned files', Number(report?.scannedFiles) > 0, 'command report must scan at least one file'),
        check('no missing commands', Array.isArray(report?.missingCommands) && report.missingCommands.length === 0, 'missingCommands must be empty'),
        ...REQUIRED_TT_SYNC_COMMANDS.map(command => commandFoundCheck(report, command)),
    ];
}

function commandFoundCheck(report, command) {
    const item = Array.isArray(report?.commands)
        ? report.commands.find(commandReport => commandReport.name === command)
        : null;
    return check(`command ${command}`, Boolean(item?.found && item.files?.length), `${command} must have file evidence`);
}

function deployChecks(report) {
    const names = new Set((report?.checks || []).map(item => item.name));
    return [
        check('deploy report ok', report?.ok === true, 'deploy report must have ok=true'),
        check('deploy report verifiedAt', hasText(report?.verifiedAt), 'deploy report must include verifiedAt'),
        check('deploy report service path', hasText(report?.servicePath), 'deploy report must include servicePath'),
        check('deploy report env path', hasText(report?.envPath), 'deploy report must include envPath'),
        check('deploy report public URL', hasText(report?.publicUrl), 'deploy report must include publicUrl'),
        check('deploy report real env mode', report?.allowPlaceholders === false, 'final evidence deploy report must not allow placeholders'),
        ...REQUIRED_DEPLOY_CHECKS.map(name => check(`deploy ${name}`, names.has(name), `${name} check is required`)),
    ];
}

function smokeChecks(report) {
    const names = new Set((report?.checks || []).map(item => item.name));
    return [
        check('smoke report ok', report?.ok === true, 'smoke report must have ok=true'),
        check('smoke report completedAt', hasText(report?.completedAt), 'smoke report must include completedAt'),
        check('smoke report deviceId', hasText(report?.deviceId), 'smoke report must include paired deviceId'),
        check('smoke report path', hasText(report?.smokePath), 'smoke report must include smokePath'),
        check('smoke report plan ids', hasText(report?.planIds?.push) && hasText(report?.planIds?.pull), 'smoke report must include push and pull plan ids'),
        check('smoke report fixture files', hasPositiveInteger(report?.fixture?.fileCount), 'smoke report must include fixture.fileCount > 0'),
        check('smoke report fixture bytes', hasPositiveInteger(report?.fixture?.totalBytes), 'smoke report must include fixture.totalBytes > 0'),
        check('smoke report fixture paths', fixturePathsIncludePrimary(report), 'smoke report must include smokePaths containing smokePath'),
        check('smoke report is remote', report?.mode === 'remote', 'final evidence requires a remote deployed server smoke report'),
        check('smoke endpoint is non-local', isNonLocalEndpoint(report?.endpoint), 'smoke endpoint must not be localhost or loopback'),
        ...REQUIRED_SMOKE_CHECKS.map(name => check(`smoke ${name}`, names.has(name), `${name} check is required`)),
    ];
}

function deviceChecks(evidence) {
    return [
        check('device evidence testedAt', hasText(evidence?.testedAt), 'device evidence must include testedAt'),
        check('device evidence server URL', hasText(evidence?.server?.url), 'device evidence must include server.url'),
        check('mobile build id', hasText(evidence?.tauriTavern?.mobileBuildId), 'mobile build id is required'),
        check('desktop build id', hasText(evidence?.tauriTavern?.desktopBuildId), 'desktop build id is required'),
        check('device coverage', hasDeviceCoverage(evidence), 'at least Android phone and desktop device records are required'),
        ...REQUIRED_DEVICE_CHECKS.map(item => deviceCheck(evidence, item)),
    ];
}

function consistencyChecks(evidence) {
    return [
        check(
            'deploy and smoke same URL',
            sameEndpoint(evidence.deployReport?.publicUrl, evidence.smokeReport?.endpoint),
            'deploy publicUrl and smoke endpoint must match',
        ),
        check(
            'same server URL',
            sameEndpoint(evidence.smokeReport?.endpoint, evidence.deviceEvidence?.server?.url),
            'smoke endpoint and device evidence server.url must match',
        ),
    ];
}

function deviceCheck(evidence, item) {
    const [key, label, fieldSpecs] = item;
    const value = evidence?.checks?.[key];
    const fields = requiredFieldPaths(fieldSpecs).join(', ');
    return check(label, deviceCheckPasses(value, fieldSpecs), `${key} must be ok=true with evidence text and fields: ${fields}`);
}

function deviceCheckPasses(value, fieldSpecs) {
    if (value === true) {
        return false;
    }
    return value?.ok === true && hasText(value.evidence) && requiredFieldsPass(value, fieldSpecs);
}

function requiredFieldsPass(value, fieldSpecs) {
    return fieldSpecs.every(fieldSpec => fieldValuePasses(readPath(value, fieldSpec[0]), fieldSpec[1]));
}

function fieldValuePasses(value, type) {
    if (type === FIELD_POSITIVE_NUMBER) {
        return hasPositiveInteger(value);
    }
    if (type === FIELD_TEXT) {
        return hasText(value);
    }
    throw new Error(`Unknown evidence field type: ${type}`);
}

function readPath(object, pathValue) {
    return pathValue.split('.').reduce((value, key) => value?.[key], object);
}

function requiredFieldPaths(fieldSpecs) {
    return fieldSpecs.map(fieldSpec => fieldSpec[0]);
}

function hasDeviceCoverage(evidence) {
    const devices = Array.isArray(evidence?.devices) ? evidence.devices : [];
    return devices.some(isAndroidDevice) && devices.some(isDesktopDevice);
}

function isAndroidDevice(device) {
    return String(device.platform || '').toLowerCase().includes('android');
}

function isDesktopDevice(device) {
    const platform = String(device.platform || '').toLowerCase();
    return ['windows', 'macos', 'linux', 'desktop'].some(name => platform.includes(name));
}

function isNonLocalEndpoint(endpoint) {
    try {
        const host = new URL(endpoint).hostname.toLowerCase();
        return !['127.0.0.1', '::1', 'localhost'].includes(host);
    } catch {
        return false;
    }
}

function sameEndpoint(left, right) {
    const normalizedLeft = normalizeEndpoint(left);
    const normalizedRight = normalizeEndpoint(right);
    return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

function normalizeEndpoint(endpoint) {
    try {
        return new URL(endpoint).toString().replace(/\/$/, '');
    } catch {
        return '';
    }
}

function reportFor(checks) {
    const failed = checks.filter(item => !item.ok);
    return {
        checks,
        failed: failed.map(item => item.name),
        ok: failed.length === 0,
        verifiedAt: new Date().toISOString(),
    };
}

function check(name, ok, detail) {
    return { detail, name, ok: Boolean(ok) };
}

function hasText(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function hasPositiveInteger(value) {
    return Number.isInteger(value) && value > 0;
}

function fixturePathsIncludePrimary(report) {
    return Array.isArray(report?.smokePaths) && report.smokePaths.includes(report.smokePath);
}

function formatCheckLine(checkItem) {
    return `- ${checkItem.ok ? 'ok' : 'missing'} ${checkItem.name}: ${checkItem.detail}`;
}

function parseCliOptions() {
    return parseArgs({
        allowPositionals: false,
        options: {
            commands: { type: 'string' },
            deploy: { type: 'string' },
            'device-evidence': { type: 'string' },
            help: { short: 'h', type: 'boolean' },
            json: { type: 'boolean' },
            manifest: { type: 'string' },
            smoke: { type: 'string' },
        },
    }).values;
}

function usageText() {
    return [
        'Usage: node tools/verify-incremental-cloud-sync-evidence.js --commands <command-report.json> --deploy <deploy-report.json> --smoke <smoke-report.json> --device-evidence <device-evidence.json>',
        '',
        'Validates the external evidence needed to close docs/IncrementalCloudSyncPlan.md without accepting local-only proxy signals.',
    ].join('\n');
}

async function runCli() {
    try {
        const options = parseCliOptions();
        if (options.help) {
            console.log(usageText());
            return EXIT_SUCCESS;
        }
        const report = await verifyIncrementalCloudSyncEvidence(cliInput(options));
        await writeManifest({ manifestPath: options.manifest, report });
        writeOutput({ json: options.json, report });
        return report.ok ? EXIT_SUCCESS : EXIT_FAILURE;
    } catch (error) {
        console.error(error.message);
        return EXIT_FAILURE;
    }
}

function cliInput(options) {
    return {
        commandReportPath: options.commands,
        deployReportPath: options.deploy,
        deviceEvidencePath: options['device-evidence'],
        smokeReportPath: options.smoke,
    };
}

async function writeManifest(options) {
    if (!options.manifestPath) {
        return;
    }
    await writeFile(options.manifestPath, `${JSON.stringify(options.report, null, JSON_INDENT)}\n`);
}

function writeOutput(options) {
    if (options.json) {
        console.log(JSON.stringify(options.report, null, JSON_INDENT));
        return;
    }
    console.log(formatEvidenceReport(options.report));
}

function isCliEntry() {
    return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isCliEntry()) {
    process.exitCode = await runCli();
}
