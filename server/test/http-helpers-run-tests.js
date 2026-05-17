import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { readJsonRequest, sendError } from '../lib/http-helpers.js';
import { badRequest } from '../lib/http-error.js';

await testReadJsonRequestIncludesParserDetail();
await testReadJsonRequestNormalizesParserDetailWhitespace();
await testReadJsonRequestUsesFallbackForEmptyBody();
await testReadJsonRequestReturnsBodyAndBuffer();
await testReadJsonRequestRejectsNonObjectBody();
await testReadJsonRequestRejectsOversizedBody();
await testReadJsonRequestRejectsMalformedMaxBodyEnv();
await testSendErrorNormalizesControlWhitespace();
console.log('ok - HTTP JSON helpers expose parser details');

async function testReadJsonRequestIncludesParserDetail() {
    await assert.rejects(
        readJsonRequest(requestFrom('{ broken')),
        /Request body must be valid JSON: Expected property name/,
    );
}

async function testReadJsonRequestNormalizesParserDetailWhitespace() {
    await assert.rejects(
        readJsonRequest(requestFrom('{\n')),
        error => {
            assert.equal(error.message.includes('\n'), false);
            assert.match(error.message, /Request body must be valid JSON:/);
            return true;
        },
    );
}

async function testReadJsonRequestUsesFallbackForEmptyBody() {
    const fallback = { ok: true };
    const result = await readJsonRequest(requestFrom(''), fallback);
    assert.equal(result.body, fallback);
    assert.equal(result.buffer.length, 0);
}

async function testReadJsonRequestReturnsBodyAndBuffer() {
    const result = await readJsonRequest(requestFrom('{"ok":true}'));
    assert.deepEqual(result.body, { ok: true });
    assert.equal(result.buffer.toString('utf8'), '{"ok":true}');
}

async function testReadJsonRequestRejectsNonObjectBody() {
    await assert.rejects(
        readJsonRequest(requestFrom('null')),
        /Request body must be a JSON object/,
    );
    await assert.rejects(
        readJsonRequest(requestFrom('[]')),
        /Request body must be a JSON object/,
    );
}

async function testReadJsonRequestRejectsOversizedBody() {
    const previousMaxBytes = process.env.TT_SYNC_MAX_BODY_BYTES;
    process.env.TT_SYNC_MAX_BODY_BYTES = '4';
    try {
        await assert.rejects(
            readJsonRequest(requestFrom('{"ok":true}')),
            /Request body is too large/,
        );
    } finally {
        restoreEnv('TT_SYNC_MAX_BODY_BYTES', previousMaxBytes);
    }
}

async function testReadJsonRequestRejectsMalformedMaxBodyEnv() {
    const previousMaxBytes = process.env.TT_SYNC_MAX_BODY_BYTES;
    process.env.TT_SYNC_MAX_BODY_BYTES = 'not-a-number';
    try {
        await assert.rejects(
            readJsonRequest(requestFrom('{"ok":true}')),
            /TT_SYNC_MAX_BODY_BYTES must be a positive integer/,
        );
    } finally {
        restoreEnv('TT_SYNC_MAX_BODY_BYTES', previousMaxBytes);
    }
}

async function testSendErrorNormalizesControlWhitespace() {
    const response = recordingResponse();
    sendError(response, badRequest('bad\n\tinput'));
    const payload = JSON.parse(response.body);
    assert.equal(response.statusCode, 400);
    assert.equal(payload.error, 'bad input');
}

function requestFrom(text) {
    return Readable.from([Buffer.from(text)]);
}

function recordingResponse() {
    return {
        body: '',
        statusCode: 200,
        end(chunk = '') {
            this.body += chunk;
        },
        writeHead(statusCode) {
            this.statusCode = statusCode;
        },
    };
}

function restoreEnv(name, value) {
    if (value === undefined) {
        delete process.env[name];
        return;
    }
    process.env[name] = value;
}
