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

export const REQUIRED_DEVICE_CHECKS = Object.freeze([
    ['realLargeFirstSyncCompleted', 'real large first sync completed'],
    ['phoneDesktopPairingSaved', 'phone and desktop save paired server'],
    ['liveProgressBridgeVisible', 'live progress bridge visible in TauriTavern'],
    ['pullMtimePreserved', 'pull preserves local filesystem mtime'],
    ['pullInterruptionSafe', 'pull interruption keeps existing local files safe'],
    ['lanCloudSyncMutex', 'LAN Sync and cloud sync are mutually exclusive'],
    ['androidWeakNetworkErrorVisible', 'Android weak-network error is visible'],
]);

const EXIT_FAILURE = 1;
const EXIT_SUCCESS = 0;
const JSON_INDENT = 2;

export async function verifyIncrementalCloudSyncEvidence(options = {}) {
    const evidence = await loadEvidence(options);
    const checks = [
        ...commandChecks(evidence.commandReport),
        ...smokeChecks(evidence.smokeReport),
        ...deviceChecks(evidence.deviceEvidence),
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

function smokeChecks(report) {
    const names = new Set((report?.checks || []).map(item => item.name));
    return [
        check('smoke report ok', report?.ok === true, 'smoke report must have ok=true'),
        check('smoke report is remote', report?.mode === 'remote', 'final evidence requires a remote deployed server smoke report'),
        check('smoke endpoint is non-local', isNonLocalEndpoint(report?.endpoint), 'smoke endpoint must not be localhost or loopback'),
        ...REQUIRED_SMOKE_CHECKS.map(name => check(`smoke ${name}`, names.has(name), `${name} check is required`)),
    ];
}

function deviceChecks(evidence) {
    return [
        check('device evidence testedAt', hasText(evidence?.testedAt), 'device evidence must include testedAt'),
        check('mobile build id', hasText(evidence?.tauriTavern?.mobileBuildId), 'mobile build id is required'),
        check('desktop build id', hasText(evidence?.tauriTavern?.desktopBuildId), 'desktop build id is required'),
        check('device coverage', hasDeviceCoverage(evidence), 'at least Android phone and desktop device records are required'),
        ...REQUIRED_DEVICE_CHECKS.map(item => deviceCheck(evidence, item)),
    ];
}

function deviceCheck(evidence, item) {
    const [key, label] = item;
    const value = evidence?.checks?.[key];
    return check(label, deviceCheckPasses(value), `${key} must be ok=true with evidence text`);
}

function deviceCheckPasses(value) {
    if (value === true) {
        return false;
    }
    return value?.ok === true && hasText(value.evidence);
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

function formatCheckLine(checkItem) {
    return `- ${checkItem.ok ? 'ok' : 'missing'} ${checkItem.name}: ${checkItem.detail}`;
}

function parseCliOptions() {
    return parseArgs({
        allowPositionals: false,
        options: {
            commands: { type: 'string' },
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
        'Usage: node tools/verify-incremental-cloud-sync-evidence.js --commands <command-report.json> --smoke <smoke-report.json> --device-evidence <device-evidence.json>',
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
