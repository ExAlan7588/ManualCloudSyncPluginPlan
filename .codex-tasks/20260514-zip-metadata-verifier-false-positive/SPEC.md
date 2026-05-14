# ZIP metadata verifier false positive

## Goal

Prevent the TauriTavern command verifier from treating command strings in ZIP/APK metadata, such as entry names or central directory records, as trusted build-artifact evidence.

## Scope

- Add a regression test where required command strings appear only in ZIP entry names, not entry content.
- Keep trusted detection for actual decompressed build artifact content.
- Do not change the command contract or required command list.
- Run focused verifier tests and static checks.

## Constraints

- No silent fallback.
- Invalid ZIP-like inputs must still fail visibly.
- Keep parser behavior strict for real build artifacts.
