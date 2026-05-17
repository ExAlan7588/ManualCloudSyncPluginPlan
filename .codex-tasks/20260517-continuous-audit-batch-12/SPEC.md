# Continuous Audit Batch 12

## Scope

Audit WebDAV compatibility manifest validation for malformed numeric metadata.

## Constraints

- Do not change the WebDAV queue format or valid manifest behavior.
- Reject malformed manifest metadata at queue-read time.
- Keep the repair limited to validation and regression coverage.

## Finding

`modules/webdav-compat.js` validates `manifest.sizeBytes` with `Number(manifest.sizeBytes)`. JavaScript converts `null` and blank strings to `0`, so malformed WebDAV manifest metadata can enter the queue as a zero-byte sync package. The value is produced as a number by this plugin and should be present as numeric metadata when read back.

## Acceptance

- WebDAV compatibility queue rejects null `sizeBytes`.
- Existing valid queue and SHA-256 validation behavior remains unchanged.
- Full syntax and test validation pass under a 60 second timeout.
