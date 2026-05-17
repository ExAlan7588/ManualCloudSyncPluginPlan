import assert from 'node:assert/strict';
import {
    hasObjectPayload,
    renderConflictList,
    serverListFrom,
    serverLabel,
    serverStatus,
} from '../../modules/tt-sync-view.js';

testServerListFromRejectsMalformedServers();
testServerListFromRejectsMalformedServerItems();
testServerListFromRejectsMalformedServerIds();
testServerListFromKeepsMissingServersBehavior();
testHasObjectPayloadRejectsArrays();
testServerStatusRejectsMalformedPermissionText();
testServerStatusRejectsMalformedPermissionContainers();
testServerDisplayTextFiltersMalformedValues();
testServerStatusTimestampBoundaryValues();
testRenderConflictListRejectsMalformedConflicts();
testRenderConflictListRejectsMalformedConflictItems();
testRenderConflictListRejectsMalformedConflictEntries();
testRenderConflictListRejectsMalformedConflictPaths();
testRenderConflictListIgnoresMalformedSummaryObjects();
testRenderConflictListKeepsMissingConflictPayloadBehavior();
console.log('ok - TT-Sync view validates conflict payloads');

function testServerListFromRejectsMalformedServers() {
    assert.throws(
        () => serverListFrom({ servers: {} }),
        /TT-Sync 服務端列表格式不正確/,
    );
}

function testServerListFromRejectsMalformedServerItems() {
    assert.throws(
        () => serverListFrom({ servers: [null] }),
        /TT-Sync 服務端列表格式不正確/,
    );
    assert.throws(
        () => serverListFrom(['bad']),
        /TT-Sync 服務端列表格式不正確/,
    );
}

function testServerListFromRejectsMalformedServerIds() {
    assert.throws(
        () => serverListFrom({ servers: [{ server_device_id: { value: 'server-1' } }] }),
        /TT-Sync 服務端列表格式不正確/,
    );
    assert.throws(
        () => serverListFrom([{ name: 'Desktop' }]),
        /TT-Sync 服務端列表格式不正確/,
    );
}

function testServerListFromKeepsMissingServersBehavior() {
    assert.deepEqual(serverListFrom({ ok: true }), []);
}

function testHasObjectPayloadRejectsArrays() {
    assert.equal(hasObjectPayload(['unexpected']), false);
    assert.equal(hasObjectPayload({ direction: 'push' }), true);
}

function testServerStatusRejectsMalformedPermissionText() {
    const status = serverStatus({
        permissions: {
            mirror_delete: { value: true },
            read: 'false',
            write: true,
        },
    });
    assert.ok(status.includes('read=未回傳'));
    assert.ok(status.includes('write=yes'));
    assert.ok(status.includes('mirror_delete=未回傳'));
}

function testServerStatusRejectsMalformedPermissionContainers() {
    assert.equal(serverStatus({ permissions: [] }), '權限：未回傳');
}

function testServerDisplayTextFiltersMalformedValues() {
    const label = serverLabel({
        base_url: { value: 'https://sync.example.test' },
        server_device_id: 'server-1',
        server_device_name: { value: 'Desktop' },
    });
    const status = serverStatus({
        base_url: { value: 'https://sync.example.test' },
    });
    assert.equal(label.includes('[object Object]'), false);
    assert.equal(label, 'server-1');
    assert.equal(status.includes('[object Object]'), false);
    assert.equal(status, '已選擇服務端');
}

function testServerStatusTimestampBoundaryValues() {
    const zeroStatus = serverStatus({ last_sync_ms: 0 });
    const malformedStatus = serverStatus({ last_sync_ms: { value: 0 } });
    assert.ok(zeroStatus.includes('最後同步：1970-01-01T00:00:00.000Z'));
    assert.equal(malformedStatus.includes('最後同步：'), false);
}

function testRenderConflictListRejectsMalformedConflicts() {
    const { elements, restore } = installDocumentFixture();
    try {
        assert.throws(
            () => renderConflictList(stateFixture(), { conflicts: {} }),
            /TT-Sync 衝突列表格式不正確/,
        );
        assert.equal(elements.mcs_tts_conflicts.children.length, 0);
    } finally {
        restore();
    }
}

function testRenderConflictListRejectsMalformedConflictItems() {
    const { elements, restore } = installDocumentFixture();
    try {
        assert.throws(
            () => renderConflictList(stateFixture(), { conflicts: [null] }),
            /TT-Sync 衝突列表格式不正確/,
        );
        assert.equal(elements.mcs_tts_conflicts.children.length, 0);
    } finally {
        restore();
    }
}

function testRenderConflictListRejectsMalformedConflictEntries() {
    const { elements, restore } = installDocumentFixture();
    try {
        assert.throws(
            () => renderConflictList(stateFixture(), {
                conflicts: [{ local: 'bad', path: 'save.json', remote: { sizeBytes: 1 } }],
            }),
            /TT-Sync 衝突列表格式不正確/,
        );
        assert.equal(elements.mcs_tts_conflicts.children.length, 0);
    } finally {
        restore();
    }
}

function testRenderConflictListRejectsMalformedConflictPaths() {
    const { elements, restore } = installDocumentFixture();
    try {
        assert.throws(
            () => renderConflictList(stateFixture(), {
                conflicts: [{ local: { sizeBytes: 1 }, remote: { sizeBytes: 2 } }],
            }),
            /TT-Sync 衝突列表格式不正確/,
        );
        assert.equal(elements.mcs_tts_conflicts.children.length, 0);
    } finally {
        restore();
    }
}

function testRenderConflictListIgnoresMalformedSummaryObjects() {
    const { elements, restore } = installDocumentFixture();
    try {
        renderConflictList(stateFixture(), { conflictFiles: 1, summary: [] });
        assert.equal(elements.mcs_tts_conflicts.children.length, 1);
        assert.equal(elements.mcs_tts_conflicts.children[0].textContent, '衝突內容未回傳');
    } finally {
        restore();
    }
}

function testRenderConflictListKeepsMissingConflictPayloadBehavior() {
    const { elements, restore } = installDocumentFixture();
    try {
        renderConflictList(stateFixture(), { summary: { conflictFiles: 1 } });
        assert.equal(elements.mcs_tts_conflicts.children.length, 1);
        assert.equal(elements.mcs_tts_conflicts.children[0].textContent, '衝突內容未回傳');
    } finally {
        restore();
    }
}

function installDocumentFixture() {
    const previousDocument = globalThis.document;
    const elements = { mcs_tts_conflicts: testElement('div') };
    globalThis.document = {
        createElement: testElement,
        getElementById(id) {
            assert.ok(elements[id], `missing fixture element ${id}`);
            return elements[id];
        },
    };
    return {
        elements,
        restore() {
            restoreGlobal('document', previousDocument);
        },
    };
}

function stateFixture() {
    return {
        conflictChoices: new Map(),
        lastConflictPayload: null,
    };
}

function testElement(tagName) {
    return {
        children: [],
        className: '',
        tagName,
        textContent: '',
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
