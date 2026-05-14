# Encoded Path Validation

## Goal

Reject malformed base64url-encoded sync path route parameters before decoding.

## Scope

- Preserve all valid encoded sync paths.
- Reject encoded paths containing non-base64url characters.
- Add no-listen unit coverage for encoding boundaries.

