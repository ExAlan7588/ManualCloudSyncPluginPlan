# Batch 106 - Pairing URI Endpoint Validation

## Scope

Audit `/v2/pair/complete` pairing URI endpoint validation.

## Constraints

- Do not change valid `tt-sync://pair` behavior.
- Do not change pairing response shape.
- Reuse existing endpoint safety rules for URI-derived endpoints.

## Finding

`pairingBodyFromUri()` validates the outer `tt-sync://` scheme but forwards the embedded `endpoint` string without checking scheme, credentials, or fragments.

## Validation

- `node server/test/routes-unit-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`
- `git diff --check`
