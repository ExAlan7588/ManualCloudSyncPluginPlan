# Batch 72 - Queue manifest text display hardening

## Finding

The queue renderer writes manifest text fields such as `file`, `createdAt`, and
`deviceId` directly into DOM text or template strings. Malformed truthy objects
can therefore appear as `[object Object]` in the queue UI.

## Scope

- Preserve normal string and finite number display.
- Treat malformed non-scalar display fields as absent.
- Keep queue deletion callback wiring unchanged.
- Extend the focused queue renderer test file.

## Validation

- `node tools/test/queue-renderer-run-tests.js`
- `npm run check`
- `npm test`
