# Batch 76 - WebDAV queue key consistency validation

## Finding

`validateQueueItem()` checks that `manifestKey` and `zipKey` exist, but it does
not verify that those keys point to the same `manifest.file`. A corrupted queue
item can therefore download or delete paths inconsistent with the displayed
manifest file.

## Scope

- Validate queue item path consistency at the download boundary.
- Preserve keys produced by `compatListQueue()` and upload flow.
- Add focused coverage for mismatched zip and manifest keys.

## Validation

- `node tools/test/webdav-compat-run-tests.js`
- `npm run check`
- `npm test`
