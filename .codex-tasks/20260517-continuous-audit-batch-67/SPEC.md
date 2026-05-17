# Batch 67 - Validate compat store root shape

## Scope

- Audit and minimally fix compatibility-mode persisted store parsing.
- Do not change empty-store behavior, valid persisted config behavior, or malformed JSON error wording.

## Finding

`readCompatStore()` returns the parsed localStorage JSON without checking that the root is an object. If the persisted value is `[]`, `null`, or a primitive, later callers can silently normalize it into default config and hide storage corruption.

## Validation

- Focused regression: `timeout 60s node tools/test/config-run-tests.js`
- Full checks: `timeout 60s npm run check` and `timeout 60s npm test`
