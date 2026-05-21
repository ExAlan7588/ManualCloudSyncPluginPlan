# Test Runner And Validation Consolidation

## Goal

Make validation scripts consistent, explicit, and maintainable without hiding failures or testing behavior that does not exist.

## Initial Targets

- `package.json`
- `tools/test/`
- `server/test/`
- new validation runner utilities under `tools/`

## Constraints

- Do not skip missing tests silently.
- Do not add mock or simulated success paths.
- Keep validation failures directly visible with the failing command or file.
- Preserve `timeout 60 npm run check` and `timeout 60 npm test` as the primary validation gates.
