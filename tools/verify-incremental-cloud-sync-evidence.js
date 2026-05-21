#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import {
    EXIT_FAILURE,
    EXIT_SUCCESS,
    isCliEntry,
    writeFormattedOutput,
    writeOptionalJsonFile,
} from './cli-helpers.js';
import { evidenceReportFor, formatCheckLine, incrementalEvidenceChecks } from './incremental-evidence-checks.js';
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

export async function verifyIncrementalCloudSyncEvidence(options = {}) {
    const evidence = await loadEvidence(options);
    return evidenceReportFor(incrementalEvidenceChecks(evidence));
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
    } catch (error) {
        throw new Error(`${options.label} must be valid JSON: ${error.message}: ${options.path}`);
    }
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
        await writeOptionalJsonFile({ filePath: options.manifest, value: report });
        writeFormattedOutput({ format: formatEvidenceReport, json: options.json, value: report });
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

if (isCliEntry(import.meta.url)) {
    process.exitCode = await runCli();
}
