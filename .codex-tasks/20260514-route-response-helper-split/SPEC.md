# Route response helper split

## Goal

Reduce `server/lib/routes.js` maintenance risk before it exceeds the 600-line project limit by extracting generic HTTP response/request helpers without changing route behavior.

## Scope

- Move JSON body parsing, raw request body limit handling, CORS response helpers, and SSE response formatting out of `routes.js`.
- Keep route URLs, payloads, status codes, and error messages unchanged.
- Run focused route/progress tests and static checks.

## Constraints

- No feature changes.
- No silent fallback behavior.
- Keep extracted helpers small and dependency-light.
