#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { REQUIRED_TT_SYNC_COMMANDS } from './verify-tauritavern-tt-sync.js';
import {
    REQUIRED_TT_SYNC_DIFF_CONFLICT_SURFACES,
    REQUIRED_TT_SYNC_EVENTS,
} from './verify-tauritavern-tt-sync-events.js';
import {
    FIELD_NON_NEGATIVE_NUMBER,
    FIELD_POSITIVE_NUMBER,
    FIELD_TEXT,
    FIELD_TEXT_ARRAY,
    FIELD_TIMESTAMP,
    REQUIRED_DEPLOY_CHECKS,
    REQUIRED_DEVICE_CHECKS,
    REQUIRED_SMOKE_CHECKS,
} from './incremental-evidence-schema.js';
export {
    FIELD_NON_NEGATIVE_NUMBER,
    FIELD_POSITIVE_NUMBER,
    FIELD_TEXT,
    FIELD_TEXT_ARRAY,
    FIELD_TIMESTAMP,
    REQUIRED_DEPLOY_CHECKS,
    REQUIRED_DEVICE_CHECKS,
    REQUIRED_SMOKE_CHECKS,
} from './incremental-evidence-schema.js';
const MIN_REAL_LARGE_SYNC_BYTES = 300 * 1024 * 1024;

const EXIT_FAILURE = 1;
const EXIT_SUCCESS = 0;
const JSON_INDENT = 2;
const TRUSTED_COMMAND_EVIDENCE_KINDS = new Set([
    'build-artifact-string',
    'tauri-command-declaration',
    'tauri-handler-registration',
]);
const COMMAND_SOURCE_KINDS = new Set(['build-artifact', 'source-file', 'source-tree']);
const FINAL_EVENT_SOURCE_KIND = 'source-tree';
const FINAL_COMMAND_SOURCE_KIND = 'build-artifact';

export async function verifyIncrementalCloudSyncEvidence(options = {}) {
    const evidence = await loadEvidence(options);
    const checks = [
        ...commandChecks(evidence.mobileCommandReport, 'mobile'),
        ...commandChecks(evidence.desktopCommandReport, 'desktop'),
        ...eventChecks(evidence.eventReport),
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
        mobileCommandReport: await loadReport({ label: 'mobile command report', object: options.mobileCommandReport, path: options.mobileCommandReportPath }),
        desktopCommandReport: await loadReport({ label: 'desktop command report', object: options.desktopCommandReport, path: options.desktopCommandReportPath }),
        eventReport: await loadReport({ label: 'event surface report', object: options.eventReport, path: options.eventReportPath }),
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
    return parseReportJson({ ...options, text: await readReportFile(options) });
}

async function readReportFile(options) {
    try {
        return await readFile(options.path, 'utf8');
    } catch (error) {
        throw new Error(`${options.label} cannot be read: ${options.path}: ${error.message}`);
    }
}

function parseReportJson(options) {
    try {
        return JSON.parse(options.text);
    } catch {
        throw new Error(`${options.label} must be valid JSON: ${options.path}`);
    }
}

function commandChecks(report, target) {
    return [
        check(`${target} command report ok`, report?.ok === true, `${target} command report must have ok=true`),
        check(`${target} command report scannedAt`, isTimestamp(report?.scannedAt), `${target} command report must include a parseable scannedAt timestamp`),
        check(`${target} command report source`, hasText(report?.source), `${target} command report must include source path or artifact`),
        check(`${target} command report source kind`, COMMAND_SOURCE_KINDS.has(report?.sourceKind), `${target} command report must include sourceKind`),
        check(`${target} command report is build artifact`, report?.sourceKind === FINAL_COMMAND_SOURCE_KIND, `${target} command report must come from an actual build artifact`),
        check(`${target} command report scanned files`, Number(report?.scannedFiles) > 0, `${target} command report must scan at least one file`),
        check(`${target} no missing commands`, Array.isArray(report?.missingCommands) && report.missingCommands.length === 0, `${target} missingCommands must be empty`),
        ...REQUIRED_TT_SYNC_COMMANDS.map(command => commandFoundCheck(report, command, target)),
    ];
}

function commandFoundCheck(report, command, target) {
    const item = Array.isArray(report?.commands)
        ? report.commands.find(commandReport => commandReport.name === command)
        : null;
    return check(
        `${target} command ${command}`,
        Boolean(item?.found && commandEvidenceCoversCommand(trustedCommandEvidence(item), report?.sourceKind)),
        `${target} ${command} must have evidence compatible with command report sourceKind`,
    );
}

function eventChecks(report) {
    const names = passedEventNames(report);
    return [
        check('event surface report ok', report?.ok === true, 'event surface report must have ok=true'),
        check('event surface report scannedAt', isTimestamp(report?.scannedAt), 'event surface report must include a parseable scannedAt timestamp'),
        check('event surface report source', hasText(report?.source), 'event surface report must include source path or artifact'),
        check('event surface report source kind', COMMAND_SOURCE_KINDS.has(report?.sourceKind), 'event surface report must include sourceKind'),
        check('event surface report is source tree', report?.sourceKind === FINAL_EVENT_SOURCE_KIND, 'final evidence event surface report must scan the TauriTavern source tree'),
        check('event surface report scanned files', Number(report?.scannedFiles) > 0, 'event surface report must scan at least one file'),
        check('event surface missing events', Array.isArray(report?.missingEvents) && report.missingEvents.length === 0, 'missingEvents must be empty'),
        check('event surface missing fields', Array.isArray(report?.missingPayloadFields) && report.missingPayloadFields.length === 0, 'missingPayloadFields must be empty'),
        ...REQUIRED_TT_SYNC_EVENTS.map(name => check(`event ${name}`, names.has(name), `${name} event is required`)),
        ...REQUIRED_TT_SYNC_DIFF_CONFLICT_SURFACES.map(name => diffConflictSurfaceCheck(report, name)),
    ];
}

function diffConflictSurfaceCheck(report, name) {
    const item = report?.diffConflictSurface?.[name];
    return check(
        `event surface ${name}`,
        item?.found === true && Array.isArray(item.files) && item.files.length > 0,
        `${name} is required for final diff/conflict UI evidence`,
    );
}

function passedEventNames(report) {
    return new Set(Array.isArray(report?.events) ? report.events.filter(isPassedReportEvent).map(item => item.name) : []);
}

function isPassedReportEvent(item) {
    return item?.found === true && hasText(item.name) && Array.isArray(item.files) && item.files.length > 0;
}

function trustedCommandEvidence(item) {
    if (!Array.isArray(item?.evidence)) {
        return [];
    }
    return item.evidence.filter(entry => hasText(entry?.file) && TRUSTED_COMMAND_EVIDENCE_KINDS.has(entry?.kind));
}

function commandEvidenceCoversCommand(evidence, sourceKind) {
    const kinds = new Set(evidence.map(item => item.kind));
    if (sourceKind === 'build-artifact') {
        return kinds.has('build-artifact-string');
    }
    if (sourceKind === 'source-tree' || sourceKind === 'source-file') {
        return kinds.has('tauri-command-declaration') && kinds.has('tauri-handler-registration');
    }
    return false;
}

function deployChecks(report) {
    const names = passedCheckNames(report);
    return [
        check('deploy report ok', report?.ok === true, 'deploy report must have ok=true'),
        check('deploy report verifiedAt', isTimestamp(report?.verifiedAt), 'deploy report must include a parseable verifiedAt timestamp'),
        check('deploy report service path', hasText(report?.servicePath), 'deploy report must include servicePath'),
        check('deploy report env path', hasText(report?.envPath), 'deploy report must include envPath'),
        check('deploy report public URL', hasText(report?.publicUrl), 'deploy report must include publicUrl'),
        check('deploy report real env mode', report?.allowPlaceholders === false, 'final evidence deploy report must not allow placeholders'),
        check('deploy report checks passed', reportChecksPassed(report), 'deploy report checks must all be ok=true with name and detail'),
        ...REQUIRED_DEPLOY_CHECKS.map(name => check(`deploy ${name}`, names.has(name), `${name} check is required`)),
    ];
}

function smokeChecks(report) {
    const names = passedCheckNames(report);
    return [
        check('smoke report ok', report?.ok === true, 'smoke report must have ok=true'),
        check('smoke report completedAt', isTimestamp(report?.completedAt), 'smoke report must include a parseable completedAt timestamp'),
        check('smoke report deviceId', hasText(report?.deviceId), 'smoke report must include paired deviceId'),
        check('smoke report serverId', hasText(report?.serverId), 'smoke report must include paired serverId'),
        check('smoke report path', hasText(report?.smokePath), 'smoke report must include smokePath'),
        check('smoke report plan ids', hasText(report?.planIds?.push) && hasText(report?.planIds?.pull), 'smoke report must include push and pull plan ids'),
        check('smoke report fixture files', hasPositiveInteger(report?.fixture?.fileCount), 'smoke report must include fixture.fileCount > 0'),
        check('smoke report fixture bytes', hasPositiveInteger(report?.fixture?.totalBytes), 'smoke report must include fixture.totalBytes > 0'),
        check('smoke report fixture paths', fixturePathsIncludePrimary(report), 'smoke report must include smokePaths containing smokePath'),
        check('smoke report is remote', report?.mode === 'remote', 'final evidence requires a remote deployed server smoke report'),
        check('smoke endpoint is non-local', isNonLocalEndpoint(report?.endpoint), 'smoke endpoint must not be localhost or loopback'),
        check('smoke status version', hasText(report?.status?.version), 'smoke report must include status.version'),
        check('smoke report checks passed', reportChecksPassed(report), 'smoke report checks must all be ok=true with name and detail'),
        ...REQUIRED_SMOKE_CHECKS.map(name => check(`smoke ${name}`, names.has(name), `${name} check is required`)),
    ];
}

function deviceChecks(evidence) {
    return [
        check('device evidence testedAt', isTimestamp(evidence?.testedAt), 'device evidence must include a parseable testedAt timestamp'),
        check('device evidence server URL', hasText(evidence?.server?.url), 'device evidence must include server.url'),
        check('mobile build id', hasText(evidence?.tauriTavern?.mobileBuildId), 'mobile build id is required'),
        check('desktop build id', hasText(evidence?.tauriTavern?.desktopBuildId), 'desktop build id is required'),
        check('device coverage', hasDeviceCoverage(evidence), 'at least Android phone and desktop device records with deviceId are required'),
        ...REQUIRED_DEVICE_CHECKS.map(item => deviceCheck(evidence, item)),
    ];
}

function consistencyChecks(evidence) {
    return [
        ...commandEvidenceConsistencyChecks(evidence),
        ...serverConsistencyChecks(evidence),
        ...deviceSemanticConsistencyChecks(evidence),
    ];
}

function commandEvidenceConsistencyChecks(evidence) {
    return [
        ...commandReportReferenceChecks({ report: evidence.mobileCommandReport, target: 'mobile', deviceEvidence: evidence.deviceEvidence }),
        ...commandReportReferenceChecks({ report: evidence.desktopCommandReport, target: 'desktop', deviceEvidence: evidence.deviceEvidence }),
        ...eventReportReferenceChecks(evidence),
        check(
            'command contract covers required commands',
            arrayIncludesAllTexts(deviceCheckValue(evidence, 'commandContractVerified', 'contract.commands'), REQUIRED_TT_SYNC_COMMANDS),
            'commandContractVerified.contract.commands must include every required tt_sync command',
        ),
    ];
}

function commandReportReferenceChecks(options) {
    const reference = options.deviceEvidence?.checks?.commandContractVerified?.[`${options.target}CommandReport`];
    return [
        check(
            `same ${options.target} command report source`,
            sameText(options.report?.source, reference?.source),
            `${options.target} command report source and device evidence reference must match`,
        ),
        check(
            `same ${options.target} command report scannedAt`,
            sameText(options.report?.scannedAt, reference?.scannedAt),
            `${options.target} command report scannedAt and device evidence reference must match`,
        ),
        check(
            `same ${options.target} command report sourceKind`,
            sameText(options.report?.sourceKind, reference?.sourceKind),
            `${options.target} command report sourceKind and device evidence reference must match`,
        ),
    ];
}

function eventReportReferenceChecks(evidence) {
    const reference = evidence.deviceEvidence?.checks?.commandContractVerified?.eventSurfaceReport;
    return [
        check('same event report source', sameText(evidence.eventReport?.source, reference?.source), 'event surface report source and device evidence reference must match'),
        check('same event report scannedAt', sameText(evidence.eventReport?.scannedAt, reference?.scannedAt), 'event surface report scannedAt and device evidence reference must match'),
        check('same event report sourceKind', sameText(evidence.eventReport?.sourceKind, reference?.sourceKind), 'event surface report sourceKind and device evidence reference must match'),
    ];
}

function serverConsistencyChecks(evidence) {
    return [
        check(
            'real large sync byte target',
            Number(deviceCheckValue(evidence, 'realLargeFirstSyncCompleted', 'metrics.totalBytes')) >= MIN_REAL_LARGE_SYNC_BYTES,
            'realLargeFirstSyncCompleted.metrics.totalBytes must be at least 300MiB',
        ),
        check(
            'phone saved server URL matches',
            sameEndpoint(deviceCheckValue(evidence, 'phoneDesktopPairingSaved', 'phone.savedServerUrl'), evidence.deviceEvidence?.server?.url),
            'phoneDesktopPairingSaved.phone.savedServerUrl must match device evidence server.url',
        ),
        check(
            'desktop saved server URL matches',
            sameEndpoint(deviceCheckValue(evidence, 'phoneDesktopPairingSaved', 'desktop.savedServerUrl'), evidence.deviceEvidence?.server?.url),
            'phoneDesktopPairingSaved.desktop.savedServerUrl must match device evidence server.url',
        ),
        check(
            'phone saved server id matches',
            sameText(deviceCheckValue(evidence, 'phoneDesktopPairingSaved', 'phone.savedServerId'), evidence.smokeReport?.serverId),
            'phoneDesktopPairingSaved.phone.savedServerId must match smoke report serverId',
        ),
        check(
            'desktop saved server id matches',
            sameText(deviceCheckValue(evidence, 'phoneDesktopPairingSaved', 'desktop.savedServerId'), evidence.smokeReport?.serverId),
            'phoneDesktopPairingSaved.desktop.savedServerId must match smoke report serverId',
        ),
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

function deviceSemanticConsistencyChecks(evidence) {
    return [
        check(
            'pull mtime values match',
            sameNumber(deviceCheckValue(evidence, 'pullMtimePreserved', 'mtime.expectedModifiedMs'), deviceCheckValue(evidence, 'pullMtimePreserved', 'mtime.actualModifiedMs')),
            'pullMtimePreserved expectedModifiedMs and actualModifiedMs must match',
        ),
        check(
            'interruption hash unchanged',
            sameText(deviceCheckValue(evidence, 'pullInterruptionSafe', 'interruption.beforeHash'), deviceCheckValue(evidence, 'pullInterruptionSafe', 'interruption.afterHash')),
            'pullInterruptionSafe beforeHash and afterHash must match',
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
    if (type === FIELD_NON_NEGATIVE_NUMBER) {
        return hasNonNegativeInteger(value);
    }
    if (type === FIELD_TEXT) {
        return hasText(value);
    }
    if (type === FIELD_TEXT_ARRAY) {
        return Array.isArray(value) && value.length > 0 && value.every(hasText);
    }
    if (type === FIELD_TIMESTAMP) {
        return isTimestamp(value);
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
    return devices.some(isCoveredAndroidDevice) && devices.some(isCoveredDesktopDevice);
}

function isCoveredAndroidDevice(device) {
    return hasText(device?.deviceId) && isAndroidDevice(device);
}

function isCoveredDesktopDevice(device) {
    return hasText(device?.deviceId) && isDesktopDevice(device);
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

function sameText(left, right) {
    return hasText(left) && hasText(right) && left.trim() === right.trim();
}

function sameNumber(left, right) {
    return Number.isFinite(left) && Number.isFinite(right) && left === right;
}

function arrayIncludesAllTexts(values, requiredValues) {
    if (!Array.isArray(values)) {
        return false;
    }
    const normalized = new Set(values.filter(hasText).map(value => value.trim()));
    return requiredValues.every(value => normalized.has(value));
}

function deviceCheckValue(evidence, checkKey, pathValue) {
    return readPath(evidence.deviceEvidence?.checks?.[checkKey], pathValue);
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

function isTimestamp(value) {
    return hasText(value) && Number.isFinite(Date.parse(value));
}

function hasPositiveInteger(value) {
    return Number.isInteger(value) && value > 0;
}

function hasNonNegativeInteger(value) {
    return Number.isInteger(value) && value >= 0;
}

function fixturePathsIncludePrimary(report) {
    return Array.isArray(report?.smokePaths) && report.smokePaths.includes(report.smokePath);
}

function passedCheckNames(report) {
    return new Set(reportChecks(report).filter(isPassedReportCheck).map(item => item.name));
}

function reportChecksPassed(report) {
    const checks = reportChecks(report);
    return checks.length > 0 && checks.every(isPassedReportCheck);
}

function reportChecks(report) {
    return Array.isArray(report?.checks) ? report.checks : [];
}

function isPassedReportCheck(item) {
    return item?.ok === true && hasText(item.name) && hasText(item.detail);
}

function formatCheckLine(checkItem) {
    return `- ${checkItem.ok ? 'ok' : 'missing'} ${checkItem.name}: ${checkItem.detail}`;
}

function parseCliOptions() {
    return parseArgs({
        allowPositionals: false,
        options: {
            'desktop-commands': { type: 'string' },
            events: { type: 'string' },
            'mobile-commands': { type: 'string' },
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
        'Usage: node tools/verify-incremental-cloud-sync-evidence.js --mobile-commands <mobile-command-report.json> --desktop-commands <desktop-command-report.json> --events <event-report.json> --deploy <deploy-report.json> --smoke <smoke-report.json> --device-evidence <device-evidence.json> --manifest <final-evidence-report.json>',
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
        desktopCommandReportPath: options['desktop-commands'],
        eventReportPath: options.events,
        mobileCommandReportPath: options['mobile-commands'],
        deployReportPath: options.deploy,
        deviceEvidencePath: options['device-evidence'],
        smokeReportPath: options.smoke,
    };
}

export async function writeManifest(options) {
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
