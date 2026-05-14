# Evidence test split

## Goal

Reduce `tools/test/run-tests.js` maintenance risk before it exceeds the 600-line project limit by moving a coherent group of evidence URL consistency tests into a separate test file.

## Scope

- Move URL/server consistency tests without changing assertions.
- Keep all tests in `npm test`.
- Preserve existing evidence fixture usage.
- Run focused evidence tests and static checks.

## Constraints

- No verifier behavior changes.
- No assertion weakening.
- No skipped tests.
