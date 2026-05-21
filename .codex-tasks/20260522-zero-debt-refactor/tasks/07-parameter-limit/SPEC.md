# Parameter Limit Enforcement

## Goal

Eliminate completion-audit violations of the 3 positional parameter limit and make the limit reproducible through the project check gate.

## Targets

- `modules/tt-sync-view.js`
- `server/lib/route-plan-transfer.js`
- `server/lib/storage.js`
- `tools/test/frontend-account-panel-fixture.js`
- `tools/verify-tauritavern-tt-sync-events.js`
- `tools/check-code-metrics.js`
- `tools/test/code-metrics-run-tests.js`

## Constraints

- Preserve behavior and public outputs.
- Prefer options objects for functions that need more than 3 values.
- Do not add silent fallback or skip paths.
