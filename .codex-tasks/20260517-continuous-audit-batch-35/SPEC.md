# Continuous Audit Batch 35

## Scope

Audit incremental evidence verifier numeric threshold checks.

## Finding

The `real large sync byte target` consistency check uses `Number(...)` before
comparing `metrics.totalBytes` with the 300MiB minimum. Malformed strings such
as `0x14000000` can pass that specific threshold check, leaving only the generic
device field check to fail.

## Constraints

- Do not change valid evidence behavior.
- Keep the existing 300MiB threshold.
- Require the threshold value itself to be an integer number, not a numeric-looking string.

## Validation

- `timeout 60s node tools/test/run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`
