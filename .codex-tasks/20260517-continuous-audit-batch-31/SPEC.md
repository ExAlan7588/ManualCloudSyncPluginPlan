# Continuous Audit Batch 31

## Scope

Audit account session and pairing token expiry parsing.

## Finding

`server/lib/account.js` checks `expiresAt` and `refreshExpiresAt` with
`Date.parse()`. Node accepts non-ISO strings such as `9999` as valid future
dates, so a polluted namespace record can keep malformed session or pairing
expiry values active.

## Constraints

- Do not change generated account token behavior.
- Accept the ISO timestamps produced by `Date.prototype.toISOString()`.
- Reject non-ISO expiry strings during active-session and pruning checks.

## Validation

- `timeout 60s node server/test/account-unit-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`
