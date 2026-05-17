# Continuous Audit Batch 18

## Scope

Audit runtime TT-Sync server port parsing for minimal validation fixes.

## Finding

`server/tt-sync-server.js` parses `options.port` and `TT_SYNC_PORT` with
`Number(value)`. That accepts non-decimal JavaScript number syntax such as
`0x2500`, allowing malformed runtime configuration to be silently normalized
when starting the server or generating pairing URIs.

## Constraints

- Do not change TT-Sync API shapes or valid runtime behavior.
- Preserve explicit `port: 0` support for tests and ephemeral listeners.
- Surface malformed port values with explicit errors.

## Validation

- `timeout 60s node server/test/tt-sync-server-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`
