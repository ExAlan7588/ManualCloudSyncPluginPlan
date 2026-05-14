# Progress

## Recovery

- Task: use constant-time comparison for account credentials.
- Shape: single-full.
- Truth file: `.codex-tasks/20260514-account-password-compare/TODO.csv`
- Current: Step 2, implement compare change.

## Log

- 2026-05-14T23:25:44+08:00: Audited `server/lib/account.js`; token checks use `constantTimeEqual()`, while account username/password checks used direct string equality.
- 2026-05-14T23:28:35+08:00: Updated `assertAccountLogin()` to use `constantTimeEqual()` for username and password. Added `server/test/account-unit-run-tests.js` for valid, invalid, and missing-env cases. Focused test and `npm run check` passed; `npm test` reaches the account unit test then stops at sandbox `listen EPERM`.
- 2026-05-14T23:29:15+08:00: Commit blocked by environment: `git add` cannot create `.git/index.lock` because the git index is on a read-only filesystem.
