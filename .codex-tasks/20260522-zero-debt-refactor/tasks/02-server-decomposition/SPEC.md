# Server Storage And Routing Decomposition

## Goal

Split server storage and routing responsibilities into smaller modules while preserving explicit failures and existing server behavior.

## Constraints

- Keep each changed file under 600 lines.
- Keep functions near or below 50 lines.
- Do not add compatibility wrappers for obsolete internals.
- Validate with focused server tests plus full project check/test.

