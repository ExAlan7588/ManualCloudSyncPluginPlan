import assert from 'node:assert/strict';
import { parseJsonResponse, requestHeaders } from '../smoke-http.js';

await testParseJsonResponseIncludesParserDetail();
await testParseJsonResponsePreservesServerError();
testRequestHeaders();
console.log('ok - smoke HTTP helpers expose JSON parser details');

async function testParseJsonResponseIncludesParserDetail() {
    const response = new Response('{ broken', { status: 200 });
    await assert.rejects(
        parseJsonResponse(response),
        /HTTP 200: \{ broken; invalid JSON: Expected property name/,
    );
}

async function testParseJsonResponsePreservesServerError() {
    const response = new Response('{"error":"bad token"}', { status: 401 });
    await assert.rejects(parseJsonResponse(response), /bad token/);
}

function testRequestHeaders() {
    assert.deepEqual(requestHeaders('token'), {
        Authorization: 'Bearer token',
        'Content-Type': 'application/json',
    });
}
