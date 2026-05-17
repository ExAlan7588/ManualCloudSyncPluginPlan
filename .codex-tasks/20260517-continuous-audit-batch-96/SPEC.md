# Batch 96 - TT-Sync Conflict Entry Validation

## Scope

Audit TT-Sync conflict local/remote entry shape handling.

## Constraints

- Do not change valid conflict entry rendering.
- Do not change missing local/remote entry behavior.
- Reject malformed truthy local/remote entries instead of rendering them as missing metadata.

## Finding

`entryText()` treats any truthy `local/remote` entry as an object. Primitive entries such as strings render as `未回傳` metadata, hiding malformed conflict payloads.

## Validation

- `node tools/test/tt-sync-view-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`
- `git diff --check`
