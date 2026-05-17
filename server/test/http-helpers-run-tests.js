import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { readJsonRequest } from '../lib/http-helpers.js';

await testReadJsonRequestIncludesParserDetail();
await testReadJsonRequestUsesFallbackForEmptyBody();
await testReadJsonRequestReturnsBodyAndBuffer();
await testReadJsonRequestRejectsOversizedBody();
console.log('ok - HTTP JSON helpers expose parser details');

async function testReadJsonRequestIncludesParserDetail() {
    await assert.rejects(
        readJsonRequest(requestFrom('{ broken')),
        /Request body must be valid JSON: Expected property name/,
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

function requestFrom(text) {
    return Readable.from([Buffer.from(text)]);
}

function restoreEnv(name, value) {
    if (value === undefined) {
        delete process.env[name];
        return;
    }
    process.env[name] = value;
}
