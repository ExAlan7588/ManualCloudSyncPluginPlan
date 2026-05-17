# Batch 116 - Tauri Manifest Path Validation

## Scope

Audit Tauri manifest normalization at the contract boundary.

## Constraints

- Do not change valid Tauri manifest input or output shape.
- Do not introduce fallback path coercion.
- Reuse existing sync path validation rules.

## Finding

`tauriManifestEntries()` passes `entry?.path` through without validation. Malformed paths are only caught later by planner manifest normalization, which weakens the contract boundary.

## Validation

- `node server/test/tauri-contract-unit-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`
- `git diff --check`
