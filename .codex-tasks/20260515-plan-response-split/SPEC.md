# Plan Response Split

## Goal

Reduce `server/lib/routes.js` size by moving plan response summary logic into a focused module.

## Scope

- Preserve plan summary and progress summary response shapes.
- Export summary helpers for route use and unit coverage.
- Validate route and progress behavior.

