import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createHandler } from '../lib/routes.js';

const PLAN = Object.freeze({
    committedAt: '',
    conflicts: [],
    downloads: [],
    id: 'plan-1',
    kind: 'push',
    localDeletes: [],
    namespace: 'default',
    remoteDeletes: [],
    staged: {},
    uploads: [],
});

async function testProgressStreamSurfacesPollingError() {
    const intervals = [];
    const originalSetInterval = globalThis.setInterval;
    const originalClearInterval = globalThis.clearInterval;
    globalThis.setInterval = callback => {
        intervals.push(callback);
        return callback;
    };
    globalThis.clearInterval = () => {};

    try {
        const response = await dispatchProgressEventsRequest(failingStorage());
        assert.equal(intervals.length, 1);
        await intervals[0]();
        assert.equal(response.statusCode, 200);
        assert.equal(response.ended, true);
        assert.match(response.body, /event: progress/);
        assert.match(response.body, /event: error/);
        assert.match(response.body, /plan store unavailable/);
    } finally {
        globalThis.setInterval = originalSetInterval;
        globalThis.clearInterval = originalClearInterval;
    }
}

async function dispatchProgressEventsRequest(storage) {
    const request = new EventEmitter();
    request.method = 'GET';
    request.url = '/v2/plans/plan-1/events';
    request.headers = { authorization: 'Bearer test-token' };
    const response = new MockResponse();
    await createHandler(storage)(request, response);
    return response;
}

function failingStorage() {
    let reads = 0;
    return {
        async readPlan(planId) {
            reads += 1;
            if (planId !== PLAN.id) {
                throw new Error(`unexpected plan id: ${planId}`);
            }
            if (reads > 2) {
                throw new Error('plan store unavailable');
            }
            return PLAN;
        },
        async requireAuth(namespace, authHeader) {
            assert.equal(namespace, PLAN.namespace);
            assert.equal(authHeader, 'Bearer test-token');
        },
    };
}

class MockResponse {
    constructor() {
        this.body = '';
        this.ended = false;
        this.headers = {};
        this.statusCode = 0;
    }

    writeHead(statusCode, headers) {
        this.statusCode = statusCode;
        this.headers = headers;
    }

    write(chunk) {
        this.body += String(chunk);
    }

    end(chunk = '') {
        this.body += String(chunk);
        this.ended = true;
    }
}

await testProgressStreamSurfacesPollingError();
console.log('ok - progress stream surfaces polling errors');
