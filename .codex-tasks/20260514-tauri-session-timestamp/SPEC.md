# Tauri session timestamp freshness

## Goal

Reject stale or far-future signed Tauri session-open requests so captured signatures cannot be replayed indefinitely.

## Scope

- Validate `TT-Timestamp-Ms` freshness in `verifyTauriSessionRequest()`.
- Preserve valid current signed session behavior.
- Add focused non-listening unit tests for timestamp rejection.
- Run static checks.

## Constraints

- No change to command names or successful request schema.
- Do not add silent fallback or accept unsigned requests.
- Keep failure explicit with unauthorized errors.
