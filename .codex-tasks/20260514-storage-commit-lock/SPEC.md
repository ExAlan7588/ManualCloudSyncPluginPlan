# Storage commit lock

## Goal

Ensure TT-Sync plan commits are serialized through the existing per-plan lock so stale in-memory plan snapshots cannot be committed concurrently.

## Scope

- Add focused storage-level coverage for concurrent commits using the same plan snapshot.
- Re-read and commit the latest plan inside `withPlanLock()`.
- Avoid mutating the caller's plan object.
- Preserve existing error messages and plan summary behavior.

## Constraints

- No feature changes.
- No silent success or fallback on stale commits.
- Keep the fix local to storage commit behavior.
