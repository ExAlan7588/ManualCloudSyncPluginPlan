# Batch 89 - TT-Sync Account Endpoint URL Validation

## Scope

Audit TT-Sync account endpoint URL validation.

## Constraints

- Keep valid `http:` and `https:` endpoint behavior unchanged.
- Do not alter account API paths or request payloads.
- Reject endpoint credentials and fragments explicitly at the input boundary.

## Finding

`parseRequiredUrl()` accepts any syntactically valid URL. Non-HTTP protocols, credentials, or fragments can produce unsafe or broken account API request targets.

## Validation

- `node tools/test/tt-sync-account-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`
- `git diff --check`
