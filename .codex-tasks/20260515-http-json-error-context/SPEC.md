# HTTP JSON Error Context

## Goal

Expose parser details for invalid API JSON bodies while preserving 400 behavior.

## Scope

- Keep invalid JSON requests rejected with `badRequest`.
- Include the underlying `JSON.parse` message in the error text.
- Add no-listen unit coverage for JSON parsing helpers.

