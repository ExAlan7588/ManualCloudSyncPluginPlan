# TauriTavern TT-Sync Command Contract

本文檔定義本插件前端會呼叫的 TauriTavern 原生命令契約。它不是 mock 規格；若後端缺少命令或實作不完整，前端應收到明確錯誤，而不是成功回應。

## 1. Command Surface

前端呼叫點在 `modules/tt-sync.js`，命令名稱固定如下：

- `tt_sync_pair`
- `tt_sync_list_servers`
- `tt_sync_check_diff`
- `tt_sync_push`
- `tt_sync_pull`
- `tt_sync_unpair`

除 `tt_sync_list_servers` 外，所有命令都以 `{ dto: ... }` 作為 Tauri invoke payload。

## 2. Shared Types

### Server

```json
{
  "serverId": "server-id",
  "name": "VPS",
  "endpoint": "https://sync.example.com",
  "status": "ok",
  "lastSyncAt": "2026-05-12T00:00:00+08:00"
}
```

前端會用 `id`、`serverId`、`name` 或 `endpoint` 其中之一當作選項 value；後端應優先回傳穩定 `serverId`。

### Manifest Entry

```json
{
  "path": "default-user/chats/example.jsonl",
  "sizeBytes": 123,
  "modifiedMs": 1778515200000,
  "sha256": "optional-lowercase-hex"
}
```

### Summary

```json
{
  "uploadFiles": 1,
  "uploadBytes": 123,
  "downloadFiles": 0,
  "downloadBytes": 0,
  "deleteFiles": 0,
  "conflictFiles": 0
}
```

### Progress

```json
{
  "phase": "planned",
  "filesTransferred": 0,
  "totalFiles": 1,
  "bytesTransferred": 0,
  "totalBytes": 123,
  "averageBytesPerSecond": 0,
  "currentPath": "default-user/chats/example.jsonl"
}
```

### Conflict

```json
{
  "path": "default-user/chats/example.jsonl",
  "local": { "path": "default-user/chats/example.jsonl", "sizeBytes": 120, "modifiedMs": 1778515200000 },
  "remote": { "path": "default-user/chats/example.jsonl", "sizeBytes": 123, "modifiedMs": 1778515201000 }
}
```

Conflict decision values are only:

- `local`
- `remote`

## 3. Commands

### `tt_sync_pair`

Payload:

```json
{
  "dto": {
    "pairingUri": "tt-sync://pair?...",
    "deviceName": "phone"
  }
}
```

Required behavior:

- Validate and complete pairing against the TT-Sync server.
- Persist the paired server in TauriTavern backend storage.
- Persist device identity and namespace/auth material outside frontend localStorage.
- Return enough data for progress/status rendering.

Response:

```json
{
  "serverId": "server-id",
  "endpoint": "https://sync.example.com",
  "progress": { "phase": "paired" }
}
```

### `tt_sync_list_servers`

Payload: none.

Response:

```json
{
  "servers": [
    {
      "serverId": "server-id",
      "name": "VPS",
      "endpoint": "https://sync.example.com",
      "status": "ok",
      "lastSyncAt": "2026-05-12T00:00:00+08:00"
    }
  ]
}
```

Required behavior:

- Read persisted paired servers from backend storage.
- Return the same server after app restart until explicitly unpaired.

### `tt_sync_check_diff`

Payload:

```json
{
  "dto": {
    "serverId": "server-id"
  }
}
```

Required behavior:

- Scan the local TauriTavern data root into a manifest.
- Exclude LAN Sync, manual-cloud-sync, incremental-cloud-sync state files, and `_tauritavern/.ios-policy.json`.
- Ask the selected TT-Sync server for a push/pull plan or equivalent diff summary.
- Return conflicts without mutating local or remote files.

Response:

```json
{
  "summary": {
    "uploadFiles": 1,
    "uploadBytes": 123,
    "downloadFiles": 0,
    "downloadBytes": 0,
    "deleteFiles": 0,
    "conflictFiles": 0
  },
  "progress": {
    "phase": "planned",
    "filesTransferred": 0,
    "totalFiles": 1,
    "bytesTransferred": 0,
    "totalBytes": 123,
    "currentPath": "default-user/chats/example.jsonl"
  },
  "conflicts": []
}
```

### `tt_sync_push`

Payload:

```json
{
  "dto": {
    "serverId": "server-id",
    "direction": "push",
    "conflictDecisions": {
      "default-user/chats/example.jsonl": "local"
    }
  }
}
```

Required behavior:

- Refuse to start if LAN Sync or another cloud sync operation is active.
- Build a push plan from local and remote manifests.
- Upload only changed files.
- Refuse destructive commit when server reports unresolved conflicts.
- Apply `conflictDecisions` at commit time.
- Do not perform remote mirror delete until all required uploads are staged and commit succeeds.
- Emit or return progress data with files and bytes.

Response:

```json
{
  "summary": {
    "uploadFiles": 1,
    "uploadBytes": 123,
    "downloadFiles": 0,
    "downloadBytes": 0,
    "deleteFiles": 0,
    "conflictFiles": 0
  },
  "progress": {
    "phase": "committed",
    "filesTransferred": 1,
    "totalFiles": 1,
    "bytesTransferred": 123,
    "totalBytes": 123
  },
  "conflicts": []
}
```

### `tt_sync_pull`

Payload:

```json
{
  "dto": {
    "serverId": "server-id",
    "direction": "pull",
    "conflictDecisions": {
      "default-user/chats/example.jsonl": "remote"
    }
  }
}
```

Required behavior:

- Refuse to start if LAN Sync or another cloud sync operation is active.
- Download only changed files.
- Apply writes atomically: write to a temporary file, fsync/close when supported, then rename.
- Preserve remote `modifiedMs` as local filesystem mtime after successful write.
- Never replace a valid existing local file with a partial download.
- Apply local mirror delete only after all required downloads are safely staged.
- Surface network and filesystem errors to the frontend.

Response shape matches `tt_sync_push`.

### `tt_sync_unpair`

Payload:

```json
{
  "dto": {
    "serverId": "server-id"
  }
}
```

Required behavior:

- Remove the selected paired server from backend storage.
- Keep local Tavern data files untouched.
- Return `{ "ok": true }` or an equivalent success object.

## 4. Error Contract

Errors must be explicit. The frontend displays thrown command errors through `normalizeError()`.

Required error cases:

- Missing or invalid paired server.
- Invalid pairing URI.
- Authentication failure.
- Network failure.
- Conflict decision missing or invalid.
- LAN Sync / cloud sync mutex violation.
- Local manifest scan failure.
- Atomic write or mtime preservation failure.

Do not return `(mock) ok`, empty success, partial success, or fallback success when any required sync step fails.

## 5. Completion Evidence

A TauriTavern build is not considered compatible until:

- `npm run verify:tauritavern -- --source <build>` passes for the actual source/build artifact.
- `npm run smoke:tt-sync-server -- --endpoint <url> --pairing-token <token>` passes against the deployed server.
- Real device evidence confirms pairing persistence, live progress, mtime preservation, interruption safety, LAN/cloud sync mutex behavior, Android weak-network errors, and a large first sync.
- `npm run verify:incremental-evidence -- --commands <command-report.json> --smoke <remote-smoke-report.json> --device-evidence <device-evidence.json>` passes.
