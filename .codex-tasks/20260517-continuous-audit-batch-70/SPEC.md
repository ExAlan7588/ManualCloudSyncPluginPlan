# Batch 70 - TT-Sync text payload sanitization

## Finding

TT-Sync progress text fields use `String(value || '')`, so malformed non-text
payload values can be rendered directly as `true` or `[object Object]` in the
progress table and status line. This hides payload corruption while showing
misleading UI text.

## Scope

- Keep valid string and number display behavior.
- Treat malformed non-scalar text payloads as `未回傳`.
- Cover progress rows and status text with focused tests.

## Validation

- `node tools/test/tt-sync-view-run-tests.js`
- `npm run check`
- `npm test`
