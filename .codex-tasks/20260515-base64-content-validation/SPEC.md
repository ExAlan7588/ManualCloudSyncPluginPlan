# Base64 Content Validation

## Goal

Reject malformed base64 file content before decoding in bundle and rollback paths.

## Scope

- Preserve valid bundle upload and rollback restore behavior.
- Share one base64 content decoder between routes and storage.
- Add focused no-listen coverage for the decoder.

