#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
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
    return {
        checks: Object.fromEntries(REQUIRED_DEVICE_CHECKS.map(deviceCheckTemplate)),
        devices: [
            {
                model: options.androidModel || '',
                platform: options.androidPlatform || DEFAULT_ANDROID_PLATFORM,
            },
            {
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
            'desktop-model': { type: 'string' },
            'desktop-platform': { type: 'string' },
            help: { short: 'h', type: 'boolean' },
            json: { type: 'boolean' },
            'mobile-build-id': { type: 'string' },
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
    ].join('\n');
}

async function runCli() {
    try {
        const options = parseCliOptions();
        if (options.help) {
            console.log(usageText());
            return EXIT_SUCCESS;
        }
        const template = createDeviceEvidenceTemplate(cliInput(options));
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

function cliInput(options) {
    return {
        androidModel: options['android-model'],
        androidPlatform: options['android-platform'],
        desktopBuildId: options['desktop-build-id'],
        desktopModel: options['desktop-model'],
        desktopPlatform: options['desktop-platform'],
        mobileBuildId: options['mobile-build-id'],
        serverUrl: options['server-url'],
    };
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
