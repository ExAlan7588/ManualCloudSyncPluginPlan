#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { REQUIRED_DEVICE_CHECKS } from './verify-incremental-cloud-sync-evidence.js';

const DEFAULT_ANDROID_PLATFORM = 'Android';
const DEFAULT_DESKTOP_PLATFORM = 'desktop';
const EXIT_FAILURE = 1;
const EXIT_SUCCESS = 0;
const JSON_INDENT = 2;

export function createDeviceEvidenceTemplate(options = {}) {
    const checks = Object.fromEntries(REQUIRED_DEVICE_CHECKS.map(deviceCheckTemplate));
    applyReportReferences({
        checks,
        desktopCommandReport: options.desktopCommandReport,
        eventSurfaceReport: options.eventSurfaceReport,
        mobileCommandReport: options.mobileCommandReport,
    });
    return {
        checks,
        devices: [
            {
                deviceId: '',
                model: options.androidModel || '',
                platform: options.androidPlatform || DEFAULT_ANDROID_PLATFORM,
            },
            {
                deviceId: '',
                model: options.desktopModel || '',
                platform: options.desktopPlatform || DEFAULT_DESKTOP_PLATFORM,
            },
        ],
        server: {
            url: options.serverUrl || '',
        },
        tauriTavern: {
            desktopBuildId: options.desktopBuildId || '',
            mobileBuildId: options.mobileBuildId || '',
        },
        testedAt: new Date().toISOString(),
    };
}

function applyReportReferences(options) {
    const check = options.checks.commandContractVerified;
    if (!check) {
        return;
    }
    if (options.mobileCommandReport) {
        check.mobileCommandReport = reportReference(options.mobileCommandReport);
    }
    if (options.desktopCommandReport) {
        check.desktopCommandReport = reportReference(options.desktopCommandReport);
    }
    if (options.eventSurfaceReport) {
        check.eventSurfaceReport = reportReference(options.eventSurfaceReport);
    }
}

function reportReference(report) {
    return {
        scannedAt: report.scannedAt || '',
        source: report.source || '',
        sourceKind: report.sourceKind || '',
    };
}

function deviceCheckTemplate(item) {
    const [key, label, fieldSpecs] = item;
    return [key, { evidence: '', ok: false, requiredEvidence: label, requiredFields: requiredFieldPaths(fieldSpecs) }];
}

function requiredFieldPaths(fieldSpecs) {
    return fieldSpecs.map(fieldSpec => fieldSpec[0]);
}

function parseCliOptions() {
    return parseArgs({
        allowPositionals: false,
        options: {
            'android-model': { type: 'string' },
            'android-platform': { type: 'string' },
            'desktop-build-id': { type: 'string' },
            'desktop-command-report': { type: 'string' },
            'desktop-model': { type: 'string' },
            'desktop-platform': { type: 'string' },
            'event-report': { type: 'string' },
            help: { short: 'h', type: 'boolean' },
            json: { type: 'boolean' },
            'mobile-build-id': { type: 'string' },
            'mobile-command-report': { type: 'string' },
            output: { short: 'o', type: 'string' },
            'server-url': { type: 'string' },
        },
    }).values;
}

function usageText() {
    return [
        'Usage: node tools/create-device-evidence-template.js --output <device-evidence.json>',
        '',
        'Creates a device evidence JSON template with every required check set to ok=false.',
        'Optional report inputs copy source/scannedAt/sourceKind references without marking evidence complete.',
    ].join('\n');
}

async function runCli() {
    try {
        const options = parseCliOptions();
        if (options.help) {
            console.log(usageText());
            return EXIT_SUCCESS;
        }
        const template = createDeviceEvidenceTemplate(await cliInput(options));
        await writeTemplate({ outputPath: options.output, template });
        if (options.json || !options.output) {
            console.log(JSON.stringify(template, null, JSON_INDENT));
        }
        return EXIT_SUCCESS;
    } catch (error) {
        console.error(error.message);
        return EXIT_FAILURE;
    }
}

async function cliInput(options) {
    const reports = await cliReportInputs(options);
    return {
        androidModel: options['android-model'],
        androidPlatform: options['android-platform'],
        desktopBuildId: options['desktop-build-id'],
        desktopCommandReport: reports.desktopCommandReport,
        desktopModel: options['desktop-model'],
        desktopPlatform: options['desktop-platform'],
        eventSurfaceReport: reports.eventSurfaceReport,
        mobileCommandReport: reports.mobileCommandReport,
        mobileBuildId: options['mobile-build-id'],
        serverUrl: options['server-url'],
    };
}

async function cliReportInputs(options) {
    return {
        desktopCommandReport: await readReportOption({
            label: 'desktop command report',
            path: options['desktop-command-report'],
        }),
        eventSurfaceReport: await readReportOption({
            label: 'event report',
            path: options['event-report'],
        }),
        mobileCommandReport: await readReportOption({
            label: 'mobile command report',
            path: options['mobile-command-report'],
        }),
    };
}

async function readReportOption(options) {
    if (!options.path) {
        return undefined;
    }
    try {
        return JSON.parse(await readFile(options.path, 'utf8'));
    } catch (error) {
        throw new Error(`${options.label} must be readable JSON: ${error.message}`);
    }
}

async function writeTemplate(options) {
    if (!options.outputPath) {
        return;
    }
    await writeFile(options.outputPath, `${JSON.stringify(options.template, null, JSON_INDENT)}\n`);
}

function isCliEntry() {
    return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isCliEntry()) {
    process.exitCode = await runCli();
}
