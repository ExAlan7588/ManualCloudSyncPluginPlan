# Continuous Audit Batch 28

## Scope

Audit frontend progress percent formatting for malformed API status payloads.

## Finding

`modules/format.js` formats data archive `progress_percent` with
`Number(value)`. Malformed values such as booleans or `0x10` strings can be
displayed as valid percentages.

## Constraints

- Do not change valid progress percent display behavior.
- Keep number values and normal decimal strings valid.
- Treat malformed progress percent values as unavailable.

## Validation

- `timeout 60s node tools/test/frontend-tt-sync-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`
