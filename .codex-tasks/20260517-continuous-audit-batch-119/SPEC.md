# Continuous Audit Batch 119

## Scope

Audit and harden the Tauri plan response identifier field without changing valid API behavior.

## Finding

`tauriPlanResponse()` serializes `plan.id` directly as `plan_id`. Valid plans are generated with UUID strings, but a corrupted internal plan can return an object or blank value in the response contract.

## Constraints

- Do not change valid plan IDs or response field names.
- Reject only malformed internal `plan.id` values.
- Keep changes local to Tauri contract helpers and focused unit tests.
- Validate with focused tests, full check, full test suite, and diff whitespace check.
