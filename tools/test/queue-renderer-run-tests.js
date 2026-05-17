import assert from 'node:assert/strict';
import { renderQueue } from '../../modules/queue-renderer.js';

testQueueRendererSkipsMalformedShaPreview();
testQueueRendererSkipsMalformedTextFields();
console.log('ok - queue renderer handles malformed manifest text');

function testQueueRendererSkipsMalformedShaPreview() {
    const { container, restore } = installDocumentFixture();
    try {
        assert.doesNotThrow(() => renderQueue([{
            manifest: {
                createdAt: '2026-05-17T00:00:00.000Z',
                file: 'sync-0102030405.zip',
                sha256: { digest: 'a'.repeat(64) },
                sizeBytes: 1,
            },
        }], () => {}));
        const meta = container.children[0].children[0].children[1].textContent;
        assert.equal(meta.includes('SHA-256：'), false);
    } finally {
        restore();
    }
}

function testQueueRendererSkipsMalformedTextFields() {
    const { container, restore } = installDocumentFixture();
    try {
        renderQueue([{
            manifest: {
                createdAt: { iso: '2026-05-17T00:00:00.000Z' },
                deviceId: { id: 'phone' },
                file: { name: 'sync-0102030405.zip' },
                sizeBytes: 1,
            },
        }], () => {});
        const title = container.children[0].children[0].children[0].textContent;
        const meta = container.children[0].children[0].children[1].textContent;
        assert.equal(title, '');
        assert.equal(meta.includes('[object Object]'), false);
    } finally {
        restore();
    }
}

function installDocumentFixture() {
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
            restoreGlobal('document', previousDocument);
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

function restoreGlobal(name, previous) {
    if (previous === undefined) {
        delete globalThis[name];
        return;
    }
    globalThis[name] = previous;
}
