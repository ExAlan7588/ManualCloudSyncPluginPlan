# TauriTavern TT-Sync 外部驗證

本文檔把本 repo 不能自行完成的 TauriTavern app、真機與 VPS 驗證項目收斂成可重複執行的證據清單。這些檢查不會被插件或 Minimal server 模擬；缺少實際 build、裝置或網路環境時，項目應保持未完成。

## 1. Command Surface 檢查

使用 repo 內的掃描工具確認 TauriTavern source tree、APK/AAB 或桌面 build artifact 內含必要 command 名稱：

```bash
npm run verify:tauritavern -- --source /path/to/TauriTavern --manifest /tmp/tt-sync-command-report.json
```

可接受的目標：

- TauriTavern source tree。
- Android APK/AAB。
- 桌面 release bundle。

必要命令：

- `tt_sync_cancel`
- `tt_sync_pair`
- `tt_sync_list_servers`
- `tt_sync_push`
- `tt_sync_pull`
- `tt_sync_remove_server`

通過標準：

- 工具 exit code 為 `0`。
- 報告中的 `missingCommands` 為空陣列。
- 每個 command 都有至少一個實際檔案命中。
- command report 必須包含 `tool=verify-tauritavern-tt-sync`、`schemaVersion=1` 與 `sourceKind`。`sourceKind=build-artifact` 時，command evidence 必須來自可信 build artifact；`sourceKind=source-tree` 或 `source-file` 時，command evidence 必須同時包含 Rust Tauri command 宣告與 handler 註冊，包含 `tauri::generate_handler!` 內的 `super::tt_sync_commands::<command>` registry 形式。文件、README、測試 fixture 或其他一般文字命中只會列在 `ignoredFiles`，不能用來關閉 build command 檢查。
- 目前上游 command surface 沒有獨立 `tt_sync_check_diff`；驗證不要求也不接受把不存在的 dry-run command 當作完成證據。

失敗時工具會列出缺少的 command 並以非零 exit code 結束；這代表該 build 不能被本插件視為增量同步可用。

## 2. Event Surface 檢查

使用 repo 內的 event-surface 掃描工具確認 TauriTavern source tree 內含實際 TT-Sync event 名稱與 payload 欄位：

```bash
npm run verify:tauritavern-events -- --source /path/to/TauriTavern --manifest /tmp/tt-sync-event-report.json
```

event surface report 必須包含 `tool=verify-tauritavern-events` 與 `schemaVersion=1`。

必要事件：

- `tt_sync:progress`
- `tt_sync:completed`
- `tt_sync:error`

必要 progress payload 欄位：

- `direction`
- `phase`
- `files_done`
- `files_total`
- `bytes_done`
- `bytes_total`
- `current_path`

必要 completed payload 欄位：

- `direction`
- `files_total`
- `bytes_total`
- `files_deleted`

通過標準：

- 工具 exit code 為 `0`。
- 報告中的 `missingEvents` 與 `missingPayloadFields` 都是空陣列。
- `diffConflictSurface` 只作為實際 surface 證據；final evidence gate 會要求 `preTransferDiffEvent`、`conflictEvent`、`conflictDto`、`conflictDecisionPayload` 都存在。更新後的 TauriTavern source tree 已補上 `tt_sync:diff`、`tt_sync:conflict`、`conflictDecisions` 與 `TtSyncConflict` DTO surface，因此 event surface report 可以通過；deploy / smoke 現在也已可由真實遠端報告補齊，剩下的主要缺口是 device evidence。

## 3. 配對保存檢查

前置條件：

- Minimal TT-Sync server 或上游 TT-Sync server 已在可被手機與電腦連到的 URL 啟動。
- 已設定 `TT_SYNC_PAIRING_TOKEN` 並產生配對 URI。
- systemd/env 部署設定已通過 `npm run verify:tt-sync-deploy -- --service <unit> --env <env-file>`；範例檔驗證才可使用 `--allow-placeholders`。
- 手機與電腦 build 都已通過 command surface 檢查。
- TauriTavern 後端符合 `docs/TauriTavernTtSyncCommandContract.md` 的 command contract。

驗證步驟：

1. 在手機 TauriTavern 的 `增量 TT-Sync` 面板輸入同一個配對 URI。
2. 點選配對，重新整理服務端列表。
3. 在電腦 TauriTavern 重複同樣流程。
4. 關閉並重開 app 後再次刷新服務端列表。

通過標準：

- 兩端都能看到同一個服務端。
- 重開 app 後服務端仍存在。
- 服務端 `/v2/devices?namespace=...` 能看到兩個不同 device。

## 4. VPS / TT-Sync Server Live Smoke

部署 Minimal TT-Sync server 或上游 TT-Sync server 後，先對實際 URL 跑 smoke verifier：

```bash
npm run smoke:tt-sync-server -- --endpoint https://sync.example.com --pairing-token "$TT_SYNC_PAIRING_TOKEN" --manifest /tmp/tt-sync-smoke-report.json
```

大批量部署驗證可明確指定 fixture 規模：

```bash
npm run smoke:tt-sync-server -- --endpoint https://sync.example.com --pairing-token "$TT_SYNC_PAIRING_TOKEN" --bulk-files 128 --bulk-file-bytes 2621440 --manifest /tmp/tt-sync-smoke-report.json
```

本機開發可明確使用：

```bash
npm run smoke:tt-sync-server -- --local
```

smoke verifier 會執行真實 HTTP 流程：

- `GET /v2/status`
- `POST /v2/pair/complete`
- `POST /v2/session/open`
- `POST /v2/sync/push-plan`
- `PUT /v2/plans/{plan_id}/files/{path_b64}`
- `GET /v2/plans/{plan_id}/events?once=1`
- `POST /v2/plans/{plan_id}/commit`
- `POST /v2/sync/pull-plan`
- `GET /v2/plans/{plan_id}/files/{path_b64}`
- `GET /v2/devices?namespace=...`
- `GET /v2/history?namespace=...`

通過標準：

- 工具 exit code 為 `0`。
- 報告中的 `ok` 為 `true`。
- 報告包含 status、pair、session、progress、push commit、pull mtime header、empty diff、device history 檢查。
- 報告包含 `fixture.fileCount`、`fixture.totalBytes` 與 `smokePaths`，且 `smokePath` 必須在 `smokePaths` 內。
- 遠端模式會在 namespace 留下一組唯一命名的 smoke 檔案作為部署證據；工具不會自動執行 mirror delete 清理，以避免誤刪既有遠端資料。

## 5. Pull mtime 保留

前置條件：

- 服務端下載回應包含 `X-TT-Sync-Modified-Ms` 與 `Last-Modified`。
- TauriTavern 後端 Pull 實作會把服務端 mtime 套用到本機檔案。

驗證步驟：

1. 在裝置 A Push 一個已知內容與 mtime 的檔案。
2. 在裝置 B Pull。
3. 使用裝置原生 shell 或開發工具讀取裝置 B 的本機檔案 mtime。

通過標準：

- 裝置 B 檔案內容與裝置 A 一致。
- 裝置 B 檔案 mtime 等於服務端 manifest 的 `modifiedMs`。
- 再次檢查差異時該檔案不會被誤判為變更。

## 6. Pull 中斷安全

驗證步驟：

1. 在裝置 B 建立一份可辨識的既有本機資料。
2. 從服務端開始 Pull 大檔或多檔同步。
3. 在傳輸中途關閉網路、殺掉 app，或停止 TT-Sync server。
4. 重新開啟 app，檢查本機資料。

通過標準：

- 未完成的檔案不會覆蓋既有可用檔案。
- 後端回報明確錯誤，不顯示成功。
- 下一次 Pull 能重新開始並完成。

## 7. LAN Sync 與雲端同步互斥

驗證步驟：

1. 開始 LAN Sync 傳輸。
2. 在 LAN Sync 仍在進行時嘗試 TT-Sync Push 或 Pull。
3. 反向測試：先開始 TT-Sync，再嘗試 LAN Sync。

通過標準：

- 第二個同步動作被明確拒絕。
- 錯誤訊息指出已有同步任務進行中。
- 兩種同步的狀態檔都沒有被納入 TT-Sync manifest。

## 8. Android 弱網路錯誤可見

驗證步驟：

1. Android 手機連到 TT-Sync server。
2. 使用系統網路限制、代理或測試 Wi-Fi 製造高延遲/斷線。
3. 執行 Push 與 Pull。

通過標準：

- UI 顯示明確失敗原因。
- 不出現成功 toast 或成功狀態。
- 重試前不需要清除 app data。

## 9. 證據格式

每次外部驗證應保存：

- TauriTavern 版本與 commit/build id。
- 裝置型號、OS 版本與網路型態。
- TT-Sync server URL、server commit 或部署版本。
- `verify-tauritavern` JSON 報告。
- `verify-tauritavern-events` JSON 報告。
- `smoke:tt-sync-server` JSON 報告。
- 測試時間與失敗時的錯誤訊息。

## 10. Final Evidence Gate

收齊 `sourceKind=build-artifact` 的實際手機與桌面 build command reports、event surface report、真實 VPS deploy report、遠端 smoke report 與真機 device evidence 後，執行：

```bash
npm run verify:incremental-evidence -- --mobile-commands /tmp/tt-sync-mobile-command-report.json --desktop-commands /tmp/tt-sync-desktop-command-report.json --events /tmp/tt-sync-event-report.json --deploy /tmp/tt-sync-deploy-report.json --smoke /tmp/tt-sync-smoke-report.json --device-evidence /tmp/tt-sync-device-evidence.json --manifest /tmp/tt-sync-final-evidence-report.json
```

final evidence gate 會拒絕 `--local` smoke report；部署證據必須來自非 localhost / loopback 的遠端 URL。
mobile 與 desktop command reports 都必須包含 `tool=verify-tauritavern-tt-sync`、`schemaVersion=1`、可解析 timestamp 的 `scannedAt`、實際 source、`sourceKind=build-artifact` 與 scanned file count。
每個 mobile/desktop command 都必須包含 verifier 產生的 trusted `build-artifact-string` evidence。source tree command report 仍可做整合前檢查，但 final evidence gate 不接受 source tree 取代實際 build artifact。
event surface report 必須包含 `tool=verify-tauritavern-events`、`schemaVersion=1`，來自 `sourceKind=source-tree` 的 TauriTavern source tree，並包含可解析 timestamp 的 `scannedAt`、實際 source、scanned file count、空的 `missingEvents` 與空的 `missingPayloadFields`，且必須包含 `tt_sync:progress`、`tt_sync:completed`、`tt_sync:error`，以及 `diffConflictSurface` 內的 `preTransferDiffEvent`、`conflictEvent`、`conflictDto`、`conflictDecisionPayload`。
`realLargeFirstSyncCompleted.metrics.totalBytes` 必須至少為 300MiB。
device evidence 的 `commandContractVerified.mobileCommandReport.*`、`commandContractVerified.desktopCommandReport.*` 與 `commandContractVerified.eventSurfaceReport.*` 必須和頂層 command/event reports 一致，包含 `tool`、`schemaVersion`、`source`、`scannedAt`、`sourceKind`，且 `commandContractVerified.contract.commands` 必須覆蓋全部必要 `tt_sync_*` commands；這就是 final evidence 所要求的 event surface report reference consistency。
deploy report 必須來自不使用 `--allow-placeholders` 的真實 env 驗證，`servicePath` / `envPath` 必須是非範例絕對路徑，且所有 deploy checks 都必須有 name/detail 並是 `ok=true`；deploy report 的 `publicUrl` 必須和遠端 smoke endpoint 一致。
deploy report 必須包含 `tool=verify-tt-sync-deploy` 與 `schemaVersion=1`；遠端 smoke report 必須包含 `tool=smoke-tt-sync-server` 與 `schemaVersion=1`。
deploy report 的 `publicUrl`、遠端 smoke endpoint 與 device evidence 的 `server.url` 都必須使用 HTTPS；本機 `--local` smoke 可用 HTTP，但不能關閉 final evidence。
deploy report 的 `publicUrl`、遠端 smoke endpoint 與 device evidence 的 `server.url` 都不能使用 placeholder or reserved domains；這包含 `example.com` / `example.net` / `example.org` 及其子網域，也包含 `.test` / `.invalid` / `.localhost` / `.local` 這類保留尾碼。
deploy report 的 `publicUrl`、遠端 smoke endpoint 與 device evidence 的 `server.url` 都不能包含 credentials/query/fragment。
遠端 smoke report 必須包含可解析 timestamp 的 `completedAt`、`smokePath`、`deviceId`、`serverId`、push/pull `planIds`、`status.version`、fixture files/bytes 與 smoke paths，且所有 smoke checks 都必須有 name/detail 並是 `ok=true`。
device evidence 的 `server.url` 必須和遠端 smoke report 的 endpoint 是同一個 URL，phone/desktop saved server URL 也必須和 `server.url` 一致，phone/desktop saved server id 必須和 smoke report 的 `serverId` 一致，且 Android/desktop device record 都必須包含可追溯的 `deviceId`。
device evidence 的 `testedAt`、mobile/desktop command report `scannedAt`、phone/desktop `restartVerifiedAt` 與 Android `capturedAt` 都必須是可解析 timestamp。
`pullMtimePreserved.mtime.expectedModifiedMs` 必須等於 `pullMtimePreserved.mtime.actualModifiedMs`；`pullInterruptionSafe.interruption.beforeHash` 必須等於 `pullInterruptionSafe.interruption.afterHash`。

device evidence JSON 需包含：

```bash
npm run evidence:device-template -- --output /tmp/tt-sync-device-evidence.json
```

已有 mobile/desktop command reports 與 event surface report 時，可先預填 report references 與 command names，避免手動複製 `tool`、`schemaVersion`、`source`、`scannedAt`、`sourceKind` 時出錯；模板仍會保留每個檢查的 `ok=false`：

```bash
npm run evidence:device-template -- --output /tmp/tt-sync-device-evidence.json --mobile-command-report /tmp/tt-sync-mobile-command-report.json --desktop-command-report /tmp/tt-sync-desktop-command-report.json --event-report /tmp/tt-sync-event-report.json
```

模板會建立完整欄位，但每個檢查都預設 `ok=false`；必須填入真實 evidence、補齊 required fields 並改成 `ok=true` 後，final evidence gate 才可能通過。

final evidence gate 會檢查下列 dot-path 欄位：

- `realLargeFirstSyncCompleted`: `metrics.durationMs`, `metrics.fileCount`, `metrics.totalBytes`
- `commandContractVerified`: `contract.commands`, `contract.reportId`, `mobileCommandReport.tool`, `mobileCommandReport.schemaVersion`, `mobileCommandReport.scannedAt`, `mobileCommandReport.source`, `mobileCommandReport.sourceKind`, `desktopCommandReport.tool`, `desktopCommandReport.schemaVersion`, `desktopCommandReport.scannedAt`, `desktopCommandReport.source`, `desktopCommandReport.sourceKind`, `eventSurfaceReport.tool`, `eventSurfaceReport.schemaVersion`, `eventSurfaceReport.scannedAt`, `eventSurfaceReport.source`, `eventSurfaceReport.sourceKind`
- `phoneDesktopPairingSaved`: `desktop.restartVerifiedAt`, `desktop.savedServerId`, `desktop.savedServerUrl`, `phone.restartVerifiedAt`, `phone.savedServerId`, `phone.savedServerUrl`
- `liveProgressBridgeVisible`: `progress.bytesTransferred`, `progress.currentPath`, `progress.eventCount`, `progress.filesTransferred`, `progress.lastPhase`
- `pullMtimePreserved`: `mtime.actualModifiedMs`, `mtime.expectedModifiedMs`, `mtime.path`
- `pullInterruptionSafe`: `interruption.afterHash`, `interruption.beforeHash`, `interruption.error`, `interruption.path`, `interruption.runId`
- `lanCloudSyncMutex`: `mutex.blockedOperation`, `mutex.cloudWhileLanBlockedOperation`, `mutex.cloudWhileLanVisibleError`, `mutex.lanWhileCloudBlockedOperation`, `mutex.lanWhileCloudVisibleError`, `mutex.visibleError`
- `androidWeakNetworkErrorVisible`: `android.capturedAt`, `android.errorCode`, `android.networkProfile`, `android.operation`, `android.visibleError`

```json
{
  "testedAt": "2026-05-12T00:00:00+08:00",
  "tauriTavern": {
    "mobileBuildId": "android-build-id",
    "desktopBuildId": "desktop-build-id"
  },
  "devices": [
    { "deviceId": "android-device-id", "platform": "Android 15", "model": "Pixel" },
    { "deviceId": "desktop-device-id", "platform": "Linux desktop", "model": "Workstation" }
  ],
  "server": {
    "url": "https://sync.example.com"
  },
  "checks": {
    "realLargeFirstSyncCompleted": {
      "ok": true,
      "evidence": "300MB first sync report path or run id",
      "metrics": { "durationMs": 120000, "fileCount": 128, "totalBytes": 335544320 }
    },
    "commandContractVerified": {
      "ok": true,
      "evidence": "backend command contract test report path or build verification id",
      "contract": {
        "reportId": "contract-test-report-id",
        "commands": ["tt_sync_cancel", "tt_sync_pair", "tt_sync_list_servers", "tt_sync_push", "tt_sync_pull", "tt_sync_remove_server"]
      },
      "mobileCommandReport": { "tool": "verify-tauritavern-tt-sync", "schemaVersion": 1, "scannedAt": "2026-05-12T00:00:00+08:00", "source": "/builds/TauriTavern-mobile.apk", "sourceKind": "build-artifact" },
      "desktopCommandReport": { "tool": "verify-tauritavern-tt-sync", "schemaVersion": 1, "scannedAt": "2026-05-12T00:00:20+08:00", "source": "/builds/TauriTavern-desktop.dmg", "sourceKind": "build-artifact" },
      "eventSurfaceReport": { "tool": "verify-tauritavern-events", "schemaVersion": 1, "scannedAt": "2026-05-12T00:00:10+08:00", "source": "/src/TauriTavern", "sourceKind": "source-tree" }
    },
    "phoneDesktopPairingSaved": {
      "ok": true,
      "evidence": "both devices still list server after restart",
      "phone": {
        "restartVerifiedAt": "2026-05-12T00:02:00+08:00",
        "savedServerId": "550e8400-e29b-41d4-a716-446655440001",
        "savedServerUrl": "https://sync.example.com"
      },
      "desktop": {
        "restartVerifiedAt": "2026-05-12T00:02:00+08:00",
        "savedServerId": "550e8400-e29b-41d4-a716-446655440001",
        "savedServerUrl": "https://sync.example.com"
      }
    },
    "liveProgressBridgeVisible": {
      "ok": true,
      "evidence": "progress event capture or screen recording id",
      "progress": {
        "bytesTransferred": 335544320,
        "currentPath": "default-user/chats/example.jsonl",
        "eventCount": 12,
        "filesTransferred": 128,
        "lastPhase": "committed"
      }
    },
    "preTransferDiffVisible": {
      "ok": true,
      "evidence": "pre-transfer diff screenshot or event capture id",
      "diff": {
        "capturedAt": "2026-05-12T00:04:00+08:00",
        "uploadFiles": 1,
        "downloadFiles": 1,
        "deleteFiles": 0,
        "conflictFiles": 1
      }
    },
    "conflictResolutionVisible": {
      "ok": true,
      "evidence": "conflict resolution screenshot or interaction capture id",
      "conflict": {
        "capturedAt": "2026-05-12T00:04:30+08:00",
        "path": "default-user/chats/conflict.jsonl",
        "localChoiceLabel": "使用本機",
        "remoteChoiceLabel": "使用遠端",
        "selectedDecision": "local"
      }
    },
    "pullMtimePreserved": {
      "ok": true,
      "evidence": "mtime before/after shell output path",
      "mtime": { "expectedModifiedMs": 1778500000000, "actualModifiedMs": 1778500000000, "path": "default-user/chats/example.jsonl" }
    },
    "pullInterruptionSafe": {
      "ok": true,
      "evidence": "interrupted Pull run id and local file hash evidence",
      "interruption": {
        "beforeHash": "sha256-stable",
        "afterHash": "sha256-stable",
        "error": "interrupted pull",
        "path": "default-user/chats/example.jsonl",
        "runId": "pull-interruption-run-id"
      }
    },
    "lanCloudSyncMutex": {
      "ok": true,
      "evidence": "mutex rejection log path",
      "mutex": {
        "blockedOperation": "lan_sync_start while tt_sync_pull is active",
        "cloudWhileLanBlockedOperation": "tt_sync_push while lan_sync_pull is active",
        "cloudWhileLanVisibleError": "LAN sync already running",
        "lanWhileCloudBlockedOperation": "lan_sync_start while tt_sync_push is active",
        "lanWhileCloudVisibleError": "Cloud sync already running",
        "visibleError": "Cloud sync already running"
      }
    },
    "androidWeakNetworkErrorVisible": {
      "ok": true,
      "evidence": "Android weak-network error capture id",
      "android": {
        "capturedAt": "2026-05-12T00:03:00+08:00",
        "errorCode": "network-timeout",
        "networkProfile": "Android emulator weak network",
        "operation": "tt_sync_pull",
        "visibleError": "TT-Sync failed: network timeout"
      }
    }
  }
}
```

每個 check 必須是 `{ "ok": true, "evidence": "...", ...requiredFields }`；單純布林值 `true` 或只有文字 evidence 不會被接受為完成證據。
新增或更新 device evidence 時，final gate 會逐一檢查下列 dot-path 欄位，包含 `diff.capturedAt`、`diff.uploadFiles`、`diff.downloadFiles`、`diff.deleteFiles`、`diff.conflictFiles`、`conflict.capturedAt`、`conflict.path`、`conflict.localChoiceLabel`、`conflict.remoteChoiceLabel`、`conflict.selectedDecision`。
