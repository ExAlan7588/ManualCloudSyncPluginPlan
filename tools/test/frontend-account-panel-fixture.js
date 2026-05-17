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
        return jsonResponse(accountPanelPayload(url.pathname, historyItem, overrides, init));
    };
}

function accountPanelPayload(pathname, historyItem, overrides, init) {
    if (pathname === '/v2/account/login') {
        if (Object.hasOwn(overrides, 'login')) {
            return overrides.login;
        }
        return { accessToken: 'access-token', namespace: 'default', refreshToken: 'refresh-token' };
    }
    if (pathname === '/v2/devices') {
        if (Object.hasOwn(overrides, 'devices')) {
            return overrides.devices;
        }
        return { devices: [] };
    }
    if (pathname === '/v2/history') {
        if (Object.hasOwn(overrides, 'history')) {
            return overrides.history;
        }
        return { history: [{ kind: 'sync', planId: 'plan-1', ...historyItem }] };
    }
    if (pathname === '/v2/account/pairing-uri') {
        assert.equal(init?.headers?.Authorization, 'Bearer access-token');
        if (Object.hasOwn(overrides, 'pairingUri')) {
            return overrides.pairingUri;
        }
        return { expiresAt: '2026-05-17T00:00:00Z', pairingUri: 'tt-sync://pair/test' };
    }
    throw new Error(`Unexpected account panel route: ${pathname}`);
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
