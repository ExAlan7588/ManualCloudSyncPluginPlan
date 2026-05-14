# Command verifier ZIP split

## Goal

Reduce `tools/verify-tauritavern-tt-sync.js` maintenance risk before it exceeds the 600-line project limit by extracting ZIP entry parsing into a focused helper module.

## Scope

- Move ZIP constants and parser helpers into `tools/zip-entries.js`.
- Keep verifier behavior and error messages unchanged.
- Reuse existing verifier tests to validate compressed artifacts and metadata false-positive behavior.
- Run static checks.

## Constraints

- No command contract changes.
- No parser leniency changes.
- Invalid ZIP-like artifacts must still fail visibly.
