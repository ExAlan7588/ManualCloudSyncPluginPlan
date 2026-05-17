import assert from 'node:assert/strict';
import { normalizeManifest } from '../lib/manifest.js';

const VALID_SHA256 = 'a'.repeat(64);
const UPPERCASE_SHA256 = 'A'.repeat(64);

testNormalizeManifestAcceptsLowercaseSha256();
testNormalizeManifestRejectsUppercaseSha256();
testNormalizeManifestRejectsMalformedEntries();
testNormalizeManifestRejectsNullNumericFields();
testNormalizeManifestRejectsNonDecimalNumericStrings();
console.log('ok - manifest validation enforces lowercase sha256');

function testNormalizeManifestAcceptsLowercaseSha256() {
    assert.equal(normalizeManifest([entryWithSha256(VALID_SHA256)])[0].sha256, VALID_SHA256);
}

function testNormalizeManifestRejectsUppercaseSha256() {
    assert.throws(
        () => normalizeManifest([entryWithSha256(UPPERCASE_SHA256)]),
        /sha256 must be a 64-character lowercase hex digest/,
    );
}

function testNormalizeManifestRejectsMalformedEntries() {
    assert.throws(
        () => normalizeManifest([null]),
        /Manifest entry must be an object/,
    );
    assert.throws(
        () => normalizeManifest([[]]),
        /Manifest entry must be an object/,
    );
}

function testNormalizeManifestRejectsNullNumericFields() {
    assert.throws(
        () => normalizeManifest([{ ...entryWithSha256(VALID_SHA256), sizeBytes: null }]),
        /Invalid sizeBytes/,
    );
    assert.throws(
        () => normalizeManifest([{ ...entryWithSha256(VALID_SHA256), modifiedMs: null }]),
        /Invalid modifiedMs/,
    );
}

function testNormalizeManifestRejectsNonDecimalNumericStrings() {
    assert.throws(
        () => normalizeManifest([{ ...entryWithSha256(VALID_SHA256), sizeBytes: '0x10' }]),
        /Invalid sizeBytes/,
    );
    assert.throws(
        () => normalizeManifest([{ ...entryWithSha256(VALID_SHA256), modifiedMs: '0x10' }]),
        /Invalid modifiedMs/,
    );
}

function entryWithSha256(sha256) {
    return {
        modifiedMs: 1,
        path: 'default-user/chats/example.jsonl',
        sha256,
        sizeBytes: 1,
    };
}
