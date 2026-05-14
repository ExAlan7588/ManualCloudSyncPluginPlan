# Deploy env quote validation

## Goal

Prevent malformed quoted values in TT-Sync deployment env files from being silently normalized into apparently valid values.

## Scope

- Detect unmatched single or double quotes in parsed service/env values.
- Preserve valid unquoted and paired-quoted values.
- Add focused deploy verifier tests.
- Run static checks.

## Constraints

- No secret printing.
- No fallback parsing for malformed env values.
- Existing valid templates must still pass with `--allow-placeholders`.
