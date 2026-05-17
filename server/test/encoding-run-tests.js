import assert from 'node:assert/strict';
import {
    decodePath,
    encodePath,
    safeName,
    validateSyncPath,
} from '../lib/encoding.js';

testEncodingRoundTrip();
testSyncPathValidation();
testEncodedPathRejectsInvalidBase64Url();
testEncodedPathRejectsInvalidUtf8();
testSafeNameValidation();
console.log('ok - encoding helpers reject malformed path inputs');

function testEncodingRoundTrip() {
    const syncPath = 'default-user/chats/example.jsonl';
    assert.equal(decodePath(encodePath(syncPath)), syncPath);
}

function testSyncPathValidation() {
    assert.throws(() => validateSyncPath('../secret'), /Invalid sync path/);
    assert.throws(() => validateSyncPath('default-user//chat.jsonl'), /Invalid sync path/);
    assert.throws(() => validateSyncPath('default-user/user/lan-sync/state.json'), /excluded from TT-Sync/);
}

function testEncodedPathRejectsInvalidBase64Url() {
    const encoded = encodePath('default-user/chats/example.jsonl');
    assert.throws(() => decodePath(`!${encoded}`), /Invalid encoded sync path/);
    assert.throws(() => decodePath(`${encoded}!`), /Invalid encoded sync path/);
}

function testEncodedPathRejectsInvalidUtf8() {
    assert.throws(() => decodePath('__4'), /Invalid encoded sync path/);
}

function testSafeNameValidation() {
    assert.equal(safeName('namespace_1.2-3', 'namespace'), 'namespace_1.2-3');
    assert.throws(() => safeName('../namespace', 'namespace'), /namespace must use/);
}
