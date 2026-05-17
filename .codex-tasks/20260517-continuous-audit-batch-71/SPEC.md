# Batch 71 - Queue manifest SHA display hardening

## Finding

`queueItemMeta()` assumes `manifest.sha256` is a string and calls `.slice()`
when the value is truthy. A malformed queue item with `sha256` as an object or
boolean can crash rendering with a generic TypeError instead of showing a
controlled unavailable value.

## Scope

- Preserve normal SHA-256 preview display for valid strings.
- Avoid rendering malformed SHA-256 values and prevent TypeError crashes.
- Add focused queue renderer coverage without growing the large frontend test.

## Validation

- `node tools/test/queue-renderer-run-tests.js`
- `npm run check`
- `npm test`
