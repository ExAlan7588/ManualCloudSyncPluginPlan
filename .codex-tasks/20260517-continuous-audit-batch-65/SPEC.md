# Batch 65 - Validate compat config booleans

## Scope

- Audit and minimally fix compatibility-mode config boolean normalization.
- Do not change valid boolean `pathStyle` behavior or its default value.

## Finding

`normalizeCompatConfig()` preserves `config.s3.pathStyle` when it is not `null` or `undefined`. A malformed persisted string such as `"false"` therefore becomes a truthy value instead of surfacing config corruption.

## Validation

- Focused regression: `timeout 60s node tools/test/config-run-tests.js`
- Full checks: `timeout 60s npm run check` and `timeout 60s npm test`
