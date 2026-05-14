# Tauri Timestamp Test Margin

## Goal

Make Tauri session timestamp freshness tests deterministic without changing production behavior.

## Scope

- Keep the five-minute freshness window unchanged.
- Adjust only test fixture offsets so stale/future cases are clearly outside the window.
- Re-run focused and global validation.

