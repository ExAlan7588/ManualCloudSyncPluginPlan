# Batch 104 - TT-Sync Server Display Alias Validation

## Scope

Audit TT-Sync server display alias selection for malformed primary fields.

## Constraints

- Do not change valid server label or base URL output.
- Do not add new server fields.
- Preserve existing alias precedence when values are valid.

## Finding

`serverLabel()` and `serverBaseUrl()` use `||` before validating display text. A truthy malformed primary field can shadow a later valid alias, causing the UI to lose a valid server name or endpoint.

Full validation also exposed an unrelated test stability bug: `startServer({ port: 0 })` can receive a Fetch-blocked port from the OS, causing Fetch clients to fail with `bad port`.

## Validation

- `node tools/test/tt-sync-view-run-tests.js`
- `node server/test/run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`
- `git diff --check`
