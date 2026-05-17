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
const INITIAL_PROGRESS_PLAN_READS = 2;
const EXPECTED_OVERLAPPING_POLL_READS = 1;

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
        assert.equal(errorEventPayload(response.body).error, 'plan store unavailable');
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
                throw new Error('plan store\n\tunavailable');
            }
            return PLAN;
        },
        async requireAuth(namespace, authHeader) {
            assert.equal(namespace, PLAN.namespace);
            assert.equal(authHeader, 'Bearer test-token');
        },
    };
}

function errorEventPayload(body) {
    const lines = body.split('\n');
    const eventIndex = lines.indexOf('event: error');
    assert.notEqual(eventIndex, -1);
    return JSON.parse(lines[eventIndex + 1].replace(/^data: /, ''));
}

async function testProgressStreamSkipsOverlappingPolls() {
    const intervals = [];
    const originalSetInterval = globalThis.setInterval;
    const originalClearInterval = globalThis.clearInterval;
    globalThis.setInterval = callback => {
        intervals.push(callback);
        return callback;
    };
    globalThis.clearInterval = () => {};

    try {
        const storage = slowPollingStorage();
        await dispatchProgressEventsRequest(storage);
        assert.equal(intervals.length, 1);

        const firstPoll = intervals[0]();
        const secondPoll = intervals[0]();
        await secondPoll;

        assert.equal(storage.pollReads(), EXPECTED_OVERLAPPING_POLL_READS);
        storage.resolvePoll();
        await firstPoll;
    } finally {
        globalThis.setInterval = originalSetInterval;
        globalThis.clearInterval = originalClearInterval;
    }
}

function slowPollingStorage() {
    let reads = 0;
    let pollReads = 0;
    let resolvePoll;
    return {
        pollReads: () => pollReads,
        resolvePoll: () => resolvePoll?.(PLAN),
        async readPlan(planId) {
            reads += 1;
            if (planId !== PLAN.id) {
                throw new Error(`unexpected plan id: ${planId}`);
            }
            if (reads <= INITIAL_PROGRESS_PLAN_READS) {
                return PLAN;
            }
            pollReads += 1;
            return new Promise(resolve => {
                resolvePoll = resolve;
            });
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
await testProgressStreamSkipsOverlappingPolls();
console.log('ok - progress stream surfaces polling errors and avoids overlapping polls');
