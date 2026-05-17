import assert from 'node:assert/strict';
import {
    addDevice,
    affectedPaths,
    cappedList,
    historyEntry,
    pairingResponse,
    rollbackPointSummary,
    touchDevice,
    upsertDevice,
    withoutConflictFlag,
} from '../lib/storage-records.js';

testStorageRecordHelpers();
testStorageRecordHelpersRejectMalformedArrays();
testStorageRecordHelpersRejectMalformedPlanPaths();
testDeviceHelpersRejectMalformedDevices();
testUpsertDeviceRejectsMalformedIdentity();
console.log('ok - storage record helpers preserve response shapes');

function testStorageRecordHelpers() {
    const record = {
        authToken: 'auth-token',
        devices: [],
        namespace: 'default',
        serverId: 'server-id',
    };
    const device = addDevice(record, ' Phone ');
    assert.equal(device.deviceName, 'Phone');
    assert.equal(record.devices.length, 1);

    const publicKey = rawPublicKey();
    upsertDevice(record, { deviceId: device.deviceId, deviceName: 'Desktop', publicKey });
    assert.equal(record.devices[0].deviceName, 'Desktop');
    assert.equal(record.devices[0].publicKey, publicKey);

    touchDevice(record, 'missing-device', { lastSeenAt: '2026-05-14T00:00:00.000Z' });
    assert.equal(record.devices[1].deviceId, 'missing-device');
    assert.equal(record.devices[1].lastSeenAt, '2026-05-14T00:00:00.000Z');

    assert.deepEqual(affectedPaths(planFixture()), ['a.txt', 'b.txt', 'c.txt']);
    assert.deepEqual(cappedList([1, 2, 3], 2), [1, 2]);
    assert.deepEqual(rollbackPointSummary({ createdAt: 'now', files: [{}, {}], id: 'rollback-1', planId: 'plan-1' }), {
        affectedFiles: 2,
        createdAt: 'now',
        id: 'rollback-1',
        planId: 'plan-1',
    });
    assert.deepEqual(historyEntry(planFixture()), {
        committedAt: 'committed',
        conflicts: 2,
        deviceId: 'device-1',
        downloads: 1,
        kind: 'push',
        planId: 'plan-1',
        remoteDeletes: 1,
        uploads: 2,
    });
    assert.deepEqual(pairingResponse(record, device, 'https://sync.example.com'), {
        authToken: 'auth-token',
        deviceId: device.deviceId,
        endpoint: 'https://sync.example.com',
        namespace: 'default',
        serverId: 'server-id',
    });
    assert.deepEqual(withoutConflictFlag({ conflict: true, path: 'a.txt', sizeBytes: 1 }), { path: 'a.txt', sizeBytes: 1 });
}

function testStorageRecordHelpersRejectMalformedArrays() {
    assert.throws(
        () => affectedPaths({ ...planFixture(), uploads: {} }),
        /Invalid plan uploads/,
    );
    assert.throws(
        () => historyEntry({ ...planFixture(), remoteDeletes: null }),
        /Invalid plan remoteDeletes/,
    );
    assert.throws(
        () => rollbackPointSummary({ createdAt: 'now', files: 'bad', id: 'rollback-1', planId: 'plan-1' }),
        /Invalid rollback files/,
    );
}

function testStorageRecordHelpersRejectMalformedPlanPaths() {
    assert.throws(
        () => affectedPaths({ ...planFixture(), uploads: [{ path: { value: 'a.txt' } }] }),
        /Invalid plan uploads path/,
    );
    assert.throws(
        () => historyEntry({ ...planFixture(), remoteDeletes: [''] }),
        /Invalid plan remoteDeletes path/,
    );
}

function testDeviceHelpersRejectMalformedDevices() {
    assert.throws(
        () => addDevice({ devices: 'bad' }, 'Phone'),
        /Invalid namespace devices/,
    );
    assert.throws(
        () => upsertDevice({ devices: null }, { deviceId: 'device-1' }),
        /Invalid namespace devices/,
    );
    assert.throws(
        () => touchDevice({ devices: {} }, 'device-1', {}),
        /Invalid namespace devices/,
    );
}

function testUpsertDeviceRejectsMalformedIdentity() {
    assert.throws(
        () => upsertDevice({ devices: [] }, { deviceId: 'not-a-uuid', deviceName: 'Phone', publicKey: rawPublicKey() }),
        /Invalid device id/,
    );
    assert.throws(
        () => upsertDevice({ devices: [] }, { deviceId: '550e8400-e29b-41d4-a716-446655440000', publicKey: 'abcDEF_123' }),
        /Invalid device publicKey/,
    );
}

function rawPublicKey() {
    return Buffer.alloc(32, 1).toString('base64url');
}

function planFixture() {
    return {
        committedAt: 'committed',
        conflicts: [{ path: 'c.txt' }, { path: 'a.txt' }],
        deviceId: 'device-1',
        downloads: [{ path: 'remote.txt' }],
        id: 'plan-1',
        kind: 'push',
        remoteDeletes: ['b.txt'],
        uploads: [{ path: 'a.txt' }, { path: 'b.txt' }],
    };
}
