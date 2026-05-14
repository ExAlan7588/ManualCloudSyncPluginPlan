# Smoke HTTP Helper Split

## Goal

Reduce `tools/smoke-tt-sync-server.js` size risk without changing smoke-test behavior.

## Scope

- Move HTTP response parsing and request header helpers into a focused module.
- Keep `parseSseProgress` available from `tools/smoke-tt-sync-server.js` for existing tests.
- Validate smoke helper behavior and syntax checks.

