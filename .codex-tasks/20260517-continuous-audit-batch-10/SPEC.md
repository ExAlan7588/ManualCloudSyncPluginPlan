# Continuous Audit Batch 10

## Scope

Audit storage commit error handling for cases where filesystem failures are mislabeled as normal user-facing validation errors.

## Constraints

- Do not change sync behavior or API shape.
- Keep missing staged upload behavior unchanged for true `ENOENT`.
- Surface unexpected filesystem failures instead of converting them to 403 business errors.

## Finding

`TtSyncStorage.commitUpload()` catches every `stat()` failure for a staged upload and converts it to `Missing staged upload`. This is correct for `ENOENT`, but it hides non-missing filesystem failures such as `ENOTDIR`, permission failures, or I/O errors. Those failures should stay visible for debugging and operational repair.

## Acceptance

- True missing staged files still produce `Missing staged upload`.
- Non-`ENOENT` staged file `stat()` failures propagate with their original error code.
- Full syntax and test validation pass under a 60 second timeout.
