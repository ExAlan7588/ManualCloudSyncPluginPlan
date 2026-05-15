#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const DEFAULT_ENV_PATH = 'deploy/systemd/manual-cloud-tt-sync.env.example';
const DEFAULT_SERVICE_PATH = 'deploy/systemd/manual-cloud-tt-sync.service';
const EXIT_FAILURE = 1;
const EXIT_SUCCESS = 0;
const JSON_INDENT = 2;
const REPORT_SCHEMA_VERSION = 1;
const REPORT_TOOL = 'verify-tt-sync-deploy';
const PLACEHOLDER_TOKENS = new Set(['change-me', 'replace-me', 'replace-with-strong-token']);
const REQUIRED_ENV_KEYS = Object.freeze([
    'TT_SYNC_DATA_DIR',
    'TT_SYNC_HOST',
    'TT_SYNC_PAIRING_TOKEN',
    'TT_SYNC_PORT',
    'TT_SYNC_PUBLIC_URL',
]);
const TLS_CERT_KEY = 'TT_SYNC_TLS_CERT_PATH';
const TLS_KEY_KEY = 'TT_SYNC_TLS_KEY_PATH';

export async function verifyTtSyncDeploy(options = {}) {
    const input = await loadInputs(options);
    const allowPlaceholders = Boolean(options.allowPlaceholders);
    const service = parseKeyValueLines(input.serviceText);
    const env = parseKeyValueLines(input.envText);
    const checks = [
        ...serviceChecks(service),
        ...envChecks({ allowPlaceholders, env }),
        ...consistencyChecks({ env, service }),
    ];
    return reportFor({
        allowPlaceholders,
        checks,
        envPath: input.envPath,
        publicUrl: firstValue(env, 'TT_SYNC_PUBLIC_URL'),
        servicePath: input.servicePath,
    });
}

export function formatDeployReport(report) {
    const lines = [
        `TT-Sync deploy verification ${report.ok ? 'passed' : 'failed'}`,
        `service: ${report.servicePath}`,
        `env: ${report.envPath}`,
        'checks:',
    ];
    lines.push(...report.checks.map(formatCheckLine));
    return lines.join('\n');
}

async function loadInputs(options) {
    const servicePath = options.servicePath || DEFAULT_SERVICE_PATH;
    const envPath = options.envPath || DEFAULT_ENV_PATH;
    return {
        envPath,
        envText: options.envText ?? await readFile(envPath, 'utf8'),
        servicePath,
        serviceText: options.serviceText ?? await readFile(servicePath, 'utf8'),
    };
}

function parseKeyValueLines(text) {
    return text
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'))
        .map(parseKeyValueLine)
        .filter(Boolean);
}

function parseKeyValueLine(line) {
    const index = line.indexOf('=');
    if (index < 0) {
        return null;
    }
    return { key: line.slice(0, index), ...parseValue(line.slice(index + 1)) };
}

function parseValue(rawValue) {
    const quote = quoteChar(rawValue);
    if (!quote) {
        return { quoteError: false, value: rawValue };
    }
    const isClosed = rawValue.length > 1 && rawValue.endsWith(quote);
    return {
        quoteError: !isClosed,
        value: isClosed ? rawValue.slice(1, -1) : rawValue,
    };
}

function quoteChar(value) {
    const first = value[0];
    return first === '"' || first === "'" ? first : '';
}

function serviceChecks(service) {
    return [
        check('service working directory', hasText(firstValue(service, 'WorkingDirectory')), 'WorkingDirectory must be set'),
        check('service environment file', hasText(firstValue(service, 'EnvironmentFile')), 'EnvironmentFile must be set'),
        check('service starts node server', startsNodeServer(service), 'ExecStart must run node server/tt-sync-server.js serve'),
        check('service restart policy', firstValue(service, 'Restart') === 'on-failure', 'Restart must be on-failure'),
        check('service user', hasText(firstValue(service, 'User')), 'User must be set'),
        check('service hardening no new privileges', firstValue(service, 'NoNewPrivileges') === 'true', 'NoNewPrivileges=true is required'),
        check('service hardening protect system', firstValue(service, 'ProtectSystem') === 'strict', 'ProtectSystem=strict is required'),
        check('service writable data path', wordsFor(service, 'ReadWritePaths').length > 0, 'ReadWritePaths must include TT_SYNC_DATA_DIR'),
    ];
}

function envChecks(options) {
    const tls = tlsValues(options.env);
    return [
        check('env quoted values are well formed', noQuoteErrors(options.env), 'quoted env values must use matching quotes'),
        ...REQUIRED_ENV_KEYS.map(key => check(`env ${key}`, hasText(firstValue(options.env, key)), `${key} must be set`)),
        check('env data dir is absolute', path.isAbsolute(firstValue(options.env, 'TT_SYNC_DATA_DIR')), 'TT_SYNC_DATA_DIR must be absolute'),
        check('env public URL', isHttpUrl(firstValue(options.env, 'TT_SYNC_PUBLIC_URL')), 'TT_SYNC_PUBLIC_URL must be http or https'),
        check('env port', isValidPort(firstValue(options.env, 'TT_SYNC_PORT')), 'TT_SYNC_PORT must be a TCP port number'),
        ...tlsChecks(tls, firstValue(options.env, 'TT_SYNC_PUBLIC_URL')),
        check('env pairing token is not placeholder', tokenAllowed(options), 'TT_SYNC_PAIRING_TOKEN must not be a placeholder in real env files'),
    ];
}

function startsNodeServer(service) {
    const command = firstValue(service, 'ExecStart');
    return command.includes('node') && command.includes('server/tt-sync-server.js') && command.includes('serve');
}

function consistencyChecks(options) {
    const dataDir = firstValue(options.env, 'TT_SYNC_DATA_DIR');
    const writablePaths = wordsFor(options.service, 'ReadWritePaths');
    return [
        check('service can write data dir', pathCoveredBy({ dataDir, writablePaths }), 'ReadWritePaths must cover TT_SYNC_DATA_DIR'),
    ];
}

function firstValue(entries, key) {
    return valuesFor(entries, key)[0] || '';
}

function valuesFor(entries, key) {
    return entries.filter(entry => entry.key === key).map(entry => entry.value);
}

function noQuoteErrors(entries) {
    return entries.every(entry => entry.quoteError !== true);
}

function wordsFor(entries, key) {
    return valuesFor(entries, key).flatMap(value => value.split(/\s+/).filter(Boolean));
}

function isHttpUrl(value) {
    try {
        return ['http:', 'https:'].includes(new URL(value).protocol);
    } catch {
        return false;
    }
}

function isValidPort(value) {
    const port = Number(value);
    return Number.isInteger(port) && port > 0 && port <= 65535;
}

function tlsChecks(tls, publicUrl) {
    if (!tls.hasAny) {
        return [];
    }
    return [
        check('env TLS cert and key are paired', hasText(tls.certPath) && hasText(tls.keyPath), `${TLS_CERT_KEY} and ${TLS_KEY_KEY} must be set together`),
        check('env TLS cert path is absolute', path.isAbsolute(tls.certPath), `${TLS_CERT_KEY} must be absolute when set`),
        check('env TLS key path is absolute', path.isAbsolute(tls.keyPath), `${TLS_KEY_KEY} must be absolute when set`),
        check('env TLS public URL is HTTPS', urlProtocol(publicUrl) === 'https:', 'TT_SYNC_PUBLIC_URL must be https when server TLS is enabled'),
    ];
}

function tlsValues(env) {
    const certPath = firstValue(env, TLS_CERT_KEY);
    const keyPath = firstValue(env, TLS_KEY_KEY);
    return { certPath, hasAny: hasText(certPath) || hasText(keyPath), keyPath };
}

function urlProtocol(value) {
    try {
        return new URL(value).protocol;
    } catch {
        return '';
    }
}

function tokenAllowed(options) {
    const token = firstValue(options.env, 'TT_SYNC_PAIRING_TOKEN');
    return hasText(token) && (options.allowPlaceholders || !PLACEHOLDER_TOKENS.has(token));
}

function pathCoveredBy(options) {
    const dataDir = normalizeAbsolutePath(options.dataDir);
    return options.writablePaths.some(item => pathCovers({ dataDir, item }));
}

function pathCovers(options) {
    const writablePath = normalizeAbsolutePath(options.item);
    return Boolean(writablePath && dataDirWithin({ dataDir: options.dataDir, writablePath }));
}

function dataDirWithin(options) {
    return options.dataDir === options.writablePath || options.dataDir.startsWith(`${options.writablePath}${path.sep}`);
}

function normalizeAbsolutePath(value) {
    return path.isAbsolute(value || '') ? path.resolve(value) : '';
}

function reportFor(options) {
    const failed = options.checks.filter(item => !item.ok);
    return {
        allowPlaceholders: options.allowPlaceholders,
        checks: options.checks,
        envPath: options.envPath,
        failed: failed.map(item => item.name),
        ok: failed.length === 0,
        publicUrl: options.publicUrl,
        schemaVersion: REPORT_SCHEMA_VERSION,
        servicePath: options.servicePath,
        tool: REPORT_TOOL,
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
            'allow-placeholders': { type: 'boolean' },
            env: { type: 'string' },
            help: { short: 'h', type: 'boolean' },
            json: { type: 'boolean' },
            manifest: { type: 'string' },
            service: { type: 'string' },
        },
    }).values;
}

function usageText() {
    return [
        'Usage: node tools/verify-tt-sync-deploy.js --service <unit> --env <env-file>',
        '       node tools/verify-tt-sync-deploy.js --allow-placeholders',
        '',
        'Validates TT-Sync systemd and env deployment files without printing secret values.',
    ].join('\n');
}

async function runCli() {
    try {
        const options = parseCliOptions();
        if (options.help) {
            console.log(usageText());
            return EXIT_SUCCESS;
        }
        const report = await verifyTtSyncDeploy(cliInput(options));
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
        allowPlaceholders: options['allow-placeholders'],
        envPath: options.env,
        servicePath: options.service,
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
    console.log(formatDeployReport(options.report));
}

function isCliEntry() {
    return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isCliEntry()) {
    process.exitCode = await runCli();
}
