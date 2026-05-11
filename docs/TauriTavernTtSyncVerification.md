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

- `tt_sync_pair`
- `tt_sync_list_servers`
- `tt_sync_check_diff`
- `tt_sync_push`
- `tt_sync_pull`
- `tt_sync_unpair`

通過標準：

- 工具 exit code 為 `0`。
- 報告中的 `missingCommands` 為空陣列。
- 每個 command 都有至少一個實際檔案命中。

失敗時工具會列出缺少的 command 並以非零 exit code 結束；這代表該 build 不能被本插件視為增量同步可用。

## 2. 配對保存檢查

前置條件：

- Minimal TT-Sync server 或上游 TT-Sync server 已在可被手機與電腦連到的 URL 啟動。
- 已設定 `TT_SYNC_PAIRING_TOKEN` 並產生配對 URI。
- 手機與電腦 build 都已通過 command surface 檢查。
- TauriTavern 後端符合 `docs/TauriTavernTtSyncCommandContract.md` 的 command contract。

驗證步驟：

1. 在手機 TauriTavern 的 `增量 TT-Sync` 面板輸入同一個配對 URI 和手機裝置名稱。
2. 點選配對，重新整理服務端列表。
3. 在電腦 TauriTavern 重複同樣流程，使用不同裝置名稱。
4. 關閉並重開 app 後再次刷新服務端列表。

通過標準：

- 兩端都能看到同一個服務端。
- 重開 app 後服務端仍存在。
- 服務端 `/v2/devices?namespace=...` 能看到兩個不同 device。

## 3. VPS / TT-Sync Server Live Smoke

部署 Minimal TT-Sync server 或上游 TT-Sync server 後，先對實際 URL 跑 smoke verifier：

```bash
npm run smoke:tt-sync-server -- --endpoint https://sync.example.com --pairing-token "$TT_SYNC_PAIRING_TOKEN" --manifest /tmp/tt-sync-smoke-report.json
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
- 遠端模式會在 namespace 留下一個唯一 smoke 檔案作為部署證據；工具不會自動執行 mirror delete 清理，以避免誤刪既有遠端資料。

## 4. Pull mtime 保留

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

## 5. Pull 中斷安全

驗證步驟：

1. 在裝置 B 建立一份可辨識的既有本機資料。
2. 從服務端開始 Pull 大檔或多檔同步。
3. 在傳輸中途關閉網路、殺掉 app，或停止 TT-Sync server。
4. 重新開啟 app，檢查本機資料。

通過標準：

- 未完成的檔案不會覆蓋既有可用檔案。
- 後端回報明確錯誤，不顯示成功。
- 下一次 Pull 能重新開始並完成。

## 6. LAN Sync 與雲端同步互斥

驗證步驟：

1. 開始 LAN Sync 傳輸。
2. 在 LAN Sync 仍在進行時嘗試 TT-Sync Push 或 Pull。
3. 反向測試：先開始 TT-Sync，再嘗試 LAN Sync。

通過標準：

- 第二個同步動作被明確拒絕。
- 錯誤訊息指出已有同步任務進行中。
- 兩種同步的狀態檔都沒有被納入 TT-Sync manifest。

## 7. Android 弱網路錯誤可見

驗證步驟：

1. Android 手機連到 TT-Sync server。
2. 使用系統網路限制、代理或測試 Wi-Fi 製造高延遲/斷線。
3. 執行 Push 與 Pull。

通過標準：

- UI 顯示明確失敗原因。
- 不出現成功 toast 或成功狀態。
- 重試前不需要清除 app data。

## 8. 證據格式

每次外部驗證應保存：

- TauriTavern 版本與 commit/build id。
- 裝置型號、OS 版本與網路型態。
- TT-Sync server URL、server commit 或部署版本。
- `verify-tauritavern` JSON 報告。
- `smoke:tt-sync-server` JSON 報告。
- 測試時間與失敗時的錯誤訊息。

## 9. Final Evidence Gate

收齊 command report、遠端 smoke report 與真機 device evidence 後，執行：

```bash
npm run verify:incremental-evidence -- --commands /tmp/tt-sync-command-report.json --smoke /tmp/tt-sync-smoke-report.json --device-evidence /tmp/tt-sync-device-evidence.json --manifest /tmp/tt-sync-final-evidence-report.json
```

final evidence gate 會拒絕 `--local` smoke report；部署證據必須來自非 localhost / loopback 的遠端 URL。

device evidence JSON 需包含：

```bash
npm run evidence:device-template -- --output /tmp/tt-sync-device-evidence.json
```

模板會建立完整欄位，但每個檢查都預設 `ok=false`；必須填入真實 evidence 並改成 `ok=true` 後，final evidence gate 才可能通過。

```json
{
  "testedAt": "2026-05-12T00:00:00+08:00",
  "tauriTavern": {
    "mobileBuildId": "android-build-id",
    "desktopBuildId": "desktop-build-id"
  },
  "devices": [
    { "platform": "Android 15", "model": "Pixel" },
    { "platform": "Linux desktop", "model": "Workstation" }
  ],
  "checks": {
    "realLargeFirstSyncCompleted": { "ok": true, "evidence": "300MB first sync report path or run id" },
    "phoneDesktopPairingSaved": { "ok": true, "evidence": "both devices still list server after restart" },
    "liveProgressBridgeVisible": { "ok": true, "evidence": "progress event capture or screen recording id" },
    "pullMtimePreserved": { "ok": true, "evidence": "mtime before/after shell output path" },
    "pullInterruptionSafe": { "ok": true, "evidence": "interrupted Pull run id and local file hash evidence" },
    "lanCloudSyncMutex": { "ok": true, "evidence": "mutex rejection log path" },
    "androidWeakNetworkErrorVisible": { "ok": true, "evidence": "Android weak-network error capture id" }
  }
}
```

每個 check 必須是 `{ "ok": true, "evidence": "..." }`；單純布林值 `true` 不會被接受為完成證據。
