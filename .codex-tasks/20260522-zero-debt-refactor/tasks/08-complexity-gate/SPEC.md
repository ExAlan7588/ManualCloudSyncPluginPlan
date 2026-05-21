# Nesting And Complexity Enforcement

## Goal

Add reproducible validation for the remaining hard code metrics: nesting depth <= 3 and cyclomatic complexity <= 10 per scanned function.

## Targets

- `tools/check-code-metrics.js`
- `tools/test/code-metrics-run-tests.js`

## Constraints

- Use a conservative control-flow scan to avoid counting object literals as nesting.
- Keep file, function, and parameter limits intact.
- Do not add skip or fallback behavior.
