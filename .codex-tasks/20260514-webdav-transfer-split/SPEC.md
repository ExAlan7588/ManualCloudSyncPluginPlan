# WebDAV Transfer Split

## Goal

Reduce `modules/webdav-compat.js` size and isolate XHR transfer behavior without changing WebDAV compatibility features.

## Scope

- Move XHR upload/download transfer helper code to `modules/webdav-transfer.js`.
- Keep progress and error-message behavior unchanged.
- Add focused tests using a fake XMLHttpRequest.

