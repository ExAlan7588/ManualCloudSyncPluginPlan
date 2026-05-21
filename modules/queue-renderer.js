import { SHA_PREVIEW_LENGTH } from './constants.js';
import { formatBytes } from './format.js';
import { nonNegativeIntegerValue, scalarText } from './payload.js';

const UNKNOWN_SIZE_TEXT = '大小：未回傳';

export function renderQueue(queue, onDeleteRemoteItem) {
    const container = document.getElementById('mcs_queue');
    container.replaceChildren();
    if (!Array.isArray(queue) || queue.length === 0) {
        container.appendChild(emptyQueueElement());
        return;
    }

    for (const item of queue) {
        container.appendChild(queueItemElement(item, onDeleteRemoteItem));
    }
}

function emptyQueueElement() {
    const element = document.createElement('small');
    element.className = 'extensions_info mcs-empty';
    element.textContent = '佇列是空的';
    return element;
}

function queueItemElement(item, onDeleteRemoteItem) {
    const root = document.createElement('div');
    root.className = 'mcs-item';
    root.appendChild(queueItemMain(item));
    root.appendChild(deleteButton(item?.manifest?.file, onDeleteRemoteItem));
    return root;
}

function queueItemMain(item) {
    const main = document.createElement('div');
    main.className = 'mcs-item-main';
    const title = document.createElement('div');
    title.className = 'mcs-item-title';
    title.textContent = queueText(item?.manifest?.file);
    const meta = document.createElement('div');
    meta.className = 'mcs-item-meta';
    meta.textContent = queueItemMeta(item);
    main.append(title, meta);
    return main;
}

function queueItemMeta(item) {
    const manifest = item?.manifest || {};
    const deviceId = queueText(manifest.deviceId);
    return [
        queueSizeText(manifest.sizeBytes),
        queueText(manifest.createdAt),
        deviceId ? `來源：${deviceId}` : '',
        queueShaText(manifest.sha256),
    ].filter(Boolean).join(' | ');
}

function queueText(value) {
    return scalarText(value);
}

function queueShaText(value) {
    if (typeof value !== 'string' || value.trim() === '') {
        return '';
    }
    return `SHA-256：${value.slice(0, SHA_PREVIEW_LENGTH)}`;
}

function queueSizeText(value) {
    const sizeBytes = nonNegativeIntegerValue(value);
    return Number.isFinite(sizeBytes) ? formatBytes(sizeBytes) : UNKNOWN_SIZE_TEXT;
}

function deleteButton(fileName, onDeleteRemoteItem) {
    const button = document.createElement('button');
    button.className = 'menu_button menu_button_icon margin0';
    button.type = 'button';
    button.title = '刪除遠端項目';
    button.innerHTML = '<i class="fa-solid fa-trash"></i>';
    button.addEventListener('click', () => onDeleteRemoteItem(fileName));
    return button;
}
