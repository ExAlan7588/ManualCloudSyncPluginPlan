# Batch 68 - TT-Sync conflict payload validation

## Finding

`renderConflictList()` resolves `payload.conflicts`, `payload.diff.conflicts`, or
`payload.plan.conflicts`, but treats any non-array value as an empty list. A
malformed sync event or plan can therefore make the conflict panel display an
empty state instead of surfacing corrupted payload shape.

## Scope

- Preserve existing visible behavior for missing conflicts and valid empty
  conflict arrays.
- Reject malformed conflict payloads with an explicit error before rendering a
  misleading empty state.
- Add a focused frontend view test without growing the existing large
  `frontend-tt-sync-run-tests.js` file.

## Validation

- `node tools/test/tt-sync-view-run-tests.js`
- `npm run check`
- `npm test`
