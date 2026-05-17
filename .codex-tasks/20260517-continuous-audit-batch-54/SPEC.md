# Batch 54 - Validate Tauri session devices list

## Scope

- Audit and minimally fix Tauri session device lookup for malformed persisted namespace devices.
- Do not change valid Tauri session authentication, signature validation, or response behavior.

## Finding

The route-level `pairedDevice()` helper still reads `(record.devices || []).find(...)`. If persisted namespace JSON stores `devices` as a non-array value, Tauri session open returns a low-level method error instead of the explicit namespace-shape error used by storage record helpers.

## Validation

- Focused regression: `timeout 60s node server/test/routes-unit-run-tests.js`
- Full checks: `timeout 60s npm run check` and `timeout 60s npm test`
