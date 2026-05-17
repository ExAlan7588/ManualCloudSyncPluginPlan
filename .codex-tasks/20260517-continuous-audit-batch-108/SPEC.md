# Batch 108 - Progress SSE Error Message Normalization

## Scope

Audit TT-Sync progress SSE error payloads.

## Constraints

- Do not hide polling errors.
- Do not change SSE event names or progress payload shape.
- Reuse HTTP error message normalization for consistency.

## Finding

`writeProgressErrorEvent()` serializes `error.message` directly, so control whitespace can leak into SSE `error` events even after HTTP error responses were normalized.

## Validation

- `node server/test/progress-events-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`
- `git diff --check`
