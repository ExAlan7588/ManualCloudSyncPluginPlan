import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { REQUIRED_TT_SYNC_COMMANDS } from '../verify-tauritavern-tt-sync.js';
import {
    REQUIRED_TT_SYNC_DIFF_CONFLICT_SURFACES,
    REQUIRED_TT_SYNC_EVENTS,
    REQUIRED_TT_SYNC_EVENT_FIELDS,
} from '../verify-tauritavern-tt-sync-events.js';
import { REQUIRED_DEVICE_CHECKS } from '../verify-incremental-cloud-sync-evidence.js';

const COMMAND_CONTRACT_DOC = new URL('../../docs/TauriTavernTtSyncCommandContract.md', import.meta.url);
const INCREMENTAL_PLAN_DOC = new URL('../../docs/IncrementalCloudSyncPlan.md', import.meta.url);
const README_DOC = new URL('../../README.md', import.meta.url);
const VERIFIER_SOURCE = new URL('../verify-incremental-cloud-sync-evidence.js', import.meta.url);
const VERIFICATION_DOC = new URL('../../docs/TauriTavernTtSyncVerification.md', import.meta.url);

const tests = [
    ['verification docs cover command contract and device fields', testVerificationDocsCoverage],
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

async function testVerificationDocsCoverage() {
    const contract = await readFile(COMMAND_CONTRACT_DOC, 'utf8');
    const plan = await readFile(INCREMENTAL_PLAN_DOC, 'utf8');
    const readme = await readFile(README_DOC, 'utf8');
    const verifier = await readFile(VERIFIER_SOURCE, 'utf8');
    const verification = await readFile(VERIFICATION_DOC, 'utf8');
    assert.ok(verification.includes('--deploy'), 'final evidence deploy input missing from verification doc');
    assert.ok(verification.includes('--allow-placeholders'), 'deploy placeholder policy missing from verification doc');
    assertEventSurfaceDocumented({ plan, readme, verification });
    assertFinalEvidenceManifestDocumented({ contract, plan, readme, verification, verifier });
    for (const command of REQUIRED_TT_SYNC_COMMANDS) {
        assert.ok(contract.includes(command), `${command} missing from command contract doc`);
    }
    for (const item of REQUIRED_DEVICE_CHECKS) {
        assertDeviceRequirementDocumented({ item, verification });
    }
}

function assertEventSurfaceDocumented(options) {
    assert.ok(options.readme.includes('verify:tauritavern-events'), 'README event verifier missing');
    assert.ok(options.verification.includes('verify:tauritavern-events'), 'verification event verifier missing');
    assert.ok(options.plan.includes('verify:tauritavern-events'), 'plan event verifier missing');
    for (const eventName of REQUIRED_TT_SYNC_EVENTS) {
        assert.ok(options.verification.includes(eventName), `${eventName} missing from verification doc`);
    }
    for (const surfaceName of REQUIRED_TT_SYNC_DIFF_CONFLICT_SURFACES) {
        assert.ok(options.verification.includes(surfaceName), `${surfaceName} missing from verification doc`);
    }
    for (const fields of Object.values(REQUIRED_TT_SYNC_EVENT_FIELDS)) {
        for (const field of fields) {
            assert.ok(options.verification.includes(field), `${field} missing from verification doc`);
        }
    }
}

function assertFinalEvidenceManifestDocumented(options) {
    assert.ok(options.readme.includes('--manifest /tmp/tt-sync-final-evidence-report.json'), 'README final evidence manifest output missing');
    assert.ok(options.verification.includes('--manifest /tmp/tt-sync-final-evidence-report.json'), 'verification final evidence manifest output missing');
    assert.ok(options.plan.includes('--manifest <final-evidence-report.json>'), 'plan final evidence manifest output missing');
    assert.ok(options.contract.includes('--manifest <final-evidence-report.json>'), 'contract final evidence manifest output missing');
    assert.ok(options.verifier.includes('--manifest <final-evidence-report.json>'), 'verifier usage manifest output missing');
    assert.ok(options.contract.includes('event surface report reference consistency'), 'contract final evidence event surface reference missing');
    assert.ok(options.readme.includes('event surface report reference consistency'), 'README final evidence event surface reference missing');
    assert.ok(options.plan.includes('event surface report reference consistency'), 'plan final evidence event surface reference missing');
    assert.ok(options.verification.includes('event surface report reference consistency'), 'verification final evidence event surface reference missing');
    assert.ok(options.readme.includes('--mobile-commands /tmp/tt-sync-mobile-command-report.json'), 'README final evidence mobile command input missing');
    assert.ok(options.readme.includes('--desktop-commands /tmp/tt-sync-desktop-command-report.json'), 'README final evidence desktop command input missing');
    assert.ok(options.verification.includes('--mobile-commands /tmp/tt-sync-mobile-command-report.json'), 'verification final evidence mobile command input missing');
    assert.ok(options.verification.includes('--desktop-commands /tmp/tt-sync-desktop-command-report.json'), 'verification final evidence desktop command input missing');
    assert.ok(options.plan.includes('--mobile-commands <mobile-command-report.json>'), 'plan final evidence mobile command input missing');
    assert.ok(options.plan.includes('--desktop-commands <desktop-command-report.json>'), 'plan final evidence desktop command input missing');
    assert.ok(options.readme.includes('--events /tmp/tt-sync-event-report.json'), 'README final evidence event input missing');
    assert.ok(options.verification.includes('--events /tmp/tt-sync-event-report.json'), 'verification final evidence event input missing');
    assert.ok(options.plan.includes('--events <event-report.json>'), 'plan final evidence event input missing');
    assert.ok(options.readme.includes('--mobile-command-report /tmp/tt-sync-mobile-command-report.json'), 'README device template mobile report input missing');
    assert.ok(options.verification.includes('--mobile-command-report /tmp/tt-sync-mobile-command-report.json'), 'verification device template mobile report input missing');
    assert.ok(options.plan.includes('--mobile-command-report'), 'plan device template mobile report input missing');
    assert.ok(options.readme.includes('command names'), 'README device template command names missing');
    assert.ok(options.verification.includes('command names'), 'verification device template command names missing');
    assert.ok(options.readme.includes('sourceKind=build-artifact'), 'README build-artifact final evidence policy missing');
    assert.ok(options.verification.includes('sourceKind=build-artifact'), 'verification build-artifact final evidence policy missing');
    assert.ok(options.plan.includes('sourceKind=build-artifact'), 'plan build-artifact final evidence policy missing');
    assert.ok(options.readme.includes('sourceKind=source-tree'), 'README source-tree event final evidence policy missing');
    assert.ok(options.verification.includes('sourceKind=source-tree'), 'verification source-tree event final evidence policy missing');
    assert.ok(options.plan.includes('sourceKind=source-tree'), 'plan source-tree event final evidence policy missing');
    assert.ok(options.readme.includes('非範例絕對路徑'), 'README real deploy path policy missing');
    assert.ok(options.verification.includes('非範例絕對路徑'), 'verification real deploy path policy missing');
    assert.ok(options.plan.includes('非範例絕對路徑'), 'plan real deploy path policy missing');
    assert.ok(options.readme.includes('placeholder or reserved domains'), 'README placeholder URL policy missing');
    assert.ok(options.verification.includes('placeholder or reserved domains'), 'verification placeholder URL policy missing');
    assert.ok(options.plan.includes('placeholder or reserved domains'), 'plan placeholder URL policy missing');
    assert.ok(options.verification.includes('.test'), 'verification reserved domain examples missing');
    assert.ok(options.readme.includes('credentials/query/fragment'), 'README URL cleanliness policy missing');
    assert.ok(options.verification.includes('credentials/query/fragment'), 'verification URL cleanliness policy missing');
    assert.ok(options.plan.includes('credentials/query/fragment'), 'plan URL cleanliness policy missing');
}

function assertDeviceRequirementDocumented(options) {
    const [key, _label, fieldSpecs] = options.item;
    assert.ok(options.verification.includes(key), `${key} missing from verification doc`);
    for (const fieldSpec of fieldSpecs) {
        assert.ok(options.verification.includes(fieldSpec[0]), `${fieldSpec[0]} missing from verification doc`);
    }
}
