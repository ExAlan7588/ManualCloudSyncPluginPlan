# Progress

## Audit Finding

The non-Tauri pairing path passes `body.deviceName` directly to storage, where
`addDevice()` stringifies values with `String(deviceName || '')`. `upsertDevice()`
also stores `input.deviceName` directly. Non-string inputs can therefore pollute
device records with coerced or object values.

## Planned Fix

Validate direct pairing `deviceName` at the request boundary and validate device
names again in storage-record helpers. Missing names remain accepted as empty
strings; valid strings still trim as before.

## Implemented Change

Direct pairing now rejects non-string `deviceName` values before storage is
called. `addDevice()` and `upsertDevice()` share the same device-name rule, so
internal helper use cannot persist coerced object values either.

## Validation

- `node server/test/routes-unit-run-tests.js`
- `node server/test/storage-records-run-tests.js`
- `node server/test/run-tests.js`
- `node server/test/account-run-tests.js`
- `node server/test/tt-sync-server-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`
- `git diff --check`
