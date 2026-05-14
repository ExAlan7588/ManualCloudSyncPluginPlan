const TRANSFER_BUTTON_SELECTOR = '#mcs_tts_panel button:not(#mcs_tts_cancel)';
const CANCEL_BUTTON_SELECTOR = '#mcs_tts_cancel';

export function createTransferState() {
    return {
        active: null,
        cancelRequested: false,
    };
}

export function beginTransfer(state, transfer) {
    state.active = { ...transfer, startedAt: Date.now() };
    state.cancelRequested = false;
    renderTransferControls(state);
}

export function finishTransfer(state) {
    state.active = null;
    state.cancelRequested = false;
    renderTransferControls(state);
}

export function markTransferCancelRequested(state) {
    state.cancelRequested = true;
    renderTransferControls(state);
}

export function clearTransferCancelRequested(state) {
    state.cancelRequested = false;
    renderTransferControls(state);
}

export function hasActiveTransfer(state) {
    return Boolean(state?.active);
}

export function currentTransfer(state) {
    return state?.active || null;
}

export function renderTransferControls(state) {
    const active = hasActiveTransfer(state);
    $(TRANSFER_BUTTON_SELECTOR).prop('disabled', active);
    $(CANCEL_BUTTON_SELECTOR).prop('disabled', !active || state.cancelRequested);
}
