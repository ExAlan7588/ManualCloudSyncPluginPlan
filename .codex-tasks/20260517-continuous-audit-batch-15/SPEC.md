# Continuous Audit Batch 15

## Scope

Audit WebDAV compatibility manifest byte-count validation for non-integer values.

## Constraints

- Do not change the WebDAV queue format or valid manifest behavior.
- Keep the repair limited to manifest validation and focused regression coverage.
- Reject malformed byte counts at queue-read time.

## Finding

`modules/webdav-compat.js` currently validates `manifest.sizeBytes` as a finite non-negative number. That accepts fractional values such as `1.5`, but byte counts must be integers and later download verification compares against integer `Blob.size`. Invalid fractional metadata should be rejected when the manifest is read.

## Acceptance

- WebDAV compatibility queue rejects fractional `sizeBytes`.
- Valid integer `sizeBytes` manifests remain accepted.
- Full syntax and test validation pass under a 60 second timeout.
