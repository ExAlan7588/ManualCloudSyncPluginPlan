import assert from 'node:assert/strict';
import {
    installAccountPanelFixture,
    runAccountPanelAction,
} from './frontend-account-panel-fixture.js';
import { bindTtSyncAccountPanel } from '../../modules/tt-sync-account.js';

const ACCOUNT_PANEL_IDS = Object.freeze([
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
]);

await testAccountRejectsMalformedSessionToken();
await testAccountRejectsMalformedSessionNamespace();
await testAccountRejectsMalformedPairingUri();
await testAccountIgnoresMalformedPairingExpiry();
await testAccountListFiltersMalformedTextFields();
console.log('ok - TT-Sync account validates session payloads');

async function testAccountRejectsMalformedSessionToken() {
    const { elements, fetch, restore } = installAccountPanelFixture(ACCOUNT_PANEL_IDS, {}, {
        login: {
            accessToken: { value: 'access-token' },
            namespace: 'default',
            refreshToken: 'refresh-token',
        },
    });
    try {
        bindTtSyncAccountPanel({ fetch, runAction: runAccountPanelAction });
        await assert.rejects(
            elements.mcs_tts_account_login.handlers.click(),
            /帳號登入回應缺少 token/,
        );
        assert.equal(elements.mcs_tts_account_status.textContent, '尚未登入');
    } finally {
        restore();
    }
}

async function testAccountListFiltersMalformedTextFields() {
    const { elements, fetch, restore } = installAccountPanelFixture(ACCOUNT_PANEL_IDS, {}, {
        devices: {
            devices: [{
                deviceId: { value: 'device-1' },
                deviceName: { value: 'laptop' },
                lastSeenAt: true,
                lastSyncAt: '2026-05-17T00:00:00Z',
            }],
        },
        history: {
            history: [{
                committedAt: { value: '2026-05-17T00:00:00Z' },
                downloads: 1,
                kind: false,
                planId: { value: 'plan-1' },
                uploads: 2,
            }],
        },
    });
    try {
        bindTtSyncAccountPanel({ fetch, runAction: runAccountPanelAction });
        await elements.mcs_tts_account_login.handlers.click();
        const deviceText = elements.mcs_tts_account_devices.children[0].textContent;
        const historyText = elements.mcs_tts_account_history.children[0].textContent;
        assert.equal(deviceText.includes('[object Object]'), false);
        assert.equal(deviceText.includes('true'), false);
        assert.ok(deviceText.includes('sync=2026-05-17T00:00:00Z'));
        assert.equal(historyText.includes('[object Object]'), false);
        assert.equal(historyText.includes('false'), false);
        assert.ok(historyText.includes('up=2'));
        assert.ok(historyText.includes('down=1'));
    } finally {
        restore();
    }
}

async function testAccountRejectsMalformedPairingUri() {
    const { elements, fetch, restore } = installAccountPanelFixture(ACCOUNT_PANEL_IDS, {}, {
        pairingUri: {
            expiresAt: '2026-05-17T00:00:00Z',
            pairingUri: { value: 'tt-sync://pair/test' },
        },
    });
    try {
        bindTtSyncAccountPanel({ fetch, runAction: runAccountPanelAction });
        await elements.mcs_tts_account_login.handlers.click();
        await assert.rejects(
            elements.mcs_tts_account_pairing_uri.handlers.click(),
            /帳號配對回應缺少 pairingUri/,
        );
        assert.equal(elements.mcs_tts_account_generated_uri.value, '');
        assert.equal(elements.mcs_tts_pair_uri.value, '');
    } finally {
        restore();
    }
}

async function testAccountIgnoresMalformedPairingExpiry() {
    const { elements, fetch, restore } = installAccountPanelFixture(ACCOUNT_PANEL_IDS, {}, {
        pairingUri: {
            expiresAt: { value: '2026-05-17T00:00:00Z' },
            pairingUri: 'tt-sync://pair/test',
        },
    });
    try {
        bindTtSyncAccountPanel({ fetch, runAction: runAccountPanelAction });
        await elements.mcs_tts_account_login.handlers.click();
        await elements.mcs_tts_account_pairing_uri.handlers.click();
        assert.equal(elements.mcs_tts_account_status.textContent, '配對 URI 已產生 | namespace=default');
        assert.equal(elements.mcs_tts_account_generated_uri.value, 'tt-sync://pair/test');
    } finally {
        restore();
    }
}

async function testAccountRejectsMalformedSessionNamespace() {
    const { elements, fetch, restore } = installAccountPanelFixture(ACCOUNT_PANEL_IDS, {}, {
        login: {
            accessToken: 'access-token',
            namespace: { value: 'default' },
            refreshToken: 'refresh-token',
        },
    });
    try {
        bindTtSyncAccountPanel({ fetch, runAction: runAccountPanelAction });
        await assert.rejects(
            elements.mcs_tts_account_login.handlers.click(),
            /帳號登入回應 namespace 格式不正確/,
        );
        await assert.rejects(
            elements.mcs_tts_account_pairing_uri.handlers.click(),
            /請先登入 TT-Sync 帳號/,
        );
    } finally {
        restore();
    }
}
