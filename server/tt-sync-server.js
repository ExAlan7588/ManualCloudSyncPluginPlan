#!/usr/bin/env node
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHandler } from './lib/routes.js';
import { TtSyncStorage } from './lib/storage.js';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8787;
const DEFAULT_NAMESPACE = 'default';
const DEFAULT_DATA_DIR = '.tt-sync-data';

export function createTtSyncServer(options = {}) {
    const storage = new TtSyncStorage({
        rootDir: options.dataDir || process.env.TT_SYNC_DATA_DIR || DEFAULT_DATA_DIR,
    });
    return createServer(createHandler(storage));
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
    return { host, port: server.address().port, server };
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

    const { host, port } = await startServer();
    console.log(`Minimal TT-Sync server listening on http://${host}:${port}`);
}

function listenerUrl(options) {
    const host = options.host || process.env.TT_SYNC_HOST || DEFAULT_HOST;
    const port = Number(options.port ?? process.env.TT_SYNC_PORT ?? DEFAULT_PORT);
    return `http://${host}:${port}`;
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
    main().catch(error => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    });
}
