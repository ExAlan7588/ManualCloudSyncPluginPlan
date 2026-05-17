# Progress

## 2026-05-17T21:48:07+08:00

- Started batch 16 as a Full Single task.
- Audited `server/lib/http-helpers.js` request body limit parsing.
- Found that malformed `TT_SYNC_MAX_BODY_BYTES` silently falls back to the default body limit.

## 2026-05-17T21:49:37+08:00

- Added regression coverage for malformed `TT_SYNC_MAX_BODY_BYTES`.
- Confirmed the regression fails before the fix because the request succeeds with the default body limit.
- Updated `maxBodyBytes()` to reject malformed configured values explicitly and parse the limit once per body read.
- Focused HTTP helper tests pass.

## 2026-05-17T21:50:22+08:00

- Full validation passed:
  - `timeout 60s npm run check`
  - `timeout 60s npm test`

## 2026-05-17T21:50:48+08:00

- Reviewed git diff for batch 16.
- Changes are limited to explicit request body limit env validation, its regression test, and batch tracking files.
