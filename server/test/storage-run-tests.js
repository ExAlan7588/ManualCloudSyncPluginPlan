import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { TtSyncStorage } from '../lib/storage.js';

await testCommitPlanRejectsStaleSnapshot();
await testWriteNamespaceSurfacesMalformedManifest();
await testCommitPlanSurfacesUnexpectedStagedStatErrors();
console.log('ok - storage commit rejects stale snapshots and surfaces malformed manifests');

async function testCommitPlanRejectsStaleSnapshot() {
    await withStorage(async storage => {
        const plan = {
            committedAt: '',
            conflicts: [],
            deviceId: 'device-1',
            downloads: [],
            id: 'plan-1',
            kind: 'pull',
            localDeletes: [],
            namespace: 'default',
            remoteDeletes: [],
            staged: {},
            uploads: [],
        };
        await storage.savePlan(plan);
        await storage.writeNamespace('default', await storage.createNamespace('default'));

        const firstSnapshot = await storage.readPlan(plan.id);
        const staleSnapshot = await storage.readPlan(plan.id);
        const first = await storage.commitPlan(firstSnapshot, {});
        assert.ok(first.committedAt, 'first commit should succeed');
        await assert.rejects(
            storage.commitPlan(staleSnapshot, {}),
            /Plan already committed: plan-1/,
        );
    });
}

async function testWriteNamespaceSurfacesMalformedManifest() {
    await withStorage(async storage => {
        await storage.writeNamespace('default', await storage.createNamespace('default'));
        const manifestPath = storage.manifestPath('default');
        await writeFile(manifestPath, '{ broken');

        await assert.rejects(
            storage.writeNamespace('default', await storage.readNamespace('default')),
            /Storage JSON is invalid:/,
        );
        assert.equal(await readFile(manifestPath, 'utf8'), '{ broken');
    });
}

async function testCommitPlanSurfacesUnexpectedStagedStatErrors() {
    await withStorage(async storage => {
        const plan = pushPlan();
        await storage.savePlan(plan);
        await storage.writeNamespace(plan.namespace, await storage.createNamespace(plan.namespace));
        await writeFile(path.join(storage.planDir(plan.id), 'staged'), 'not a directory');

        await assert.rejects(
            storage.commitPlan(await storage.readPlan(plan.id), {}),
            error => error.code === 'ENOTDIR' && !error.message.includes('Missing staged upload'),
        );
    });
}

function pushPlan() {
    return {
        committedAt: '',
        conflicts: [],
        deviceId: 'device-1',
        downloads: [],
        id: 'plan-1',
        kind: 'push',
        localDeletes: [],
        namespace: 'default',
        remoteDeletes: [],
        staged: {},
        uploads: [
            {
                modifiedMs: 1_700_000_000_000,
                path: 'file.txt',
                sha256: '',
                sizeBytes: 4,
            },
        ],
    };
}

async function withStorage(callback) {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'tt-sync-storage-test-'));
    try {
        await callback(new TtSyncStorage({ rootDir }));
    } finally {
        await rm(rootDir, { force: true, recursive: true });
    }
}
