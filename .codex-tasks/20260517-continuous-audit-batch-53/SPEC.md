# Batch 53 - Validate account panel list payloads

## Scope

- Audit and minimally fix TT-Sync account panel handling of malformed devices/history response lists.
- Do not change valid account panel rendering or API calls.

## Finding

`loadAccountData()` renders `devices.devices || []` and `history.history || []` without checking array shape. A malformed backend/proxy payload such as `devices: "bad"` or `history: {}` can be rendered as misleading list data instead of surfacing an explicit response-shape error.

## Validation

- Focused regression: `timeout 60s node tools/test/frontend-tt-sync-run-tests.js`
- Full checks: `timeout 60s npm run check` and `timeout 60s npm test`
