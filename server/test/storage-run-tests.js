import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { TtSyncStorage } from '../lib/storage.js';

await testCommitPlanRejectsStaleSnapshot();
await testWriteNamespaceSurfacesMalformedManifest();
await testWriteNamespaceRejectsMalformedAccountArrays();
await testNamespaceListMethodsRejectMalformedArrays();
await testCommitPlanRejectsMalformedHistoryBeforeRemoteMutation();
await testCommitPlanRejectsMalformedNamespaceBeforeRemoteMutation();
await testStageFileRejectsMalformedStagedBeforeWritingFile();
await testCommitPlanSurfacesUnexpectedStagedStatErrors();
await testCommittedPlanRejectsLateUploads();
await testRollbackRejectsMalformedEntryBeforeWritingFile();
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

async function testWriteNamespaceRejectsMalformedAccountArrays() {
    await withStorage(async storage => {
        await storage.writeNamespace('default', await storage.createNamespace('default'));
        const record = await storage.readNamespace('default');

        await assert.rejects(
            storage.writeNamespace('default', { ...record, sessions: '' }),
            /Invalid namespace sessions/,
        );
        await assert.rejects(
            storage.writeNamespace('default', { ...record, pairingTokens: '' }),
            /Invalid namespace pairingTokens/,
        );
    });
}

async function testNamespaceListMethodsRejectMalformedArrays() {
    await withStorage(async storage => {
        await storage.writeNamespace('default', {
            ...(await storage.createNamespace('default')),
            devices: 'bad',
            rollbackPoints: {},
            syncHistory: null,
        });

        await assert.rejects(
            storage.listDevices('default'),
            /Invalid namespace devices/,
        );
        await assert.rejects(
            storage.listRollbackPoints('default'),
            /Invalid namespace rollbackPoints/,
        );
        assert.deepEqual(await storage.listHistory('default'), []);
    });
}

async function testCommitPlanRejectsMalformedHistoryBeforeRemoteMutation() {
    await withStorage(async storage => {
        const plan = pushPlan();
        await storage.savePlan(plan);
        await storage.writeNamespace(plan.namespace, await storage.createNamespace(plan.namespace));
        await storage.stageFile(plan, plan.uploads[0], Buffer.from('data'));
        const malformedPlan = { ...(await storage.readPlan(plan.id)), downloads: null };
        await storage.writePlan(malformedPlan);

        await assert.rejects(
            storage.commitPlan(await storage.readPlan(plan.id), {}),
            /Invalid plan downloads/,
        );
        await assert.rejects(
            readFile(storage.remoteFilePath(plan.namespace, plan.uploads[0].path)),
            error => error.code === 'ENOENT',
        );
    });
}

async function testCommitPlanRejectsMalformedNamespaceBeforeRemoteMutation() {
    await withStorage(async storage => {
        const plan = pushPlan();
        const record = { ...(await storage.createNamespace(plan.namespace)), syncHistory: 'bad' };
        await storage.savePlan(plan);
        await storage.writeNamespace(plan.namespace, record);
        await storage.stageFile(plan, plan.uploads[0], Buffer.from('data'));

        await assert.rejects(
            storage.commitPlan(await storage.readPlan(plan.id), {}),
            /Invalid namespace syncHistory/,
        );
        await assert.rejects(
            readFile(storage.remoteFilePath(plan.namespace, plan.uploads[0].path)),
            error => error.code === 'ENOENT',
        );
    });
}

async function testStageFileRejectsMalformedStagedBeforeWritingFile() {
    await withStorage(async storage => {
        const plan = { ...pushPlan(), staged: 'bad' };
        await storage.savePlan(plan);

        await assert.rejects(
            storage.stageFile(plan, plan.uploads[0], Buffer.from('data')),
            /Invalid plan staged/,
        );
        await assert.rejects(
            readFile(storage.stagedFilePath(plan.id, plan.uploads[0].path)),
            error => error.code === 'ENOENT',
        );
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

async function testCommittedPlanRejectsLateUploads() {
    await withStorage(async storage => {
        const plan = pushPlan();
        await storage.savePlan(plan);
        await storage.writeNamespace(plan.namespace, await storage.createNamespace(plan.namespace));
        await storage.stageFile(plan, plan.uploads[0], Buffer.from('data'));
        const committed = await storage.commitPlan(await storage.readPlan(plan.id), {});

        await assert.rejects(
            storage.stageFile(committed, committed.uploads[0], Buffer.from('late')),
            /Plan already committed: plan-1/,
        );
        await assert.rejects(
            readFile(storage.stagedFilePath(plan.id, plan.uploads[0].path)),
            error => error.code === 'ENOENT',
        );
    });
}

async function testRollbackRejectsMalformedEntryBeforeWritingFile() {
    await withStorage(async storage => {
        await storage.writeNamespace('default', await storage.createNamespace('default'));
        const rollbackPath = storage.rollbackPointPath('default', 'rollback-1');
        await mkdir(path.dirname(rollbackPath), { recursive: true });
        await writeFile(rollbackPath, JSON.stringify(malformedRollbackPoint()));

        await assert.rejects(
            storage.restoreRollbackPoint('default', 'rollback-1'),
            /Invalid modifiedMs/,
        );
        await assert.rejects(
            readFile(storage.remoteFilePath('default', 'file.txt')),
            error => error.code === 'ENOENT',
        );
    });
}

function malformedRollbackPoint() {
    return {
        files: [{
            contentBase64: Buffer.from('bad').toString('base64'),
            entry: { modifiedMs: '0x10', path: 'file.txt', sha256: '', sizeBytes: 3 },
            path: 'file.txt',
        }],
        id: 'rollback-1',
        planId: 'plan-1',
    };
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
