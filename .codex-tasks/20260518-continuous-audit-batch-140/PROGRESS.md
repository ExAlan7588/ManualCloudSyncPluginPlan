# Progress

## Audit Finding

`writeRequestStreamAtomic()` creates the destination directory and consumes the
request stream before `validateCompletedStream()` checks `expectedBytes`.
Malformed expected sizes therefore cause avoidable filesystem and stream IO.

## Planned Fix

Validate `expectedBytes` at the start of `writeRequestStreamAtomic()` and reuse
the normalized value at completion. Valid uploads should keep the same behavior;
malformed metadata should fail before directories or temp files are created.

## Implemented Change

`writeRequestStreamAtomic()` now normalizes `expectedBytes` before calling
`mkdir()` or consuming the request stream. Completion compares against that
normalized integer, and unused expected-byte plumbing was removed.

## Validation

- `node server/test/storage-io-run-tests.js`
- `node server/test/run-tests.js`
- `node server/test/concurrent-upload-run-tests.js`
- `timeout 60s npm run check`
- `timeout 60s npm test`
- `git diff --check`
