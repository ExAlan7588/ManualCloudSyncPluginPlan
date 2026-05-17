# Batch 92 - TT-Sync Server Permission Text Validation

## Scope

Audit TT-Sync server permission status rendering.

## Constraints

- Do not change valid boolean permission rendering.
- Do not change server list or status layout.
- Avoid displaying malformed permission values as granted permissions.

## Finding

`booleanText()` treats any truthy value as `yes`. Malformed permission payloads such as strings or objects can be displayed as granted permissions.

## Validation

- `node tools/test/tt-sync-view-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`
- `git diff --check`
