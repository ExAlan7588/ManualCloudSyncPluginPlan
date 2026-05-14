import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { TtSyncStorage } from '../lib/storage.js';

await testCommitPlanRejectsStaleSnapshot();
console.log('ok - storage commit rejects stale plan snapshots');

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

async function withStorage(callback) {
    const rootDir = await mkdtemp(path.join(tmpdir(), 'tt-sync-storage-test-'));
    try {
        await callback(new TtSyncStorage({ rootDir }));
    } finally {
        await rm(rootDir, { force: true, recursive: true });
    }
}
