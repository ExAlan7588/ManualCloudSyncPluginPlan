# Batch 64 - Validate compat config string fields

## Scope

- Audit and minimally fix compatibility-mode config string normalization.
- Do not change valid saved config behavior, default values, or UI field behavior.

## Finding

`normalizeCompatConfig()` preserves non-string config fields such as `remotePrefix` or nested WebDAV/S3 text fields. Later validators can then fail with low-level method errors like `remotePrefix.includes is not a function` instead of exposing the malformed persisted config field.

## Validation

- Focused regression: `timeout 60s node tools/test/config-run-tests.js`
- Full checks: `timeout 60s npm run check` and `timeout 60s npm test`
