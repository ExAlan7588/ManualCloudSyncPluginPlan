# Frontend Module Consistency Cleanup

## Goal

Make frontend modules more consistent in state handling, event payload validation, and error reporting while removing obsolete compatibility wrappers that only preserve internal legacy shapes.

## Initial Targets

- `modules/tt-sync.js`
- `modules/tt-sync-view.js`
- `modules/tt-sync-account.js`
- `modules/tt-sync-progress.js`
- `modules/webdav-compat.js`
- `modules/data-migration.js`
- related focused tests in `tools/test/`

## Constraints

- Keep user-visible behavior stable unless existing behavior is objectively inconsistent or obsolete.
- Do not add fallback UI, mock success paths, or hidden degradation.
- Keep modules below file/function complexity limits.
- Validate touched behavior with focused frontend tests plus full project check/test.
