# Batch 107 - HTTP Error Message Control Character Normalization

## Scope

Audit externally returned HTTP error messages.

## Constraints

- Do not hide errors or replace them with generic messages.
- Do not change HTTP status selection.
- Only normalize control whitespace that can pollute logs or UI output.

## Finding

`sendError()` and JSON parser detail responses return error messages verbatim. Newlines, carriage returns, and tabs can therefore be reflected into JSON error payloads and client logs.

## Validation

- `node server/test/http-helpers-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`
- `git diff --check`
