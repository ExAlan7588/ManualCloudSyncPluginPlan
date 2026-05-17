# Batch 115 - Manifest Entry Shape Validation

## Scope

Audit manifest entry boundary validation.

## Constraints

- Do not change valid manifest normalization.
- Do not add compatibility fallbacks for malformed entries.
- Keep malformed entries failing with explicit boundary errors.

## Finding

`normalizeEntry()` reads `input?.path` directly. Null, arrays, or scalar entries therefore fail later as missing sync paths instead of explicit malformed manifest entries.

## Validation

- `node server/test/manifest-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`
- `git diff --check`
