import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startServer } from '../server/tt-sync-server.js';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_FIXTURE_FILE_BYTES = null;
const DEFAULT_FIXTURE_FILE_COUNT = 1;
const DEFAULT_DEVICE_PREFIX = 'smoke-device';
const DEFAULT_NAMESPACE_PREFIX = 'smoke';
const LOCAL_PORT = 0;
const MIN_FIXTURE_FILE_BYTES = 0;
const MIN_FIXTURE_FILE_COUNT = 1;
const SMOKE_RUN_ID_LENGTH = 12;
const TOKEN_ENV_NAME = 'TT_SYNC_PAIRING_TOKEN';

export async function createRuntime(input) {
    const runId = randomRunId();
    const options = normalizeOptions({ ...input, runId });
    if (options.local) {
        return createLocalRuntime(options);
    }
    return { ...options, endpoint: normalizeEndpoint(options.endpoint), mode: 'remote' };
}

export async function cleanupRuntime(runtime) {
    if (!runtime.cleanup) {
        return;
    }
    await new Promise(resolve => runtime.cleanup.server.close(resolve));
    await rm(runtime.cleanup.dataDir, { force: true, recursive: true });
    restorePairingToken(runtime.cleanup.previousToken);
}

function normalizeOptions(input) {
    const bulkFiles = parseIntegerOption({
        defaultValue: DEFAULT_FIXTURE_FILE_COUNT,
        label: '--bulk-files',
        minimum: MIN_FIXTURE_FILE_COUNT,
        value: input.bulkFiles,
    });
    const bulkFileBytes = parseIntegerOption({
        defaultValue: DEFAULT_FIXTURE_FILE_BYTES,
        label: '--bulk-file-bytes',
        minimum: MIN_FIXTURE_FILE_BYTES,
        value: input.bulkFileBytes,
    });
    const namespace = input.namespace || `${DEFAULT_NAMESPACE_PREFIX}-${input.runId}`;
    const deviceName = input.deviceName || `${DEFAULT_DEVICE_PREFIX}-${input.runId}`;
    const pairingToken = input.local ? '' : input.pairingToken || process.env[TOKEN_ENV_NAME] || '';
    assertRuntimeTarget({ endpoint: input.endpoint, local: input.local, pairingToken });
    return { ...input, bulkFileBytes, bulkFiles, deviceName, namespace, pairingToken, startedAt: new Date().toISOString() };
}

function assertRuntimeTarget(options) {
    if (options.local && options.endpoint) {
        throw new Error('Use either --local or --endpoint, not both');
    }
    if (!options.local && !options.endpoint) {
        throw new Error('Either --endpoint <url> or --local is required');
    }
    if (!options.local && !options.pairingToken) {
        throw new Error('--pairing-token or TT_SYNC_PAIRING_TOKEN is required for remote smoke');
    }
}

function parseIntegerOption(options) {
    if (options.value === undefined || options.value === null) {
        return options.defaultValue;
    }
    const value = integerOptionValue(options.value);
    if (!Number.isInteger(value) || value < options.minimum) {
        throw new Error(`${options.label} must be an integer >= ${options.minimum}`);
    }
    return value;
}

function integerOptionValue(value) {
    if (typeof value === 'number') {
        return value;
    }
    if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
        return Number(value);
    }
    return Number.NaN;
}

async function createLocalRuntime(options) {
    const dataDir = await mkdtemp(path.join(tmpdir(), 'tt-sync-smoke-'));
    const host = options.host || DEFAULT_HOST;
    const previousToken = process.env[TOKEN_ENV_NAME];
    const pairingToken = randomUUID();
    process.env[TOKEN_ENV_NAME] = pairingToken;
    try {
        const started = await startServer({ dataDir, host, port: LOCAL_PORT });
        return {
            ...options,
            cleanup: { dataDir, previousToken, server: started.server },
            endpoint: `http://${started.host}:${started.port}`,
            mode: 'local',
            pairingToken,
        };
    } catch (error) {
        restorePairingToken(previousToken);
        await rm(dataDir, { force: true, recursive: true });
        throw error;
    }
}

function restorePairingToken(previousToken) {
    if (previousToken === undefined) {
        delete process.env[TOKEN_ENV_NAME];
        return;
    }
    process.env[TOKEN_ENV_NAME] = previousToken;
}

function normalizeEndpoint(endpoint) {
    const parsed = new URL(endpoint);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('--endpoint must use http or https');
    }
    return parsed.toString().replace(/\/$/, '');
}

function randomRunId() {
    return randomUUID().replaceAll('-', '').slice(0, SMOKE_RUN_ID_LENGTH);
}
