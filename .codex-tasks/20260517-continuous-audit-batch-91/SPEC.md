# Batch 91 - TT-Sync Command Payload Shape Boundary

## Scope

Audit TT-Sync command result payload shape handling.

## Constraints

- Do not change valid object payload handling.
- Do not alter transfer commands, cancel flow, or event handlers.
- Keep malformed array results from being treated as successful transfer artifact payloads.

## Finding

`hasObjectPayload()` treats non-empty arrays as object payloads. A malformed command result array can be interpreted as transfer artifacts and clear active transfer state instead of waiting for real terminal events.

## Validation

- `node tools/test/tt-sync-view-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`
- `git diff --check`
