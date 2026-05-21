# Tool Verifier Modernization

## Goal

Reduce duplicated CLI/report/scanning code in verifier tools while preserving explicit evidence failures and report formats.

## Initial Targets

- `tools/verify-incremental-cloud-sync-evidence.js`
- `tools/smoke-tt-sync-server.js`
- `tools/verify-tauritavern-tt-sync.js`
- `tools/verify-tauritavern-tt-sync-events.js`
- `tools/verify-tt-sync-deploy.js`

## Constraints

- Do not weaken evidence gates.
- Do not add mock success paths.
- Keep report schemas and public command behavior stable unless the old behavior is objectively wrong.
- Validate with focused verifier tests plus full project check/test.

