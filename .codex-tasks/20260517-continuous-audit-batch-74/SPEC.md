# Batch 74 - WebDAV download queue item validation

## Finding

`compatDownloadAndImport()` assumes the queue item contains a manifest object
and zip key. Malformed item input can throw generic property access or key
handling TypeErrors before the download path exposes a clear validation error.

## Scope

- Validate the queue item shape at the compat download boundary.
- Preserve normal download, hash verification, import, and delete behavior.
- Add focused coverage in `webdav-compat-run-tests.js`.

## Validation

- `node tools/test/webdav-compat-run-tests.js`
- `npm run check`
- `npm test`
