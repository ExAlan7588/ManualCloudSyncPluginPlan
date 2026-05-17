# Batch 47 - Validate namespace device arrays

## Scope

- Audit and minimally fix device record helpers for malformed persisted namespace devices.
- Do not change valid pairing, device update, or history behavior.

## Finding

Device helpers call `record.devices.push()` and `record.devices.find()` directly. If persisted namespace JSON stores `devices` as a non-array value, pairing/session update paths surface low-level method errors instead of an explicit namespace data-shape error.

## Validation

- Focused regression: `timeout 60s node server/test/storage-records-run-tests.js`
- Full checks: `timeout 60s npm run check` and `timeout 60s npm test`
