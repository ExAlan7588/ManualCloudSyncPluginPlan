# Smoke verifier SSE JSON error context

## Goal

Make malformed TT-Sync progress SSE payloads in the smoke verifier fail with contextual errors instead of raw JSON syntax errors.

## Scope

- Guard JSON parsing in `parseSseProgress()`.
- Preserve successful SSE parsing behavior.
- Add a focused test using a local fake HTTP server.
- Run smoke-deploy test until the expected sandbox listen blocker and static checks.

## Constraints

- Do not hide malformed SSE payloads.
- Do not add fallback progress values.
- Preserve existing smoke verifier behavior for valid responses.
