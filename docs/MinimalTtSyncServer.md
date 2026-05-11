# Minimal TT-Sync Server

This document defines the deployable minimal TT-Sync v2-compatible server included in this repository.

## Scope

The server exists to satisfy the first-stage incremental sync backend requirements from `docs/IncrementalCloudSyncPlan.md` when the upstream TT-Sync server artifact is unavailable. It is a real file-backed server:

- It persists namespaces, manifests, remote files, and plan state on disk.
- It generates push and pull plans from client manifests.
- It transfers individual files and simple JSON bundles.
- It commits staged uploads atomically.
- It exposes errors explicitly and does not return fake success.

It implements the server-side phase-4 account/device/history/rollback basics, but it does not implement semantic merge.

## Runtime

- Node.js 18 or newer.
- No third-party runtime dependencies.
- Start command: `npm run tt-sync:server`.

Environment variables:

| Name | Required | Default | Description |
| --- | --- | --- | --- |
| `TT_SYNC_DATA_DIR` | no | `.tt-sync-data` | Persistent server storage directory. |
| `TT_SYNC_HOST` | no | `127.0.0.1` | Host for the HTTP listener. |
| `TT_SYNC_PORT` | no | `8787` | Port for the HTTP listener. |
| `TT_SYNC_PUBLIC_URL` | no | listener URL | Public URL embedded in generated pairing URIs. |
| `TT_SYNC_PAIRING_TOKEN` | yes for pairing | none | Token required by `POST /v2/pair/complete`. |
| `TT_SYNC_ACCOUNT_USERNAME` | yes for login | none | Account username for `POST /v2/account/login`. |
| `TT_SYNC_ACCOUNT_PASSWORD` | yes for login | none | Account password for `POST /v2/account/login`. |

If `TT_SYNC_PAIRING_TOKEN` is missing, pairing fails with an explicit 500 error. Existing authenticated namespaces can still use non-pairing endpoints.

## Pairing URI

Generate a pairing URI:

```bash
npm run tt-sync:pair
```

The command prints a URI in this shape:

```text
tt-sync://pair?endpoint=http%3A%2F%2F127.0.0.1%3A8787&namespace=default&token=...
```

Clients complete pairing by calling `POST /v2/pair/complete` with either the parsed fields or the raw `pairingUri`.

## Authentication

All endpoints except `GET /v2/status` and `POST /v2/pair/complete` require:

```text
Authorization: Bearer <namespace auth token>
```

The minimal server stores one auth token per namespace. Pairing creates the namespace if needed and returns the namespace auth token to the trusted TauriTavern backend.

Account login creates expiring access and refresh tokens stored in `namespace.json`. Authenticated endpoints accept either the namespace auth token or a live account access token.

## Manifest Entry

```json
{
  "path": "default-user/chats/example.jsonl",
  "sizeBytes": 12345,
  "modifiedMs": 1778500000000,
  "sha256": "optional"
}
```

Plans compare `path`, `sizeBytes`, `modifiedMs`, and `sha256` when available.

## Endpoints

### `GET /v2/status`

Returns server status and version.

### `POST /v2/pair/complete`

Body:

```json
{
  "pairingUri": "tt-sync://pair?...",
  "deviceName": "phone"
}
```

or:

```json
{
  "endpoint": "https://sync.example.com",
  "namespace": "default",
  "token": "pairing-token",
  "deviceName": "phone"
}
```

### `POST /v2/session/open`

Body:

```json
{
  "namespace": "default",
  "deviceId": "device-id"
}
```

### `POST /v2/account/login`

Body:

```json
{
  "namespace": "default",
  "username": "user",
  "password": "password"
}
```

Returns an access token, refresh token, token expiry, namespace, and server id.

### `POST /v2/account/token/refresh`

Body:

```json
{
  "namespace": "default",
  "refreshToken": "..."
}
```

Returns a replacement access/refresh token pair.

### `GET /v2/devices?namespace=default`

Returns paired devices and their `lastSeenAt` / `lastSyncAt` metadata.

### `GET /v2/history?namespace=default`

Returns recent committed sync plans.

### `GET /v2/rollback-points?namespace=default`

Returns rollback points created before push commits.

### `POST /v2/rollback-points/{rollback_id}/restore?namespace=default`

Restores the files and manifest entries captured by a rollback point.

### `POST /v2/sync/push-plan`

Body:

```json
{
  "namespace": "default",
  "deviceId": "phone",
  "localManifest": [{ "path": "file.txt", "sizeBytes": 5, "modifiedMs": 1 }],
  "baseManifest": []
}
```

Returns files to upload, remote files to delete after commit, and conflicts. A conflict is reported when `baseManifest` is provided and the same path differs from both base and remote.

### `POST /v2/sync/pull-plan`

Body:

```json
{
  "namespace": "default",
  "deviceId": "phone",
  "localManifest": []
}
```

Returns files to download and local files that the client should delete in mirror mode.

### `GET /v2/plans/{plan_id}/files/{path_b64}`

Downloads a remote file from a pull plan.

Response headers include:

- `X-TT-Sync-Modified-Ms`: manifest mtime in milliseconds.
- `Last-Modified`: HTTP date derived from `modifiedMs`.

### `PUT /v2/plans/{plan_id}/files/{path_b64}`

Stages one uploaded file for a push plan.

### `GET /v2/plans/{plan_id}/bundle`

Downloads all pull-plan files as JSON:

```json
{
  "files": [
    { "path": "file.txt", "contentBase64": "SGVsbG8=", "entry": { "...": "..." } }
  ]
}
```

### `PUT /v2/plans/{plan_id}/bundle`

Stages push-plan files from the same JSON bundle shape.

### `GET /v2/plans/{plan_id}/events`

Streams Server-Sent Events:

```text
event: progress
data: {"phase":"transferring","filesTransferred":1,"totalFiles":2,"bytesTransferred":5,"totalBytes":10,"currentPath":"file.txt"}
```

Use `?once=1` to receive one progress event and close the connection, which is useful for health checks and automated tests.

### `POST /v2/plans/{plan_id}/commit`

Commits a push plan by atomically moving staged uploads into namespace storage and only then applying remote deletes. Pull-plan commit marks the plan committed without modifying server files.

## Storage Layout

```text
.tt-sync-data/
  namespaces/
    default/
      namespace.json
      manifest.json
      files/
        ...
      rollback/
        <rollback_id>.json
  plans/
    <plan_id>/
      plan.json
      staged/
        <path_b64>
```

Path traversal is rejected. File writes use temporary files followed by rename.
