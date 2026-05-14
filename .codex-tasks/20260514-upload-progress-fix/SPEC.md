# Upload progress fix

## Goal

Investigate and fix upload/push behavior where the TT-Sync progress window repeatedly opens, progress updates only every 10 files, slow network errors may abort the upload, stop/cancel is unavailable, and partial upload safety is unclear.

## Scope

- Locate upload/push progress dialog creation and update paths.
- Prevent duplicate progress windows.
- Add or wire a cancellation/stop path for push/upload.
- Avoid false aborts for transient slow-network failures where the existing architecture permits a minimal robust retry.
- Ensure partial uploads are either safe by design or clearly reported to the user.
- Run available relevant tests/build.

## Constraints

- Keep changes minimal and aligned with existing code patterns.
- Do not add silent fallbacks, fake success paths, or hidden degradation.
- Surface failures clearly.
- Commit the completed validated phase.
