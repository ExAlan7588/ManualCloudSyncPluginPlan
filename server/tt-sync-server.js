#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHandler } from './lib/routes.js';
import { TtSyncStorage } from './lib/storage.js';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8787;
const DEFAULT_NAMESPACE = 'default';
const DEFAULT_DATA_DIR = '.tt-sync-data';
const TLS_CERT_ENV = 'TT_SYNC_TLS_CERT_PATH';
const TLS_KEY_ENV = 'TT_SYNC_TLS_KEY_PATH';
const MIN_SERVER_PORT = 0;
const MAX_TCP_PORT = 65535;
const AUTO_PORT_RETRY_LIMIT = 16;
const SERVER_PORT_ERROR = `server port must be a decimal TCP port number from ${MIN_SERVER_PORT} to ${MAX_TCP_PORT}`;
// Keep auto-selected test/local ports usable by Fetch-based clients.
const FETCH_BLOCKED_PORTS = new Set([
    0, 1, 7, 9, 11, 13, 15, 17, 19, 20,
    21, 22, 23, 25, 37, 42, 43, 53, 69, 77,
    79, 87, 95, 101, 102, 103, 104, 109, 110, 111,
    113, 115, 117, 119, 123, 135, 137, 139, 143, 161,
    179, 389, 427, 465, 512, 513, 514, 515, 526, 530,
    531, 532, 540, 548, 554, 556, 563, 587, 601, 636,
    989, 990, 993, 995, 1719, 1720, 1723, 2049, 3659, 4045,
    4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669,
    6679, 6697, 10080,
]);

export function createTtSyncServer(options = {}) {
    const storage = new TtSyncStorage({
        rootDir: options.dataDir || process.env.TT_SYNC_DATA_DIR || DEFAULT_DATA_DIR,
    });
    return createListener(createHandler(storage), options);
}

export async function startServer(options = {}) {
    const host = options.host || process.env.TT_SYNC_HOST || DEFAULT_HOST;
    const port = serverPort(options);
    return startFetchCompatibleServer({ ...options, host, port });
}

async function startFetchCompatibleServer(options) {
    for (let attempt = 0; attempt < AUTO_PORT_RETRY_LIMIT; attempt += 1) {
        const started = await startServerAttempt(options);
        if (options.port !== MIN_SERVER_PORT || !FETCH_BLOCKED_PORTS.has(started.port)) {
            return started;
        }
        await closeServer(started.server);
    }
    throw new Error('server auto port selection repeatedly returned Fetch-blocked ports');
}

async function startServerAttempt(options) {
    const server = createTtSyncServer(options);
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(options.port, options.host, () => {
            server.off('error', reject);
            resolve();
        });
    });
    return {
        host: options.host,
        port: server.address().port,
        protocol: serverProtocol(options),
        server,
    };
}

async function closeServer(server) {
    await new Promise((resolve, reject) => {
        server.close(error => (error ? reject(error) : resolve()));
    });
}

export function buildPairingUri(options = {}) {
    const endpoint = options.endpoint || process.env.TT_SYNC_PUBLIC_URL || listenerUrl(options);
    const namespace = options.namespace || process.env.TT_SYNC_NAMESPACE || DEFAULT_NAMESPACE;
    const token = options.token || process.env.TT_SYNC_PAIRING_TOKEN || '';
    if (!token) {
        throw new Error('TT_SYNC_PAIRING_TOKEN is required to generate a pairing URI');
    }
    const uri = new URL('tt-sync://pair');
    uri.searchParams.set('endpoint', endpoint);
    uri.searchParams.set('namespace', namespace);
    uri.searchParams.set('token', token);
    return uri.toString();
}

async function main() {
    const command = process.argv[2] || 'serve';
    if (command === 'pair') {
        console.log(buildPairingUri());
        return;
    }
    if (command !== 'serve') {
        throw new Error(`Unknown command: ${command}`);
    }

    const { host, port, protocol } = await startServer();
    console.log(`Minimal TT-Sync server listening on ${protocol}://${host}:${port}`);
}

function listenerUrl(options) {
    const host = options.host || process.env.TT_SYNC_HOST || DEFAULT_HOST;
    const port = serverPort(options);
    return `${serverProtocol(options)}://${host}:${port}`;
}

function serverPort(options) {
    return parseServerPort(options.port ?? process.env.TT_SYNC_PORT ?? DEFAULT_PORT);
}

function parseServerPort(value) {
    const text = String(value ?? '').trim();
    if (!/^\d+$/.test(text)) {
        throw new Error(SERVER_PORT_ERROR);
    }
    const port = Number(text);
    if (!Number.isSafeInteger(port) || port < MIN_SERVER_PORT || port > MAX_TCP_PORT) {
        throw new Error(SERVER_PORT_ERROR);
    }
    return port;
}

function createListener(handler, options) {
    const tls = readTlsConfig(options);
    if (!tls.enabled) {
        return createHttpServer(handler);
    }
    return createHttpsServer({
        cert: readFileSync(tls.certPath),
        key: readFileSync(tls.keyPath),
    }, handler);
}

function serverProtocol(options) {
    return readTlsConfig(options).enabled ? 'https' : 'http';
}

function readTlsConfig(options) {
    const certPath = configValue(options.tlsCertPath, TLS_CERT_ENV);
    const keyPath = configValue(options.tlsKeyPath, TLS_KEY_ENV);
    if (!certPath && !keyPath) {
        return { enabled: false };
    }
    if (!certPath || !keyPath) {
        throw new Error(`${TLS_CERT_ENV} and ${TLS_KEY_ENV} must be set together`);
    }
    return { certPath, enabled: true, keyPath };
}

function configValue(optionValue, envName) {
    return String(optionValue ?? process.env[envName] ?? '').trim();
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
    main().catch(error => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    });
}
