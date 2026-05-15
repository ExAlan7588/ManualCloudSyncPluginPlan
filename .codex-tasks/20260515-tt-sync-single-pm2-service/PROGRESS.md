# Progress

## 2026-05-15

- Started task after observing two PM2 processes: HTTP app and HTTPS proxy.
- Target is a single PM2-managed HTTPS server process.
- Added direct TLS support to `server/tt-sync-server.js`.
- Added focused TLS entrypoint tests and deploy verifier checks.
- `npm run check`, `node server/test/tt-sync-server-run-tests.js`, and
  `node tools/test/deploy-run-tests.js` passed.
- PM2 now has one TT-Sync process: `manual-cloud-tt-sync`.
- Live `https://100.108.182.88:9443/v2/status` returned `ok=true`.
- Final `npm run check`, focused TLS entrypoint tests, deploy verifier tests,
  and `git diff --check` passed before commit.
