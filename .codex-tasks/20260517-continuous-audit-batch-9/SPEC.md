# Continuous Audit Batch 9

## Scope

Audit deployment verification for configuration parsing bugs that can hide unsafe effective values.

## Constraints

- Do not change user-visible application behavior or public APIs.
- Keep the fix limited to verifier correctness.
- Expose bad deployment input clearly instead of accepting mismatched parser semantics.

## Finding

`tools/verify-tt-sync-deploy.js` reads env entries with `firstValue()`. In env-style configuration, repeated assignments are normally resolved by the last assignment. This lets an earlier safe `TT_SYNC_PAIRING_TOKEN` hide a later placeholder value from the verifier even though the later value is the effective deployment value.

## Acceptance

- Deployment verifier checks duplicate env keys using the effective last value.
- Existing template and TLS verifier tests still pass.
- New regression test proves a trailing placeholder token is rejected.
- `npm run check` and `npm test` pass under a 60 second timeout.
