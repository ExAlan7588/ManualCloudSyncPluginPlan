import assert from 'node:assert/strict';
import { decodeBase64Content } from '../lib/base64-content.js';

testDecodeBase64ContentAcceptsValidContent();
testDecodeBase64ContentRejectsMissingString();
testDecodeBase64ContentRejectsMalformedContent();
console.log('ok - base64 content decoder rejects malformed input');

function testDecodeBase64ContentAcceptsValidContent() {
    assert.equal(decodeBase64Content('aGVsbG8=', 'content').toString('utf8'), 'hello');
    assert.equal(decodeBase64Content('', 'content').length, 0);
}

function testDecodeBase64ContentRejectsMissingString() {
    assert.throws(() => decodeBase64Content(undefined, 'Bundle file contentBase64'), /must be a base64 string/);
}

function testDecodeBase64ContentRejectsMalformedContent() {
    assert.throws(() => decodeBase64Content('!aGVsbG8=', 'Rollback file contentBase64'), /must be valid base64/);
    assert.throws(() => decodeBase64Content('aGVsbG8=!', 'Rollback file contentBase64'), /must be valid base64/);
}
