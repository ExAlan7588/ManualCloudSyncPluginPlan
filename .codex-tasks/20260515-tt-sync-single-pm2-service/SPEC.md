# TT-Sync Single PM2 Service

## Goal

Run TT-Sync HTTPS directly from the main server process so PM2 only needs
`manual-cloud-tt-sync` for the active endpoint.

## Scope

- Add explicit TLS cert/key support to `server/tt-sync-server.js`.
- Document TLS env variables in the deploy env example.
- Validate TLS env pairing in the deploy verifier.
- Switch local PM2 from the two-process HTTP-plus-proxy setup to one HTTPS
  `manual-cloud-tt-sync` process.

## Validation

- Static syntax check.
- Focused deploy verifier tests.
- Live status check against `https://100.108.182.88:9443/v2/status`.

