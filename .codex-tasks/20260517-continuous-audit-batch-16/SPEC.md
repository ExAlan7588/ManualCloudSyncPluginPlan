# Continuous Audit Batch 16

## Scope

Audit request body limit configuration parsing for silent fallback behavior.

## Constraints

- Do not change the default request body limit when the env var is unset.
- Do not change normal oversized-body behavior.
- Surface malformed `TT_SYNC_MAX_BODY_BYTES` explicitly instead of silently using the default.

## Finding

`server/lib/http-helpers.js` parses `TT_SYNC_MAX_BODY_BYTES` with `Number()` and falls back to the default limit when the result is not a positive safe integer. That means a typo such as `TT_SYNC_MAX_BODY_BYTES=not-a-number` silently disables the intended limit override. Configuration errors should be visible.

## Acceptance

- Unset `TT_SYNC_MAX_BODY_BYTES` still uses the default.
- Malformed or non-positive configured values throw an explicit `TT_SYNC_MAX_BODY_BYTES` error.
- Existing oversized-body rejection still passes.
- Full syntax and test validation pass under a 60 second timeout.
