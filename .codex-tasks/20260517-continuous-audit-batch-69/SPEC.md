# Batch 69 - TT-Sync server list payload validation

## Finding

`serverListFrom()` accepts either a raw array or an object containing
`servers`, but if the `servers` field exists with a non-array value it silently
returns an empty list. The TT-Sync settings UI can therefore show "no paired
servers" even when the backend or bridge returned a malformed payload.

## Scope

- Preserve existing behavior for raw array responses.
- Preserve existing behavior when the optional `servers` field is absent.
- Reject present non-array `servers` payloads with an explicit error.
- Extend the focused `tt-sync-view` tests.

## Validation

- `node tools/test/tt-sync-view-run-tests.js`
- `npm run check`
- `npm test`
