# WebDAV href error context

## Goal

Make malformed WebDAV PROPFIND href encoding failures explicit and contextual instead of surfacing a raw `URIError`.

## Scope

- Guard href filename decoding in `modules/webdav-compat.js`.
- Preserve valid WebDAV href behavior.
- Add focused frontend test coverage.
- Run frontend tests and static checks.

## Constraints

- No behavior change for valid WebDAV responses.
- Do not silently skip malformed hrefs.
- Keep failures visible with actionable context.
