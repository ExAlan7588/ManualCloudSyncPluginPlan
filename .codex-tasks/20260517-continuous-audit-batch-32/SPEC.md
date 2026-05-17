# Continuous Audit Batch 32

## Scope

Audit TT-Sync account history count rendering.

## Finding

`modules/tt-sync-account.js` renders history counts with
`item.uploads || 0` and `item.downloads || 0`. Truthy malformed values such as
`0x10` or `true` are displayed directly as count text instead of being marked as
unavailable.

## Constraints

- Do not change account API routes or normal valid history rendering.
- Preserve missing count behavior as zero.
- Mark malformed count values explicitly as unavailable.

## Validation

- `timeout 60s node tools/test/frontend-tt-sync-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`
