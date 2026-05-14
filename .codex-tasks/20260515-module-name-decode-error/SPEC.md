# Module Name Decode Error

## Goal

Make malformed extension module URLs fail with contextual diagnostics.

## Scope

- Preserve module-name resolution for valid URLs.
- Expose percent-decoding failures with the original module URL.
- Add frontend static/unit coverage.

