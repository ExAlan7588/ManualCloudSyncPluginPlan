import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { encodePath } from '../lib/encoding.js';
import { createHandler } from '../lib/routes.js';

const VALID_SPKI_PIN = Buffer.alloc(32, 1).toString('base64url');

await testAccountPairingUriRejectsUnsupportedEndpointScheme();
await testAccountPairingUriRejectsMalformedSpkiPin();
await testSessionOpenUsesNormalizedNamespace();
await testPlanRouteUsesNormalizedNamespace();
await testCommitRouteUsesNormalizedPlanNamespace();
await testFileRouteRejectsMalformedPlanDownloads();
console.log('ok - routes validate account pairing URI inputs');

async function testAccountPairingUriRejectsUnsupportedEndpointScheme() {
    const response = await dispatch({
        body: {
            endpoint: 'ftp://sync.example.test',
            namespace: 'default',
            spki: VALID_SPKI_PIN,
        },
        headers: { authorization: 'Bearer token' },
        method: 'POST',
        storage: {
            async createAccountPairing() {
                throw new Error('createAccountPairing must not be called for invalid endpoint');
            },
        },
        url: '/v2/account/pairing-uri',
    });
    assert.equal(response.statusCode, 400);
    assert.match(JSON.parse(response.body).error, /endpoint must use http or https/);
}

async function testAccountPairingUriRejectsMalformedSpkiPin() {
    const response = await dispatch({
        body: {
            endpoint: 'https://sync.example.test',
            namespace: 'default',
            spki: 'abcDEF_123',
        },
        headers: { authorization: 'Bearer token' },
        method: 'POST',
        storage: {
            async createAccountPairing() {
                throw new Error('createAccountPairing must not be called for malformed spki');
            },
        },
        url: '/v2/account/pairing-uri',
    });
    assert.equal(response.statusCode, 400);
    assert.match(JSON.parse(response.body).error, /spki must be a base64url SHA-256 pin/);
}

async function testSessionOpenUsesNormalizedNamespace() {
    const response = await dispatch({
        body: { deviceId: 'device-1', namespace: ' default ' },
        headers: { authorization: 'Bearer token' },
        method: 'POST',
        storage: {
            async openSession(namespace, deviceId) {
                return { deviceId, namespace };
            },
            async requireAuth(namespace) {
                assert.equal(namespace, 'default');
            },
        },
        url: '/v2/session/open',
    });
    assert.equal(response.statusCode, 200);
    assert.equal(JSON.parse(response.body).namespace, 'default');
}

async function testPlanRouteUsesNormalizedNamespace() {
    const response = await dispatch({
        body: { deviceId: 'device-1', localManifest: [], namespace: ' default ' },
        headers: { authorization: 'Bearer token' },
        method: 'POST',
        storage: {
            async readManifest(namespace) {
                assert.equal(namespace, 'default');
                return [];
            },
            async requireAuth(namespace) {
                assert.equal(namespace, 'default');
            },
            async savePlan(plan) {
                return plan;
            },
        },
        url: '/v2/sync/push-plan',
    });
    assert.equal(response.statusCode, 200);
    assert.equal(JSON.parse(response.body).namespace, 'default');
}

async function testCommitRouteUsesNormalizedPlanNamespace() {
    const response = await dispatch({
        body: {},
        headers: { authorization: 'Bearer token' },
        method: 'POST',
        storage: {
            async commitPlan(plan) {
                return { ...plan, committedAt: '2026-05-17T00:00:00.000Z' };
            },
            async readPlan() {
                return {
                    committedAt: '',
                    conflicts: [],
                    downloads: [],
                    id: 'plan-1',
                    kind: 'pull',
                    localDeletes: [],
                    namespace: ' default ',
                    remoteDeletes: [],
                    staged: {},
                    uploads: [],
                };
            },
            async requireAuth(namespace) {
                assert.equal(namespace, 'default');
            },
        },
        url: '/v2/plans/plan-1/commit',
    });
    assert.equal(response.statusCode, 200);
    assert.equal(JSON.parse(response.body).namespace, 'default');
}

async function testFileRouteRejectsMalformedPlanDownloads() {
    const response = await dispatch({
        body: {},
        headers: { authorization: 'Bearer token' },
        method: 'GET',
        storage: {
            async readPlan() {
                return {
                    downloads: {},
                    id: 'plan-1',
                    namespace: 'default',
                    uploads: [],
                };
            },
            async requireAuth(namespace) {
                assert.equal(namespace, 'default');
            },
        },
        url: `/v2/plans/plan-1/files/${encodePath('default-user/chats/example.jsonl')}`,
    });
    assert.equal(response.statusCode, 500);
    assert.match(JSON.parse(response.body).error, /Invalid plan downloads/);
}

async function dispatch(options) {
    const request = Readable.from([Buffer.from(JSON.stringify(options.body))]);
    request.method = options.method;
    request.url = options.url;
    request.headers = options.headers || {};
    const response = recordingResponse();
    await createHandler(options.storage)(request, response);
    return response;
}

function recordingResponse() {
    return {
        body: '',
        ended: false,
        headers: {},
        statusCode: 200,
        end(chunk = '') {
            this.body += chunk;
            this.ended = true;
        },
        setHeader(name, value) {
            this.headers[name.toLowerCase()] = value;
        },
        write(chunk = '') {
            this.body += chunk;
        },
        writeHead(statusCode, headers = {}) {
            this.statusCode = statusCode;
            for (const [name, value] of Object.entries(headers)) {
                this.setHeader(name, value);
            }
        },
    };
}
