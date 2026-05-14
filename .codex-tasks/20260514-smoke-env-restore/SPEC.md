# Smoke verifier environment restore

## Goal

Fix local TT-Sync smoke verifier startup failure cleanup so temporary `TT_SYNC_PAIRING_TOKEN` changes do not leak into the caller environment.

## Scope

- Audit `tools/smoke-tt-sync-server.js` local runtime setup.
- Restore environment variables and remove temp data if local server startup fails.
- Preserve the original startup error; do not hide sandbox `listen EPERM` or other failures.
- Add focused test coverage if feasible without requiring a successful listen.

## Constraints

- No behavior change for successful smoke runs.
- No silent fallback or fake success.
