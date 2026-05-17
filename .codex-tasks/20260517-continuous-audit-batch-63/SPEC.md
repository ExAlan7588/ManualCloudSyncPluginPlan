# Batch 63 - Validate compat secret shapes

## Scope

- Audit and minimally fix compatibility-mode secret normalization.
- Do not change valid saved secrets, empty secret behavior, config UI behavior, or storage key format.

## Finding

`normalizeCompatSecrets()` preserves truthy non-string localStorage values such as objects. Later checks can treat those values as stored credentials and WebDAV auth can stringify them into `[object Object]`, hiding corrupt persisted config.

## Validation

- Focused regression: `timeout 60s node tools/test/config-run-tests.js`
- Full checks: `timeout 60s npm run check` and `timeout 60s npm test`
