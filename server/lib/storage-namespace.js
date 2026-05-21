import { randomUUID } from 'node:crypto';
import { pruneExpiredSessions, prunePairingTokens, randomToken } from './account.js';
import { optionalRecordArray } from './storage-validation.js';

export function createNamespaceRecord(namespace) {
    return {
        namespace,
        serverId: randomUUID(),
        authToken: randomToken(),
        devices: [],
        pairingTokens: [],
        rollbackPoints: [],
        sessions: [],
        syncHistory: [],
        createdAt: new Date().toISOString(),
    };
}

export function namespaceRecordForWrite(record) {
    return {
        ...record,
        pairingTokens: prunePairingTokens(optionalRecordArray(record.pairingTokens, 'namespace pairingTokens')),
        sessions: pruneExpiredSessions(optionalRecordArray(record.sessions, 'namespace sessions')),
    };
}
