# Continuous Audit Batch 13

## Scope

Audit smoke verifier numeric option parsing for unexpected JavaScript coercion.

## Constraints

- Do not change smoke verifier behavior for valid decimal integer options.
- Do not expand smoke test functionality.
- Reject malformed numeric option inputs clearly before runtime work starts.

## Finding

`tools/smoke-tt-sync-server.js` parses `--bulk-files` and `--bulk-file-bytes` with `Number(value)`. This accepts non-decimal CLI inputs such as `0x10`, and the programmatic API accepts booleans as `1` or `0`. These values should be treated as malformed integer options.

## Acceptance

- Decimal integer strings and integer numbers remain accepted.
- Hex-like strings and booleans are rejected.
- Full syntax and test validation pass under a 60 second timeout.
