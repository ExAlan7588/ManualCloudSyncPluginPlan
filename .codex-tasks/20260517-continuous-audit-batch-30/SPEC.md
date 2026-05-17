# Continuous Audit Batch 30

## Scope

Audit WebDAV compat manifest `createdAt` timestamp validation.

## Finding

`modules/webdav-compat.js` validates `manifest.createdAt` with `Date.parse()`.
Node accepts non-ISO strings such as `0`, so malformed queue timestamps can pass
and influence queue ordering.

## Constraints

- Do not change valid WebDAV manifest behavior.
- Require datetime strings with `T` and an explicit `Z` or timezone offset.
- Keep existing error wording for invalid creation time.

## Validation

- `timeout 60s node tools/test/frontend-tt-sync-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`
