# Continuous Audit Batch 118

## Scope

Audit Tauri plan response discriminants and remove silent fallback behavior for malformed internal plan values.

## Finding

`tauriPlanResponse()` treats every non-`push` `plan.kind` as pull and every non-`Mirror` `plan.mode` as incremental. If a persisted or constructed plan is malformed, the response can serialize the wrong transfer/delete side instead of surfacing the corrupted contract.

## Constraints

- Do not change valid `push`/`pull` or `Incremental`/`Mirror` behavior.
- Reject malformed internal plan discriminants explicitly.
- Keep changes local to Tauri contract helpers and focused unit tests.
- Validate with focused tests, full check, full test suite, and diff whitespace check.
