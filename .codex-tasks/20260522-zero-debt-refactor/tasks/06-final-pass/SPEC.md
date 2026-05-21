# Final Performance And Dead-Code Pass

## Goal

Run the final complexity, dead-code, and validation pass for the zero-debt refactor epic.

## Targets

- Project JavaScript file sizes and function sizes.
- Obvious obsolete compatibility or fake-success patterns.
- Final `npm run check` and `npm test` gates.

## Constraints

- Do not add silent fallbacks, mocks, or skip logic.
- Treat scans as exposure: failures should be visible and fixed at the root.
- Only change code for concrete issues found by scan or validation.
