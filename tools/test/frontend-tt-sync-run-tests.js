import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    installAccountPanelFixture,
    runAccountPanelAction,
} from './frontend-account-panel-fixture.js';
import { importArchiveBlob } from '../../modules/data-migration.js';
import {
    createProgressTracker,
    progressRows,
    resetProgressTracker,
} from '../../modules/tt-sync-progress.js';
import { formatProgress } from '../../modules/format.js';
import { BACKEND_WEBDAV } from '../../modules/constants.js';
import {
    backendCommandMissingMessage,
    isTtSyncCommandMissingError,
    normalizeError,
} from '../../modules/errors.js';
import { renderQueue } from '../../modules/queue-renderer.js';
import {
    compatListQueue,
    hrefFileName,
} from '../../modules/webdav-compat.js';
import {
    diffSummaryRows,
    serverStatus,
    transferSummaryRows,
} from '../../modules/tt-sync-view.js';
import { REQUIRED_TT_SYNC_COMMANDS } from '../verify-tauritavern-tt-sync.js';

const SETTINGS_HTML = new URL('../../settings.html', import.meta.url);
const DATA_MIGRATION_MODULE = new URL('../../modules/data-migration.js', import.meta.url);
const INDEX_MODULE = new URL('../../index.js', import.meta.url);
const TT_SYNC_ACCOUNT_MODULE = new URL('../../modules/tt-sync-account.js', import.meta.url);
const TT_SYNC_MODULE = new URL('../../modules/tt-sync.js', import.meta.url);
const TT_SYNC_VIEW_MODULE = new URL('../../modules/tt-sync-view.js', import.meta.url);
const INVALID_SHA256_HEX = 'A'.repeat(64);
const TEST_MANIFEST_SIZE_BYTES = 1;

const REQUIRED_TT_SYNC_IDS = Object.freeze([
    'mcs_tts_account_devices',
    'mcs_tts_account_endpoint',
    'mcs_tts_account_generated_uri',
    'mcs_tts_account_history',
    'mcs_tts_account_login',
    'mcs_tts_account_namespace',
    'mcs_tts_account_pairing_uri',
    'mcs_tts_account_password',
    'mcs_tts_account_refresh_data',
    'mcs_tts_account_refresh_token',
    'mcs_tts_account_spki',
    'mcs_tts_account_status',
    'mcs_tts_account_username',
    'mcs_tts_pair_uri',
    'mcs_tts_pair',
    'mcs_tts_refresh_servers',
    'mcs_tts_server',
    'mcs_tts_mode',
    'mcs_tts_push',
    'mcs_tts_pull',
    'mcs_tts_cancel',
    'mcs_tts_unpair',
    'mcs_tts_summary',
    'mcs_tts_progress',
    'mcs_tts_diff',
    'mcs_tts_conflicts',
]);

const tests = [
    ['TT-Sync settings UI exposes required controls', testRequiredUiIds],
    ['TT-Sync frontend calls required backend commands', testRequiredCommands],
    ['TT-Sync frontend uses upstream command payloads', testUpstreamCommandPayloads],
    ['TT-Sync conflict UI exposes local and remote choices', testConflictChoiceUi],
    ['TT-Sync account panel uses server account API', testAccountPanelApi],
    ['TT-Sync account endpoint URL errors include context', testAccountEndpointUrlErrors],
    ['TT-Sync account history marks malformed counts unavailable', testAccountHistoryMalformedCounts],
    ['TT-Sync account panel rejects malformed list payloads', testAccountPanelMalformedListPayloads],
    ['TT-Sync account panel labels malformed JSON responses', testAccountPanelMalformedJsonContext],
    ['data migration import labels malformed JSON responses', testDataMigrationImportMalformedJsonContext],
    ['extension module name decode errors include context', testModuleNameDecodeErrorContext],
    ['TT-Sync progress UI derives percent speed and ETA', testProgressMetrics],
    ['TT-Sync progress UI ignores malformed numeric payloads', testProgressIgnoresMalformedNumericPayloads],
    ['TT-Sync summary UI ignores malformed numeric payloads', testSummaryIgnoresMalformedNumericPayloads],
    ['TT-Sync server status preserves malformed timestamp text', testServerStatusPreservesMalformedTimestamp],
    ['WebDAV href decoding reports contextual errors', testWebDavHrefDecodeErrors],
    ['WebDAV manifest rejects uppercase SHA-256', testWebDavManifestRejectsUppercaseSha256],
    ['WebDAV manifest rejects null sizeBytes', testWebDavManifestRejectsNullSizeBytes],
    ['WebDAV manifest rejects fractional sizeBytes', testWebDavManifestRejectsFractionalSizeBytes],
    ['WebDAV manifest rejects non-decimal sizeBytes', testWebDavManifestRejectsNonDecimalSizeBytes],
    ['WebDAV manifest rejects non-ISO createdAt', testWebDavManifestRejectsNonIsoCreatedAt],
    ['queue renderer shows malformed sizeBytes as unavailable', testQueueRendererMalformedSizeBytes],
    ['formatProgress ignores malformed percent values', testFormatProgressMalformedValues],
    ['TT-Sync missing backend commands show explicit no-mock error', testMissingTtSyncCommandError],
    ['frontend avoids load-time runtime hard dependencies', testNoLoadTimeRuntimeHardDependencies],
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
    const viewSource = await readFile(TT_SYNC_VIEW_MODULE, 'utf8');
    assert.ok(source.includes('deps.invokeCommand(TT_COMMANDS.pair, { pairUri })'), 'pair must use pairUri payload');
    assert.ok(source.includes('serverDeviceId: requireSelectedServerId()'), 'transfer must use serverDeviceId payload');
    assert.ok(source.includes('mode: selectedSyncMode()'), 'transfer must send SyncMode payload');
    assert.ok(viewSource.includes('server?.server_device_id'), 'server list must handle upstream snake_case ids');
    assert.ok(viewSource.includes('server?.base_url'), 'server list must handle upstream base_url');
    assert.ok(source.includes('hasObjectPayload(result)'), 'empty command result must not clear event payloads');
    assert.ok(source.includes("cancel: 'tt_sync_cancel'"), 'frontend must call the real cancel command');
    assert.ok(source.includes("cancelled: 'tt_sync:cancelled'"), 'frontend must listen for cancelled events');
    assert.ok(source.includes('renderTransferControls(state.transfer)'), 'frontend must keep transfer controls in sync');
    assert.ok(source.includes('beginTransfer(state.transfer'), 'frontend must mark active transfers before invoking backend');
    assert.ok(source.includes('finishTransfer(state.transfer)'), 'frontend must clear active transfers on terminal states');
    assert.ok(source.includes('renderProgress(result, createProgressTracker())'), 'cancel response payload must be visible');
    assert.ok(source.includes("diff: 'tt_sync:diff'"), 'frontend must subscribe to real diff events');
    assert.ok(source.includes("conflict: 'tt_sync:conflict'"), 'frontend must subscribe to real conflict events');
    assert.ok(source.includes('renderDiffSummary(payload)'), 'frontend must render diff payloads');
    assert.ok(source.includes('renderConflictList(state, payload)'), 'frontend must render conflict payloads');
    assert.equal(source.includes('tt_sync_check_diff'), false, 'frontend must not call absent check_diff command');
    assert.equal(source.includes('conflictDecisions'), false, 'frontend must not send unsupported conflict decisions');
}

async function testConflictChoiceUi() {
    const source = await readFile(TT_SYNC_VIEW_MODULE, 'utf8');
    assert.ok(source.includes('使用本機'), 'frontend must render a local conflict choice');
    assert.ok(source.includes('使用遠端'), 'frontend must render a remote conflict choice');
    assert.ok(source.includes('state.conflictChoices'), 'frontend must track conflict decisions locally');
    assert.ok(source.includes('setConflictDecision(state, conflict, decision)'), 'frontend must update local conflict selection');
    assert.ok(source.includes('renderConflictList(state, state.lastConflictPayload)'), 'frontend must rerender conflict choices after selection');
}

async function testAccountPanelApi() {
    const accountSource = await readFile(TT_SYNC_ACCOUNT_MODULE, 'utf8');
    assert.ok(accountSource.includes('/v2/account/login'), 'account panel must call login endpoint');
    assert.ok(accountSource.includes('/v2/account/pairing-uri'), 'account panel must mint pairing URI');
    assert.ok(accountSource.includes('/v2/devices'), 'account panel must list devices');
    assert.ok(accountSource.includes('/v2/history'), 'account panel must list sync history');
    assert.ok(accountSource.includes('Authorization'), 'account panel must send bearer token');
    assert.ok(accountSource.includes("$('#mcs_tts_pair_uri').val(pairingUri)"), 'generated URI must fill existing pair field');

    const indexSource = await readFile(INDEX_MODULE, 'utf8');
    assert.ok(indexSource.includes('fetch: window.fetch.bind(window)'), 'account panel must receive fetch dependency');
}

async function testAccountEndpointUrlErrors() {
    const accountSource = await readFile(TT_SYNC_ACCOUNT_MODULE, 'utf8');
    assert.ok(accountSource.includes('parseRequiredUrl'), 'account endpoint URL parsing must be isolated for diagnostics');
    assert.ok(accountSource.includes('帳號服務端 URL 格式不正確'), 'invalid account endpoint URLs must include field context');
}

async function testAccountHistoryMalformedCounts() {
    const { elements, fetch, restore } = installAccountPanelFixture(REQUIRED_TT_SYNC_IDS, {
        downloads: true,
        uploads: '0x10',
    });
    try {
        const { bindTtSyncAccountPanel } = await import(TT_SYNC_ACCOUNT_MODULE);
        bindTtSyncAccountPanel({ fetch, runAction: runAccountPanelAction });
        await elements.mcs_tts_account_login.handlers.click();
        const historyText = elements.mcs_tts_account_history.children[0].textContent;
        assert.ok(historyText.includes('up=未回傳'));
        assert.ok(historyText.includes('down=未回傳'));
        assert.equal(historyText.includes('0x10'), false);
        assert.equal(historyText.includes('true'), false);
    } finally {
        restore();
    }
}

async function testAccountPanelMalformedListPayloads() {
    const { elements, fetch, restore } = installAccountPanelFixture(REQUIRED_TT_SYNC_IDS, {}, {
        devices: { devices: 'bad' },
        history: { history: {} },
    });
    try {
        const { bindTtSyncAccountPanel } = await import(TT_SYNC_ACCOUNT_MODULE);
        bindTtSyncAccountPanel({ fetch, runAction: runAccountPanelAction });
        await assert.rejects(
            elements.mcs_tts_account_login.handlers.click(),
            /帳號裝置列表格式不正確/,
        );
    } finally {
        restore();
    }
}

async function testAccountPanelMalformedJsonContext() {
    const { elements, restore } = installAccountPanelFixture(REQUIRED_TT_SYNC_IDS, {});
    try {
        const { bindTtSyncAccountPanel } = await import(TT_SYNC_ACCOUNT_MODULE);
        bindTtSyncAccountPanel({
            fetch: async () => new Response('{ broken', { status: 200 }),
            runAction: runAccountPanelAction,
        });
        await assert.rejects(
            elements.mcs_tts_account_login.handlers.click(),
            /TT-Sync 帳號 \/v2\/account\/login 回應 JSON 無法解析/,
        );
    } finally {
        restore();
    }
}

async function testDataMigrationImportMalformedJsonContext() {
    const previousFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response('{ broken', { status: 200 });
    try {
        await assert.rejects(
            importArchiveBlob(new Blob(['zip']), 'sync.zip', { setStatus() {} }),
            /資料匯入啟動回應 JSON 無法解析/,
        );
    } finally {
        restoreGlobal('fetch', previousFetch);
    }
}

async function testModuleNameDecodeErrorContext() {
    const source = await readFile(INDEX_MODULE, 'utf8');
    assert.ok(source.includes('export function resolveModuleName'), 'resolveModuleName must be exported for focused coverage');
    assert.ok(source.includes('手動雲端同步擴充路徑 URL 編碼不正確'), 'decode failures must include extension URL context');
    assert.ok(source.includes('decodeExtensionPath'), 'module path decoding must be isolated for diagnostics');
}

function testProgressMetrics() {
    const tracker = createProgressTracker();
    resetProgressTracker(tracker, 1000);
    progressRows({
        bytes_done: 0,
        bytes_total: 4096,
        files_done: 0,
        files_total: 4,
        phase: 'Downloading',
    }, tracker, 1000);

    const rows = progressRows({
        bytes_done: 2048,
        bytes_total: 4096,
        current_path: 'default-user/backgrounds/a.jpg',
        files_done: 2,
        files_total: 4,
        partial_upload_safe: true,
        phase: 'Downloading',
    }, tracker, 3000);
    assertProgressRow(rows, '完成度', '50.0%');
    assertProgressRow(rows, '速度', '1.0 KB/s');
    assertProgressRow(rows, '耗時', '2s');
    assertProgressRow(rows, '剩餘', '2s');
    assertProgressRow(rows, '目前檔案', 'default-user/backgrounds/a.jpg');
    assertProgressRow(rows, '部分上傳', '未提交，只暫存，可重試');
}

function testProgressIgnoresMalformedNumericPayloads() {
    const tracker = createProgressTracker();
    resetProgressTracker(tracker, 1000);
    const rows = progressRows({
        bytes_done: true,
        bytes_total: '0x10',
        files_done: '1e2',
        files_total: false,
        phase: 'Downloading',
    }, tracker, 1000);
    assertProgressRow(rows, 'bytes', '未回傳');
    assertProgressRow(rows, 'files', '未回傳');
    assertProgressRow(rows, '完成度', '未回傳');
}

function testSummaryIgnoresMalformedNumericPayloads() {
    const transferRows = transferSummaryRows({
        bytes_total: '0x10',
        direction: 'push',
        files_deleted: false,
        files_total: true,
    });
    assertProgressRow(transferRows, '檔案數', '未回傳');
    assertProgressRow(transferRows, '大小', '未回傳');
    assertProgressRow(transferRows, '刪除檔案', '未回傳');

    const diffRows = diffSummaryRows({
        summary: {
            conflictFiles: true,
            uploadBytes: '0x10',
            uploadFiles: '1e2',
        },
    });
    assertProgressRow(diffRows, '上傳檔案', '未回傳');
    assertProgressRow(diffRows, '上傳大小', '未回傳');
    assertProgressRow(diffRows, '衝突檔案', '未回傳');
}

function testServerStatusPreservesMalformedTimestamp() {
    const status = serverStatus({
        base_url: 'https://sync.example.test',
        last_sync_ms: '0x10',
        permissions: { mirror_delete: true, read: true, write: true },
    });
    assert.ok(status.includes('最後同步：0x10'));
    assert.equal(status.includes('1970-'), false);
}

function assertProgressRow(rows, label, expected) {
    const row = rows.find(item => item.label === label);
    assert.equal(row?.value, expected, `${label} should be ${expected}`);
}

function testWebDavHrefDecodeErrors() {
    assert.equal(hrefFileName('/dav/cloud-sync/sync-0102030405.manifest.json'), 'sync-0102030405.manifest.json');
    assert.throws(
        () => hrefFileName('/dav/cloud-sync/%E0%A4%A.manifest.json'),
        /WebDAV PROPFIND href 編碼不正確/,
    );
}

async function testWebDavManifestRejectsUppercaseSha256() {
    const restoreGlobals = installWebDavQueueFixture({
        manifest: {
            createdAt: new Date().toISOString(),
            file: 'sync-0102030405.zip',
            formatVersion: 1,
            sha256: INVALID_SHA256_HEX,
            sizeBytes: TEST_MANIFEST_SIZE_BYTES,
        },
    });
    try {
        await assert.rejects(
            compatListQueue(),
            /同步 manifest 的 SHA-256 不正確/,
        );
    } finally {
        restoreGlobals();
    }
}

async function testWebDavManifestRejectsNullSizeBytes() {
    const restoreGlobals = installWebDavQueueFixture({
        manifest: {
            createdAt: new Date().toISOString(),
            file: 'sync-0102030405.zip',
            formatVersion: 1,
            sha256: 'a'.repeat(64),
            sizeBytes: null,
        },
    });
    try {
        await assert.rejects(
            compatListQueue(),
            /同步 manifest 的檔案大小不正確/,
        );
    } finally {
        restoreGlobals();
    }
}

async function testWebDavManifestRejectsFractionalSizeBytes() {
    const restoreGlobals = installWebDavQueueFixture({
        manifest: validWebDavManifest({ sizeBytes: 1.5 }),
    });
    try {
        await assert.rejects(
            compatListQueue(),
            /同步 manifest 的檔案大小不正確/,
        );
    } finally {
        restoreGlobals();
    }
}

async function testWebDavManifestRejectsNonDecimalSizeBytes() {
    const restoreGlobals = installWebDavQueueFixture({
        manifest: validWebDavManifest({ sizeBytes: '0x10' }),
    });
    try {
        await assert.rejects(
            compatListQueue(),
            /同步 manifest 的檔案大小不正確/,
        );
    } finally {
        restoreGlobals();
    }
}

async function testWebDavManifestRejectsNonIsoCreatedAt() {
    const restoreGlobals = installWebDavQueueFixture({
        manifest: validWebDavManifest({ createdAt: '0' }),
    });
    try {
        await assert.rejects(
            compatListQueue(),
            /同步 manifest 的建立時間不正確/,
        );
    } finally {
        restoreGlobals();
    }
}

function testQueueRendererMalformedSizeBytes() {
    const { container, restore } = installQueueRendererDocument();
    try {
        renderQueue([{
            manifest: {
                createdAt: '2026-05-17T00:00:00.000Z',
                file: 'sync-0102030405.zip',
                sizeBytes: '0x10',
            },
        }], () => {});
        const meta = container.children[0].children[0].children[1].textContent;
        assert.ok(meta.includes('大小：未回傳'));
        assert.equal(meta.includes('16 B'), false);
    } finally {
        restore();
    }
}

function testFormatProgressMalformedValues() {
    assert.equal(formatProgress(12.5), '12.5%');
    assert.equal(formatProgress('12.5'), '12.5%');
    assert.equal(formatProgress(true), '');
    assert.equal(formatProgress('0x10'), '');
}

function validWebDavManifest(overrides = {}) {
    return {
        createdAt: new Date().toISOString(),
        file: 'sync-0102030405.zip',
        formatVersion: 1,
        sha256: 'a'.repeat(64),
        sizeBytes: TEST_MANIFEST_SIZE_BYTES,
        ...overrides,
    };
}

function installQueueRendererDocument() {
    const previousDocument = globalThis.document;
    const container = testElement('div');
    globalThis.document = {
        createElement: testElement,
        getElementById(id) {
            assert.equal(id, 'mcs_queue');
            return container;
        },
    };
    return {
        container,
        restore() {
            globalThis.document = previousDocument;
        },
    };
}

function testElement(tagName) {
    return {
        children: [],
        className: '',
        innerHTML: '',
        tagName,
        textContent: '',
        title: '',
        type: '',
        addEventListener() {},
        append(...items) {
            this.children.push(...items);
        },
        appendChild(item) {
            this.children.push(item);
            return item;
        },
        replaceChildren(...items) {
            this.children = [...items];
        },
    };
}

function installWebDavQueueFixture(options) {
    const previousDomParser = globalThis.DOMParser;
    const previousFetch = globalThis.fetch;
    const previousLocalStorage = globalThis.localStorage;
    globalThis.DOMParser = FakeDomParser;
    globalThis.fetch = async url => webDavFixtureResponse(url, options.manifest);
    globalThis.localStorage = {
        getItem: () => JSON.stringify({
            config: {
                backend: BACKEND_WEBDAV,
                endpoint: 'https://storage.example.test/dav',
                remotePrefix: 'cloud-sync',
                webdav: { authMode: 'basic', username: 'user' },
            },
            secrets: { webdavPassword: 'pass' },
        }),
    };
    return () => {
        restoreGlobal('DOMParser', previousDomParser);
        restoreGlobal('fetch', previousFetch);
        restoreGlobal('localStorage', previousLocalStorage);
    };
}

function webDavFixtureResponse(url, manifest) {
    if (String(url).endsWith('cloud-sync')) {
        return new Response('<href>/dav/cloud-sync/sync-0102030405.json</href>', { status: 207 });
    }
    return new Response(JSON.stringify(manifest), { status: 200 });
}

function restoreGlobal(name, value) {
    if (value === undefined) {
        delete globalThis[name];
        return;
    }
    globalThis[name] = value;
}

function FakeDomParser() {
    this.parseFromString = text => ({
        getElementsByTagName(name) {
            if (name === 'parsererror') {
                return [];
            }
            return [{ localName: 'href', textContent: text.match(/<href>(.*?)<\/href>/)?.[1] || '' }];
        },
    });
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

async function testNoLoadTimeRuntimeHardDependencies() {
    const source = await readFile(INDEX_MODULE, 'utf8');
    assert.equal(
        source.includes("import { invoke } from '/tauri-bridge.js'"),
        false,
        'frontend must not fail module loading when /tauri-bridge.js is absent',
    );
    assert.ok(source.includes("import('/tauri-bridge.js')"), 'Tauri bridge must be loaded on demand');
    assert.ok(source.includes('Command ${command} not found'), 'missing bridge must surface as explicit command failure');

    const dataMigrationSource = await readFile(DATA_MIGRATION_MODULE, 'utf8');
    assert.equal(
        dataMigrationSource.includes("import { isAndroidRuntime, isIosRuntime } from '/scripts/util/mobile-runtime.js'"),
        false,
        'frontend must not fail module loading when Tauri mobile runtime helper is absent',
    );
    assert.ok(
        dataMigrationSource.includes("import('/scripts/util/mobile-runtime.js')"),
        'mobile runtime helper must be loaded on demand',
    );
}
