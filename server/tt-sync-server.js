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

export function createTtSyncServer(options = {}) {
    const storage = new TtSyncStorage({
        rootDir: options.dataDir || process.env.TT_SYNC_DATA_DIR || DEFAULT_DATA_DIR,
    });
    return createListener(createHandler(storage), options);
}

export async function startServer(options = {}) {
    const host = options.host || process.env.TT_SYNC_HOST || DEFAULT_HOST;
    const port = Number(options.port ?? process.env.TT_SYNC_PORT ?? DEFAULT_PORT);
    const server = createTtSyncServer(options);
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
            server.off('error', reject);
            resolve();
        });
    });
    return { host, port: server.address().port, protocol: serverProtocol(options), server };
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
    const port = Number(options.port ?? process.env.TT_SYNC_PORT ?? DEFAULT_PORT);
    return `${serverProtocol(options)}://${host}:${port}`;
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
