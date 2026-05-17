# Batch 59 - Validate HTTP sync plan mode

## Scope

- Audit and minimally fix regular HTTP sync plan mode validation.
- Do not change valid `Incremental` or `Mirror` behavior, Tauri plan behavior, or response shape.

## Finding

Tauri sync plan input validates `mode` as `Incremental` or `Mirror`, but regular HTTP `/v2/sync/*-plan` requests pass `body.mode` directly into the planner. A typo or malicious mode string can therefore be persisted in a plan while still behaving like non-mirror sync.

## Validation

- Focused regression: `timeout 60s node server/test/routes-unit-run-tests.js`
- Full checks: `timeout 60s npm run check` and `timeout 60s npm test`
