# Batch 66 - Validate config secret presence flags

## Scope

- Audit and minimally fix config view secret presence flag validation.
- Do not change valid saved-secret behavior, required secret messages, or config UI output shape.

## Finding

`requireSecret()` uses `Boolean(configView?.secrets?.[savedKey])` to decide whether an existing secret satisfies validation. A malformed truthy non-boolean flag such as `"yes"` can therefore bypass required secret validation.

## Validation

- Focused regression: `timeout 60s node tools/test/config-run-tests.js`
- Full checks: `timeout 60s npm run check` and `timeout 60s npm test`
