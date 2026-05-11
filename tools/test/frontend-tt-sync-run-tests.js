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
    'mcs_tts_pair',
    'mcs_tts_refresh_servers',
    'mcs_tts_server',
    'mcs_tts_mode',
    'mcs_tts_push',
    'mcs_tts_pull',
    'mcs_tts_unpair',
    'mcs_tts_summary',
    'mcs_tts_progress',
]);

const tests = [
    ['TT-Sync settings UI exposes required controls', testRequiredUiIds],
    ['TT-Sync frontend calls required backend commands', testRequiredCommands],
    ['TT-Sync frontend uses upstream command payloads', testUpstreamCommandPayloads],
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

async function testUpstreamCommandPayloads() {
    const source = await readFile(TT_SYNC_MODULE, 'utf8');
    assert.ok(source.includes('deps.invokeCommand(TT_COMMANDS.pair, { pairUri })'), 'pair must use pairUri payload');
    assert.ok(source.includes('serverDeviceId: requireSelectedServerId()'), 'transfer must use serverDeviceId payload');
    assert.ok(source.includes('mode: selectedSyncMode()'), 'transfer must send SyncMode payload');
    assert.ok(source.includes('server?.server_device_id'), 'server list must handle upstream snake_case ids');
    assert.ok(source.includes('server?.base_url'), 'server list must handle upstream base_url');
    assert.equal(source.includes('tt_sync_check_diff'), false, 'frontend must not call absent check_diff command');
    assert.equal(source.includes('conflictDecisions'), false, 'frontend must not send unsupported conflict decisions');
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
