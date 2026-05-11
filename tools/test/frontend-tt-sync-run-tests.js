import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    backendCommandMissingMessage,
    isTtSyncCommandMissingError,
    normalizeError,
} from '../../modules/errors.js';
import { REQUIRED_TT_SYNC_COMMANDS } from '../verify-tauritavern-tt-sync.js';

const SETTINGS_HTML = new URL('../../settings.html', import.meta.url);
const TT_SYNC_MODULE = new URL('../../modules/tt-sync.js', import.meta.url);

const REQUIRED_TT_SYNC_IDS = Object.freeze([
    'mcs_tts_pair_uri',
    'mcs_tts_device_name',
    'mcs_tts_pair',
    'mcs_tts_refresh_servers',
    'mcs_tts_server',
    'mcs_tts_check_diff',
    'mcs_tts_push',
    'mcs_tts_pull',
    'mcs_tts_unpair',
    'mcs_tts_summary',
    'mcs_tts_progress',
    'mcs_tts_conflicts',
]);

const tests = [
    ['TT-Sync settings UI exposes required controls', testRequiredUiIds],
    ['TT-Sync frontend calls required backend commands', testRequiredCommands],
    ['TT-Sync transfer sends conflict decisions after conflict guard', testConflictDecisionPayload],
    ['TT-Sync missing backend commands show explicit no-mock error', testMissingTtSyncCommandError],
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

async function testRequiredUiIds() {
    const html = await readFile(SETTINGS_HTML, 'utf8');
    for (const id of REQUIRED_TT_SYNC_IDS) {
        assert.ok(html.includes(`id="${id}"`), `${id} is missing from settings.html`);
    }
}

async function testRequiredCommands() {
    const source = await readFile(TT_SYNC_MODULE, 'utf8');
    for (const command of REQUIRED_TT_SYNC_COMMANDS) {
        assert.ok(source.includes(`'${command}'`), `${command} is missing from modules/tt-sync.js`);
    }
}

async function testConflictDecisionPayload() {
    const source = await readFile(TT_SYNC_MODULE, 'utf8');
    const guardIndex = source.indexOf('assertNoUnresolvedConflicts(state);');
    const invokeIndex = source.indexOf('deps.invokeCommand(TT_COMMANDS[direction]');
    assert.ok(guardIndex >= 0, 'transfer must guard unresolved conflicts');
    assert.ok(invokeIndex > guardIndex, 'transfer must guard conflicts before invoking backend');
    assert.ok(source.includes('conflictDecisions: state.conflictDecisions'), 'transfer dto must include conflict decisions');
}

function testMissingTtSyncCommandError() {
    const expectedMessage = backendCommandMissingMessage(new Error('Command tt_sync_pair not found'));
    assert.ok(expectedMessage.includes('TT-Sync'), 'TT-Sync missing-command message must name TT-Sync');
    assert.ok(expectedMessage.includes('不會模擬成功'), 'TT-Sync missing-command message must reject mock success');

    for (const command of REQUIRED_TT_SYNC_COMMANDS) {
        const error = new Error(`Command ${command} not found`);
        assert.equal(isTtSyncCommandMissingError(error), true, `${command} should be detected as missing`);
        assert.equal(backendCommandMissingMessage(error), expectedMessage, `${command} should use TT-Sync message`);
        assert.equal(normalizeError(error), expectedMessage, `${command} should normalize to TT-Sync message`);
    }

    const cloudSyncMessage = backendCommandMissingMessage(new Error('Command cloud_sync_upload_now not found'));
    assert.notEqual(cloudSyncMessage, expectedMessage, 'cloud sync missing commands must keep separate messaging');
}
