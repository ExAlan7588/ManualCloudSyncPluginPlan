import assert from 'node:assert/strict';
import { verifyIncrementalCloudSyncEvidence } from '../verify-incremental-cloud-sync-evidence.js';
import { completeEvidence } from './evidence-fixtures.js';

const tests = [
    ['incremental evidence verifier rejects placeholder evidence URLs', testPlaceholderEvidenceUrls],
    ['incremental evidence verifier rejects cleartext evidence URLs', testCleartextEvidenceUrls],
    ['incremental evidence verifier rejects URL credentials and fragments', testUncleanEvidenceUrls],
    ['incremental evidence verifier rejects deploy smoke URL mismatch', testMixedDeploySmokeEvidence],
    ['incremental evidence verifier rejects mixed server evidence', testMixedServerEvidence],
    ['incremental evidence verifier rejects saved pairing URL mismatch', testSavedPairingUrlMismatch],
    ['incremental evidence verifier rejects saved pairing id mismatch', testSavedPairingIdMismatch],
];

for (const [name, test] of tests) {
    try {
        await test();
        console.log(`ok - ${name}`);
    } catch (error) {
        console.error(`not ok - ${name}`);
        console.error(error);
        process.exitCode = 1;
        break;
    }
}

async function testPlaceholderEvidenceUrls() {
    const placeholderUrls = [
        'https://sync.example.com',
        'https://sync.example.net',
        'https://sync.example.org',
        'https://sync.fixture.test',
    ];
    for (const placeholderUrl of placeholderUrls) {
        const report = await reportWithEvidenceUrl(placeholderUrl);
        assert.equal(report.ok, false);
        assert.ok(report.failed.includes('deploy report public URL is not placeholder'));
        assert.ok(report.failed.includes('smoke endpoint is not placeholder'));
        assert.ok(report.failed.includes('device evidence server URL is not placeholder'));
    }
}

async function testCleartextEvidenceUrls() {
    const report = await reportWithEvidenceUrl('http://sync-fixture.dev');
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('deploy report public URL uses HTTPS'));
    assert.ok(report.failed.includes('smoke endpoint uses HTTPS'));
    assert.ok(report.failed.includes('device evidence server URL uses HTTPS'));
}

async function testUncleanEvidenceUrls() {
    const report = await reportWithEvidenceUrl('https://user:pass@sync-fixture.dev?token=secret#frag');
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('deploy report public URL is clean'));
    assert.ok(report.failed.includes('smoke endpoint is clean'));
    assert.ok(report.failed.includes('device evidence server URL is clean'));
}

async function testMixedDeploySmokeEvidence() {
    const evidence = completeEvidence();
    evidence.deployReport.publicUrl = 'https://deploy-other.example.com';
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('deploy and smoke same URL'));
}

async function testMixedServerEvidence() {
    const evidence = completeEvidence();
    evidence.deviceEvidence.server.url = 'https://other-sync-fixture.dev';
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('same server URL'));
}

async function testSavedPairingUrlMismatch() {
    const evidence = completeEvidence();
    evidence.deviceEvidence.checks.phoneDesktopPairingSaved.phone.savedServerUrl = 'https://other-sync-fixture.dev';
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('phone saved server URL matches'));
}

async function testSavedPairingIdMismatch() {
    const evidence = completeEvidence();
    evidence.deviceEvidence.checks.phoneDesktopPairingSaved.desktop.savedServerId = 'other-server-id';
    const report = await verifyIncrementalCloudSyncEvidence(evidence);
    assert.equal(report.ok, false);
    assert.ok(report.failed.includes('desktop saved server id matches'));
}

async function reportWithEvidenceUrl(url) {
    const evidence = completeEvidence();
    evidence.deployReport.publicUrl = url;
    evidence.smokeReport.endpoint = url;
    evidence.deviceEvidence.server.url = url;
    evidence.deviceEvidence.checks.phoneDesktopPairingSaved.phone.savedServerUrl = url;
    evidence.deviceEvidence.checks.phoneDesktopPairingSaved.desktop.savedServerUrl = url;
    return verifyIncrementalCloudSyncEvidence(evidence);
}
