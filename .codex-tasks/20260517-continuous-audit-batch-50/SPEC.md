# Batch 50 - Validate JSON request body shape

## Scope

- Audit and minimally fix HTTP JSON request parsing for non-object top-level bodies.
- Do not change valid object request behavior or existing empty-body fallback behavior.

## Finding

`readJsonRequest()` validates JSON syntax but accepts top-level `null`, arrays, strings, and numbers. All current route callers treat the result as an object, so malformed body shapes can surface low-level route errors instead of a clear 400 boundary error.

## Validation

- Focused regression: `timeout 60s node server/test/http-helpers-run-tests.js`
- Full checks: `timeout 60s npm run check` and `timeout 60s npm test`
