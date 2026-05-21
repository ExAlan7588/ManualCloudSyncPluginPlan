import assert from 'node:assert/strict';
import { bindTtSyncPanel } from '../../modules/tt-sync.js';

const TT_SYNC_IDS = Object.freeze([
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
    'mcs_tts_cancel',
    'mcs_tts_conflicts',
    'mcs_tts_diff',
    'mcs_tts_mode',
    'mcs_tts_pair',
    'mcs_tts_pair_uri',
    'mcs_tts_progress',
    'mcs_tts_pull',
    'mcs_tts_push',
    'mcs_tts_refresh_servers',
    'mcs_tts_server',
    'mcs_tts_status',
    'mcs_tts_summary',
    'mcs_tts_unpair',
]);

testControllersInstallEventListenersIndependently();
console.log('ok - TT-Sync event listener state is controller scoped');

function testControllersInstallEventListenersIndependently() {
    const { restore } = installTtSyncPanelFixture();
    const events = [];
    try {
        const deps = ttSyncDeps(events);
        bindTtSyncPanel(deps);
        bindTtSyncPanel(deps);
        assert.equal(events.length, 12);
        assert.deepEqual(events.slice(0, 6), events.slice(6));
    } finally {
        restore();
    }
}

function ttSyncDeps(events) {
    return {
        confirm: async () => true,
        fetch: async () => new Response('{}', { status: 200 }),
        invokeCommand: async () => [],
        listen: async eventName => {
            events.push(eventName);
        },
        runAction: async (_message, action) => action(),
        scheduleReload() {},
    };
}

function installTtSyncPanelFixture() {
    const previousDocument = globalThis.document;
    const previousDollar = globalThis.$;
    const elements = ttSyncElements();
    globalThis.document = ttSyncDocument(elements);
    globalThis.$ = selector => jqueryFixture(elements, selector);
    return {
        restore() {
            restoreGlobal('document', previousDocument);
            restoreGlobal('$', previousDollar);
        },
    };
}

function ttSyncElements() {
    const elements = Object.fromEntries(TT_SYNC_IDS.map(id => [id, testElement('div')]));
    elements.mcs_tts_account_endpoint.value = 'https://sync.example.test';
    elements.mcs_tts_account_namespace.value = 'default';
    elements.mcs_tts_mode.value = 'Incremental';
    return elements;
}

function ttSyncDocument(elements) {
    return {
        createElement: testElement,
        getElementById(id) {
            assert.ok(elements[id], `missing fixture element ${id}`);
            return elements[id];
        },
        querySelector(selector) {
            const id = selector.replace(/^#/, '');
            assert.ok(elements[id], `missing fixture element ${selector}`);
            return elements[id];
        },
    };
}

function jqueryFixture(elements, selector) {
    if (selector.includes('button:not')) {
        return jqueryCollection();
    }
    return jqueryElement(elements[selector.replace(/^#/, '')]);
}

function jqueryCollection() {
    return {
        prop() {},
    };
}

function jqueryElement(element) {
    assert.ok(element, 'jQuery fixture element must exist');
    return {
        on(event, handler) {
            element.handlers[event] = handler;
        },
        prop(name, value) {
            element[name] = value;
        },
        text(value) {
            element.textContent = String(value);
        },
        val(value) {
            if (value === undefined) {
                return element.value;
            }
            element.value = String(value);
        },
    };
}

function testElement(tagName) {
    return {
        children: [],
        className: '',
        handlers: {},
        tagName,
        textContent: '',
        value: '',
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

function restoreGlobal(name, previous) {
    if (previous === undefined) {
        delete globalThis[name];
        return;
    }
    globalThis[name] = previous;
}
