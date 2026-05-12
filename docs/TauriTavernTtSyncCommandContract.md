# TauriTavern TT-Sync Command Contract

本文檔定義本插件前端會呼叫的 TauriTavern 原生命令契約。它不是 mock 規格；若後端缺少命令或實作不完整，前端應收到明確錯誤，而不是成功回應。

## 1. Command Surface

前端呼叫點在 `modules/tt-sync.js`，命令名稱固定如下：

- `tt_sync_pair`
- `tt_sync_list_servers`
- `tt_sync_push`
- `tt_sync_pull`
- `tt_sync_remove_server`

目前上游 TauriTavern TT-Sync v2 command surface 沒有獨立 dry-run diff command。前端不得呼叫不存在的 `tt_sync_check_diff`，也不得用 fake diff summary 模擬成功。
前端可以訂閱實際 Tauri event `tt_sync:diff` 與 `tt_sync:conflict` 來顯示差異摘要與衝突列表；若後端沒有發出事件或 command 沒有回傳對應 payload，前端只保持空狀態，不補假資料。

## 2. Shared Types

### Sync Mode

```json
"Incremental"
```

可接受值：

- `Incremental`
- `Mirror`

### Paired Server

`tt_sync_list_servers` 與 `tt_sync_pair` 回傳的 server 欄位以目前上游 DTO 為準：

```json
{
  "server_device_id": "server-device-id",
  "server_device_name": "VPS",
  "base_url": "https://sync.example.com",
  "spki_sha256": "base64url-spki-pin",
  "permissions": {
    "read": true,
    "write": true,
    "mirror_delete": false
  },
  "paired_at_ms": 1778515200000,
  "last_sync_ms": null
}
```

前端也會接受 camelCase 相容欄位，但後端契約以 snake_case 為 canonical。

### Progress Event

後端在同步過程中發出 Tauri event `tt_sync:progress`：

```json
{
  "direction": "Push",
  "phase": "Uploading",
  "files_done": 1,
  "files_total": 3,
  "bytes_done": 123,
  "bytes_total": 456,
  "current_path": "default-user/chats/example.jsonl"
}
```

### Completed Event

後端在同步完成時發出 Tauri event `tt_sync:completed`：

```json
{
  "direction": "Push",
  "files_total": 3,
  "bytes_total": 456,
  "files_deleted": 0
}
```

### Diff Event

後端在執行前或 plan 建立後可發出 Tauri event `tt_sync:diff`；payload 應包含可追溯的差異摘要：

```json
{
  "direction": "Push",
  "summary": {
    "uploadFiles": 1,
    "uploadBytes": 123,
    "downloadFiles": 0,
    "downloadBytes": 0,
    "deleteFiles": 0,
    "conflictFiles": 0
  }
}
```

### Conflict Event

後端發現未解決衝突時可發出 Tauri event `tt_sync:conflict`；payload 應包含衝突檔案 DTO：

```json
{
  "direction": "Push",
  "conflicts": [
    {
      "path": "default-user/chats/example.jsonl",
      "local": { "sizeBytes": 123, "modifiedMs": 1778515200000 },
      "remote": { "sizeBytes": 120, "modifiedMs": 1778515300000 }
    }
  ]
}
```

### Error Event

後端在同步失敗時發出 Tauri event `tt_sync:error`：

```json
{
  "direction": "Pull",
  "message": "TT-Sync server does not grant read permission"
}
```

## 3. Commands

### `tt_sync_pair`

Payload:

```json
{
  "pairUri": "tauritavern://tt-sync/pair?v=2&url=...&token=...&exp=...&spki=..."
}
```

Required behavior:

- Validate the pairing URI and reject malformed, expired, or untrusted values.
- Complete pairing against the TT-Sync server.
- Persist the paired server in TauriTavern backend storage.
- Persist device identity and namespace/auth material outside frontend localStorage.
- Return the paired server DTO or throw an explicit error.

### `tt_sync_list_servers`

Payload: none.

Response:

```json
[
  {
    "server_device_id": "server-device-id",
    "server_device_name": "VPS",
    "base_url": "https://sync.example.com",
    "permissions": {
      "read": true,
      "write": true,
      "mirror_delete": false
    },
    "paired_at_ms": 1778515200000,
    "last_sync_ms": null
  }
]
```

Required behavior:

- Read persisted paired servers from backend storage.
- Return the same server after app restart until explicitly removed.
- Keep server IDs stable across Push, Pull, remove, and final evidence reports.

### `tt_sync_push`

Payload:

```json
{
  "serverDeviceId": "server-device-id",
  "mode": "Incremental"
}
```

Required behavior:

- Refuse to start if LAN Sync or another cloud sync operation is active.
- Scan the local TauriTavern data root into a manifest.
- Exclude LAN Sync, manual-cloud-sync, incremental-cloud-sync state files, and `_tauritavern/.ios-policy.json`.
- Ask the selected TT-Sync server for a push plan.
- Upload only changed files.
- Do not perform remote mirror delete until all required uploads are staged and commit succeeds.
- Emit `tt_sync:diff` before transfer when a pre-transfer plan summary is available.
- Emit `tt_sync:conflict` instead of destructive sync when unresolved conflicts require user review.
- Emit `tt_sync:progress` events with files and bytes.
- Emit `tt_sync:completed` with transferred file/byte totals, or `tt_sync:error` with an explicit failure message.

The command may return `null`/unit on success because completion data is delivered through events.

### `tt_sync_pull`

Payload:

```json
{
  "serverDeviceId": "server-device-id",
  "mode": "Incremental"
}
```

Required behavior:

- Refuse to start if LAN Sync or another cloud sync operation is active.
- Download only changed files from the selected TT-Sync server.
- Apply writes atomically: write to a temporary file, fsync/close when supported, then rename.
- Preserve remote `modifiedMs` as local filesystem mtime after successful write.
- Never replace a valid existing local file with a partial download.
- Apply local mirror delete only after all required downloads are safely staged.
- Emit `tt_sync:diff` before transfer when a pre-transfer plan summary is available.
- Emit `tt_sync:conflict` instead of destructive sync when unresolved conflicts require user review.
- Emit `tt_sync:progress`, `tt_sync:completed`, and `tt_sync:error` events with the same semantics as Push.
- Refresh TauriTavern runtime caches after successful Pull before completion is surfaced.

### `tt_sync_remove_server`

Payload:

```json
{
  "serverDeviceId": "server-device-id"
}
```

Required behavior:

- Remove the selected paired server from backend storage.
- Keep local Tavern data files untouched.
- Return success or throw an explicit error.

## 4. Error Contract

Errors must be explicit. The frontend displays thrown command errors through `normalizeError()` and displays `tt_sync:error` event messages in the TT-Sync panel.

Required error cases:

- Missing or invalid paired server.
- Invalid pairing URI.
- Authentication or permission failure.
- Network failure.
- LAN Sync / cloud sync mutex violation.
- Local manifest scan failure.
- Atomic write or mtime preservation failure.

Do not return `(mock) ok`, empty success, partial success, or fallback success when any required sync step fails.

## 5. Completion Evidence

A TauriTavern build is not considered compatible until:

- `npm run verify:tauritavern -- --source <build>` passes for both actual mobile and desktop build artifacts.
- `npm run smoke:tt-sync-server -- --endpoint <url> --pairing-token <token>` passes against the deployed server.
- Structured real device evidence confirms command contract behavior, command/event report tool/schemaVersion consistency, event surface report reference consistency, pairing persistence, live progress, mtime preservation, interruption safety, LAN/cloud sync mutex behavior, Android weak-network errors, and a large first sync.
- `npm run verify:incremental-evidence -- --mobile-commands <mobile-command-report.json> --desktop-commands <desktop-command-report.json> --events <event-report.json> --deploy <deploy-report.json> --smoke <remote-smoke-report.json> --device-evidence <device-evidence.json> --manifest <final-evidence-report.json>` passes and writes a final evidence report.
