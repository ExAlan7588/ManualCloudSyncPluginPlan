# Continuous Audit Batch 27

## Scope

Audit queue renderer size display for malformed queue metadata.

## Finding

`modules/queue-renderer.js` displays queue item size with
`formatBytes(Number(manifest.sizeBytes || 0))`. Missing or malformed sizes can
look like valid values, such as `0 B` or `16 B`.

## Constraints

- Do not change valid queue rendering behavior.
- Keep number values and decimal digit strings valid.
- Display malformed or missing queue sizes as unavailable rather than valid.

## Validation

- `timeout 60s node tools/test/frontend-tt-sync-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`
