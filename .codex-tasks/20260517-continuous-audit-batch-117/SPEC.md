# Continuous Audit Batch 117

## Scope

Audit and harden the Tauri plan response contract without changing valid user-visible behavior or API shape.

## Finding

`tauriPlanResponse()` validates plan arrays and transfer sizes, but it returns transfer and mirror delete paths without revalidating that each path is a non-empty valid sync path. A malformed internal plan can leak invalid path shapes into the Tauri API response.

## Constraints

- Do not add features or change valid response fields.
- Reject only malformed plan path data.
- Keep the fix local to the Tauri contract boundary.
- Validate with focused tests, full check, full test suite, and diff whitespace check.
