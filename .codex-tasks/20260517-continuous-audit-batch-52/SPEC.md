# Batch 52 - Validate Tauri plan response arrays

## Scope

- Audit and minimally fix Tauri plan response generation for malformed persisted transfer arrays.
- Do not change valid Tauri response fields or contracts.

## Finding

`tauriPlanResponse()` reads `uploads` or `downloads` directly with `.length`, `.map()`, and reduction. Malformed persisted plan arrays can surface low-level method errors instead of explicit Tauri plan-shape errors.

## Validation

- Focused regression: `timeout 60s node server/test/tauri-contract-unit-run-tests.js`
- Full checks: `timeout 60s npm run check` and `timeout 60s npm test`
