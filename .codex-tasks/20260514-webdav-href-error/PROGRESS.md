# Progress

## Recovery

- Task: add context to malformed WebDAV href decode errors.
- Shape: single-full.
- Truth file: `.codex-tasks/20260514-webdav-href-error/TODO.csv`
- Current: Step 2, add explicit error.

## Log

- 2026-05-14T23:04:21+08:00: Audited `modules/webdav-compat.js`; `hrefFileName()` calls `decodeURIComponent()` on server-provided href segments without wrapping decode errors.
- 2026-05-14T23:06:52+08:00: Exported `hrefFileName()` for focused tests and wrapped malformed percent-encoding with a contextual `WebDAV PROPFIND href 編碼不正確` error. Frontend TT-Sync tests and `npm run check` passed.
- 2026-05-14T23:07:43+08:00: Commit blocked by environment: `git add` cannot create `.git/index.lock` because the git index is on a read-only filesystem.
