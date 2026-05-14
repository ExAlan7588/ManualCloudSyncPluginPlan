# Evidence JSON Error Context

## Goal

Keep malformed evidence JSON failures visible with parser error details.

## Scope

- Preserve existing rejection behavior for malformed evidence JSON.
- Add the underlying parser message to the thrown error.
- Validate with the existing incremental evidence test suite.

