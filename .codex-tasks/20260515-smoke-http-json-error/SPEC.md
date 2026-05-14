# Smoke HTTP JSON Error

## Goal

Include JSON parser details when smoke HTTP responses are not valid JSON.

## Scope

- Preserve the existing `HTTP <status>: <body>` raw response prefix.
- Append parser details for invalid JSON.
- Add no-listen helper tests.

