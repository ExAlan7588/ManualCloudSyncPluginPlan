import assert from 'node:assert/strict';

export function installAccountPanelFixture(ids, historyItem, overrides = {}) {
    const previousDocument = globalThis.document;
    const previousDollar = globalThis.$;
    const elements = accountPanelElements(ids);
    globalThis.document = accountPanelDocument(elements);
    globalThis.$ = selector => jqueryElement(elements[selector.replace(/^#/, '')]);
    return {
        elements,
        fetch: accountPanelFetch(historyItem, overrides),
        restore() {
            restoreGlobal('document', previousDocument);
            restoreGlobal('$', previousDollar);
        },
    };
}

export async function runAccountPanelAction(_message, callback) {
    await callback();
}

function accountPanelElements(ids) {
    const elements = Object.fromEntries(ids.map(id => [id, testElement('div')]));
    elements.mcs_tts_account_endpoint.value = 'https://sync.example.test';
    elements.mcs_tts_account_namespace.value = 'default';
    elements.mcs_tts_account_password.value = 'test-password';
    elements.mcs_tts_account_spki.value = 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE';
    elements.mcs_tts_account_username.value = 'test-user';
    return elements;
}

function accountPanelDocument(elements) {
    return {
        createElement: testElement,
        querySelector(selector) {
            const element = elements[selector.replace(/^#/, '')];
            assert.ok(element, `${selector} fixture element must exist`);
            return element;
        },
    };
}

function jqueryElement(element) {
    assert.ok(element, 'jQuery fixture element must exist');
    return {
        on(event, handler) {
            element.handlers[event] = handler;
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

function accountPanelFetch(historyItem, overrides) {
    return async (input, init = {}) => {
        const url = new URL(input);
        return jsonResponse(accountPanelPayload({
            historyItem,
            init,
            overrides,
            pathname: url.pathname,
        }));
    };
}

function accountPanelPayload(options) {
    if (options.pathname === '/v2/account/login') {
        if (Object.hasOwn(options.overrides, 'login')) {
            return options.overrides.login;
        }
        return { accessToken: 'access-token', namespace: 'default', refreshToken: 'refresh-token' };
    }
    if (options.pathname === '/v2/devices') {
        if (Object.hasOwn(options.overrides, 'devices')) {
            return options.overrides.devices;
        }
        return { devices: [] };
    }
    if (options.pathname === '/v2/history') {
        if (Object.hasOwn(options.overrides, 'history')) {
            return options.overrides.history;
        }
        return { history: [{ kind: 'sync', planId: 'plan-1', ...options.historyItem }] };
    }
    if (options.pathname === '/v2/account/pairing-uri') {
        assert.equal(options.init?.headers?.Authorization, 'Bearer access-token');
        if (Object.hasOwn(options.overrides, 'pairingUri')) {
            return options.overrides.pairingUri;
        }
        return { expiresAt: '2026-05-17T00:00:00Z', pairingUri: 'tt-sync://pair/test' };
    }
    throw new Error(`Unexpected account panel route: ${options.pathname}`);
}

function jsonResponse(payload) {
    return new Response(JSON.stringify(payload), { status: 200 });
}

function testElement(tagName) {
    return {
        children: [],
        className: '',
        handlers: {},
        tagName,
        textContent: '',
        value: '',
        appendChild(item) {
            this.children.push(item);
            return item;
        },
        replaceChildren(...items) {
            this.children = [...items];
        },
    };
}

function restoreGlobal(name, value) {
    if (value === undefined) {
        delete globalThis[name];
        return;
    }
    globalThis[name] = value;
}
