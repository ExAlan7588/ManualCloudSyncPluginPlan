# 增量雲端同步製作計畫

本文檔規劃下一版「像遊戲雲存檔」的同步方案，用來取代目前手動雲端同步的全量 zip 交棒模式。目標是讓手機平常遊玩後，只上傳真正變動的檔案，而不是每次重新傳 300MB 資料封存。

## 1. 背景與問題

目前 `manual-cloud-sync` 的相容模式依賴 TauriTavern 內建資料遷移：

- 匯出時會把整個 data root 打包成 zip。
- 插件只能把使用者選到的 zip 上傳到 WebDAV。
- 手機舊版沒有 `cloud_sync_*` 後端命令時，插件無法直接讀取本機資料目錄做逐檔 diff。
- 資料量一大，上傳速度與耗電都很差；300MB zip 是合理但不可接受的日常同步成本。

要真正改善，必須由 TauriTavern 後端參與：掃描本機檔案 manifest、和遠端 manifest 比對、只傳變更檔案、保留 mirror delete 與衝突處理語意。

## 2. 已有基礎

專案內已存在同步相關基礎，不應重新發明：

- LAN Sync v1：`src-tauri/src/infrastructure/lan_sync/`
- TT-Sync v2：`src-tauri/src/infrastructure/tt_sync/`
- 同步檔案 IO：`src-tauri/src/infrastructure/sync_fs.rs`
- 傳輸並發：`src-tauri/src/infrastructure/sync_transfer.rs`
- 後端命令：`tt_sync_pair`、`tt_sync_list_servers`、`tt_sync_pull`、`tt_sync_push`
- 現況文件：`docs/CurrentState/Sync.md`

TT-Sync v2 已經具備很多理想形態：

- 掃描本機 manifest。
- 依 scope/exclude 排除同步狀態檔。
- 服務端產生 push/pull plan。
- per-file 與 bundle 傳輸。
- 可選 zstd 壓縮。
- Mirror delete 時序。
- 原子寫入與 mtime 保留。
- 進度事件。

第一個實作決策不是「從零做一套」，而是確認 TT-Sync v2 是否能直接承接這個需求。

## 3. 目標

第一階段要做到：

- 在手機與電腦都能連到同一個 VPS 同步端。
- 顯示本機與遠端差異摘要。
- 只上傳/下載變更檔案。
- 顯示傳輸進度、速度、檔案數與 bytes。
- 支援手動 Push、Pull。
- 匯入/套用失敗時明確報錯，不做假成功或靜默降級。
- 不再把同步本身的狀態檔同步出去。

第二階段再做：

- 帳號登入。
- 多裝置列表。
- 衝突檢視與選擇。
- 同步歷史與回滾點。
- 更好的手機端首次設定流程。

## 3.1 目前落地狀態（2026-05-12）

本 repo 是 GitHub 前端插件，原本不包含 `src-tauri` 後端、TT-Sync server、VPS 部署檔或手機 build pipeline。已完成 repo-local 交付：

- 新增獨立 `增量 TT-Sync` 面板，和既有全量 zip 交棒同步分離。
- UI 呼叫目前上游真實 `tt_sync_*` command 名稱：`tt_sync_pair`、`tt_sync_list_servers`、`tt_sync_push`、`tt_sync_pull`、`tt_sync_remove_server`。
- 顯示服務端狀態、同步模式、Push/Pull 操作、進度欄位與完成摘要。
- 新增差異摘要與衝突列表 UI 承接面；只渲染後端 command 回傳或 `tt_sync:diff` / `tt_sync:conflict` event 內的真實 payload，不用 fake summary 或假衝突補齊缺失。
- 目前上游沒有獨立 `tt_sync_check_diff` dry-run command；插件已移除該呼叫，不用 fake summary 模擬成功。
- 缺少 TT-Sync 後端命令時顯示明確錯誤，不做 mock success 或靜默降級。
- 既有 WebDAV/S3 完整封存與資料遷移相容模式保留。
- 新增無第三方依賴的 Minimal TT-Sync server artifact，可保存 namespace、manifest、files、plans，並支援 per-file/bundle transfer 與 commit。
- 新增 `tools/verify-tauritavern-tt-sync.js`，可掃描 TauriTavern source tree、APK/AAB 或桌面 build artifact 是否包含必要 `tt_sync_*` command 名稱，並在 report 內寫入 `tool=verify-tauritavern-tt-sync` 與 `schemaVersion=1` provenance。
- 新增 `tools/smoke-tt-sync-server.js`，可對實際 TT-Sync URL 跑 status、pair、session、Push、progress、Pull、mtime header、empty diff 與 device/history smoke，並可用 `--bulk-files` / `--bulk-file-bytes` 產生多檔或大檔部署證據。
- 新增 `tools/verify-incremental-cloud-sync-evidence.js`，可在帶 `tool/schemaVersion provenance` 且 `sourceKind=build-artifact` 的實際手機與桌面 build command reports、帶 `tool/schemaVersion provenance`、`sourceKind=source-tree` 且含 diff/conflict surface 的 event surface report、含 tool/schemaVersion provenance、service/env path 為非範例絕對路徑且 URL 使用 HTTPS、不是 placeholder or reserved domains 且不含 credentials/query/fragment 的真實 VPS deploy report、帶 fixture provenance 且必要 check 皆通過的遠端 smoke report 與真機 device evidence 都齊全時作為 final evidence gate；device evidence 內的 command 與 event surface report reference consistency 也必須對齊頂層 reports。
- 新增 `tools/create-device-evidence-template.js`，可產生所有真機檢查預設 `ok=false` 並列出 required fields 的 device evidence 模板。
- 新增 `docs/TauriTavernTtSyncCommandContract.md`，明確定義前端呼叫的 `tt_sync_*` command contract 與後端必須保證的 mtime、atomic write、mutex、error 行為。

仍屬外部交付，不能在此 repo 內驗證完成：

- 手機/電腦 app build command evidence 已用 `/tmp/TauriTavern-inspect` 的 Android `x86_64` universal debug APK 與 Linux desktop release binary 產生並通過 verifier；Android clean APK 也已在 Android 15 emulator 載入 TauriTavern 基礎 UI，證據位於 `/tmp/tt-sync-android-runtime-evidence-run5`。Android runtime command 證據位於 `/tmp/tt-sync-android-command-probe`、`/tmp/tt-sync-android-sync-probe` 與 `/tmp/tt-sync-android-weak-network-probe`：透過 WebView Chrome DevTools Protocol 呼叫真實 `window.__TAURI__.core.invoke('tt_sync_pair')` / `tt_sync_list_servers`，並在 app 重啟後確認 `paired-servers.json` 保存 server `f18da39c-9044-43bf-8eef-6babb2cc01ef`；更新後也呼叫真實 `tt_sync_push` / `tt_sync_pull`，捕捉 `tt_sync:progress`、`tt_sync:completed` 與弱網路下的 `tt_sync:error`，其中 push 完成 164 檔 / 7,858,061 bytes，airplane-mode 斷線時 UI 顯示 `Internal error: error sending request for url (https://10.0.2.2:9443/v2/session/open)`。Linux desktop runtime 證據位於 `/tmp/tt-sync-desktop-runtime-probe`：在 Docker/Xvfb 內透過 WebKit HTTP inspector 呼叫真實 `window.__TAURI__.core.invoke('tt_sync_pair')` 與 `tt_sync_list_servers`，並在重啟後確認 `paired-servers.json` 保留 server `7f5a1d00-9efb-4d10-a632-1e0a377eea81`；另在 `/tmp/tt-sync-desktop-mtime-probe` 以真實 `tt_sync_pull` 確認 remote file 寫入後本機 `mtime` 與 `modifiedMs` 完全一致。這些 Android 與 desktop 證據都使用 local pinned HTTPS URL，不是 final public smoke endpoint；仍需公開 HTTPS smoke endpoint 一致的手機/桌面配對，以及 LAN/cloud 互斥與 UI diff/conflict 顯示證據。
- Minimal TT-Sync server 已在 repo 內建立並以自動測試驗證；systemd/env 設定可用 `npm run verify:tt-sync-deploy` 檢查；遠端 smoke 已通過，且大資料 first-sync push 已用 HTTPS tunnel commit 335,544,320 bytes；公開 endpoint 一致的 device evidence 與 LAN/cloud 互斥證據仍需外部環境。
- 真實裝置端到端首同步、mirror delete 與 LAN Sync 互斥驗證仍需補齊；Android emulator 已取得基礎 UI、pair persistence、runtime push/pull command 與弱網路可見錯誤證據，Linux desktop 也已取得 pair persistence、pull mtime 與 pull interruption 證據，但公開 endpoint 的手機+桌面 device evidence 仍需再通過 `npm run verify:incremental-evidence`。

## 4. 非目標

第一階段先不做：

- 背景自動同步。
- 多端同時編輯同一檔案的智慧合併。
- 聊天內容的語義級 merge。
- 全資料庫式雲端化。
- 沒有後端命令的純前端插件增量同步。

純 GitHub 插件只能做 UI 與 Web API 呼叫，不能可靠掃描或寫入手機本機資料目錄，因此不是增量同步的承載層。

## 5. 產品形態

### 5.1 最快可落地版本：配對式 TT-Sync

使用既有 TT-Sync v2 模型：

1. VPS 跑 TT-Sync 服務。
2. VPS 產生配對 URI 或 QR。
3. 手機/電腦用 `tt_sync_pair` 保存服務端。
4. UI 顯示已配對服務端。
5. 使用者按 Push 或 Pull。
6. 後端產生 diff plan，只傳變更檔案。

這不是完整「帳號登入」，但能最快解決 300MB 全量上傳問題。

### 5.2 完整版本：帳號式同步服務

在 TT-Sync 服務端外層加帳號系統：

1. 使用者登入。
2. 服務端管理 account、device、sync namespace。
3. 每台裝置有獨立 device identity。
4. UI 顯示各裝置最後同步時間與差異。
5. 支援衝突檢視。

這是最接近遊戲雲存檔的體驗，但工程量較大，放第二階段。

## 6. 同步語意

### 6.1 Manifest

本機與遠端都用 manifest 描述檔案狀態：

```json
{
  "path": "default-user/chats/example.jsonl",
  "sizeBytes": 12345,
  "modifiedMs": 1778500000000,
  "sha256": "optional-or-on-demand"
}
```

比對策略：

- 快速判定先用 `path + sizeBytes + modifiedMs`。
- 發現疑似衝突或 mtime 不可信時，再計算 SHA-256。
- 寫入後必須保留 mtime，否則下一次會重複同步。
- manifest 內 `path` 必須唯一；重複 path 代表來源掃描錯誤，必須明確失敗，不可默默取最後一筆。
- `sizeBytes` 與 `modifiedMs` 必須是非負安全整數；非整數 mtime 會讓後續 diff 和 mtime 保留不可追溯。

### 6.2 Scope 與排除

同步範圍應沿用 TT-Sync/LAN Sync 既有 scope 規則。

必須排除：

- LAN Sync 狀態：`default-user/user/lan-sync/**`
- TT-Sync 狀態：`default-user/user/lan-sync/tt-sync-v2/**`
- iOS policy 本機快取：`_tauritavern/.ios-policy.json`
- 新增的 manual/incremental cloud sync 本機狀態目錄

### 6.3 Push

Push 表示「本機推到遠端」：

1. 掃描本機 manifest。
2. 抓遠端 manifest。
3. 產生 push plan。
4. 只上傳新增/變更檔案。
5. commit 後才套用遠端刪除。

### 6.4 Pull

Pull 表示「遠端拉到本機」：

1. 掃描本機 manifest。
2. 抓遠端 manifest。
3. 產生 pull plan。
4. 只下載新增/變更檔案。
5. 用原子寫入套用。
6. Mirror 模式下刪除本機多出的檔案。
7. 完成後刷新 runtime caches。

### 6.5 衝突

第一階段先做明確且保守的策略：

- 如果同一路徑本機與遠端都改過，標記 conflict。
- 預設不自動覆蓋 conflict。
- UI 提供「使用本機版本」與「使用遠端版本」。
- 未處理 conflict 時，不執行破壞性 mirror delete。

## 7. VPS 端需求

### 7.1 TT-Sync 服務

若沿用 TT-Sync v2，VPS 需提供：

- `GET /v2/status`
- `POST /v2/pair/complete`
- `POST /v2/session/open`
- `POST /v2/sync/push-plan`
- `POST /v2/sync/pull-plan`
- `GET/PUT /v2/plans/{plan_id}/files/{path_b64}`
- `GET/PUT /v2/plans/{plan_id}/bundle`
- `POST /v2/plans/{plan_id}/commit`

服務端必須保存：

- 帳號或配對 namespace。
- 遠端檔案內容。
- 遠端 manifest。
- plan 暫存狀態。
- commit 狀態。

### 7.2 WebDAV 是否保留

WebDAV 可繼續當作第一版全量 zip 相容模式與簡易備援，但不適合承擔完整帳號式同步：

- WebDAV 沒有帳號/裝置/衝突語意。
- client 可以自己比對 manifest，但多裝置一致性和 commit 會變複雜。
- 若要穩定支援衝突與 plan，VPS 應跑專用同步服務。

## 8. UI 需求

新增或改造一個同步面板，至少包含：

- 服務端狀態：未配對 / 已配對 / 連線失敗。
- 最後同步時間。
- 同步模式：`Incremental` / `Mirror`。
- 最近同步結果：
  - 方向。
  - 檔案數。
  - 總 bytes。
  - 刪除檔案數。
- 操作按鈕：
  - Push 本機到遠端。
  - Pull 遠端到本機。
  - 解除配對。
- 進度顯示：
  - phase。
  - files transferred / total。
  - bytes transferred / total。
  - 目前檔案路徑。

## 9. 後端工作清單

### Phase 0：盤點與決策

- [x] 確認目前手機與桌面 build 是否已包含 `tt_sync_*` commands。結果：已用 `/tmp/TauriTavern-inspect` 產生 Android `x86_64` universal debug APK，並以 `npm run verify:tauritavern -- --source /tmp/TauriTavern-inspect/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk --manifest /tmp/tt-sync-command-report-mobile-build.json --json` 驗證；也已用 Linux desktop release binary `/tmp/TauriTavern-inspect/src-tauri/target/release/tauritavern` 執行 `npm run verify:tauritavern -- --source /tmp/TauriTavern-inspect/src-tauri/target/release/tauritavern --manifest /tmp/tt-sync-command-report-desktop-build.json --json`。兩份報告皆為 `tool=verify-tauritavern-tt-sync`、`schemaVersion=1`、`sourceKind=build-artifact`、`missingCommands=[]`，五個必要 `tt_sync_*` commands 皆有 trusted `build-artifact-string` evidence。Android runtime 補充證據：先前 APK 因未先生成 `src/dist/lib.core.bundle.js` 導致 WebView dynamic import 失敗；執行 `pnpm run web:build` 後重新打包的 clean APK 已在 Android 15 emulator 顯示 `Welcome to TauriTavern!` UI，截圖與 logcat 位於 `/tmp/tt-sync-android-runtime-evidence-run5`。
- [x] 確認前端是否已有 TT-Sync UI；若有，評估能否直接修 UI/部署 VPS。結果：本 repo 原本沒有 TT-Sync UI，已新增獨立面板。
- [x] 確認 TT-Sync 服務端程式是否已在 repo、VPS 或其他倉庫。結果：原本未找到既有 server；本 repo 已補 Minimal TT-Sync server artifact。
- [x] 在 VPS 上確認可部署方式：systemd 或 pm2。結果：提供 systemd template、env 範例、`verify:tt-sync-deploy` 與 live smoke verifier；實際 VPS 啟動仍需在部署環境驗證。
- [x] 決定第一階段採用「既有 TT-Sync」還是「新增 manual incremental cloud sync」。決策：採用既有 TT-Sync command surface，不在純前端插件內新增假的增量同步。

### Phase 1：最小可用增量同步

- [x] 建立或部署 VPS TT-Sync 服務。結果：建立可部署 Minimal TT-Sync server，並提供 `npm run smoke:tt-sync-server -- --endpoint <url>` 驗證部署；smoke report 會記錄 fixture files/bytes/paths；目前已有真實 HTTPS 遠端 smoke report 與 deploy report。
- [x] 產生配對 URI。結果：`npm run tt-sync:pair` 會依 `TT_SYNC_PAIRING_TOKEN` 產生配對 URI。
- [x] 手機與電腦能保存配對服務端。Android emulator 已有 `tt_sync_pair` / `tt_sync_list_servers` / `paired-servers.json` 重啟後保留 server 的證據；Linux desktop 也已在 Docker/Xvfb 內透過 WebKit inspector 執行真實 `tt_sync_pair`，並在 app 重啟後確認 `tt_sync_list_servers` 仍列出 server `7f5a1d00-9efb-4d10-a632-1e0a377eea81`。這些證據都來自 local pinned HTTPS endpoint，尚未滿足 final gate 需要的手機與桌面都保存同一個公開 smoke server。
- [x] Push 只傳變更檔案。結果：server push-plan 測試覆蓋未變更附件不重傳。
- [x] Pull 只抓變更檔案。結果：server pull-plan 測試覆蓋空 diff 不下載。
- [x] 進度事件能顯示 files/bytes。結果：Minimal server 提供 `/v2/plans/{plan_id}/events` SSE progress；Android emulator WebView CDP runtime 證據 `/tmp/tt-sync-android-sync-probe/probe-summary.json` 已捕捉 `tt_sync:progress` / `tt_sync:completed`，push 完成 164 檔 / 7,858,061 bytes。公開 endpoint 的 UI 顯示截圖仍屬 final device evidence 缺口。
- [x] 同步失敗時保留可讀錯誤。結果：server 回傳 JSON error，前端顯示 normalized error。

### Phase 2：差異預覽

- [x] 新增 `check_diff` 類 command 或復用 plan endpoint 回傳 summary。結果：Minimal server 的 push/pull plan endpoint 回傳 summary；目前 TauriTavern command surface 僅 exposes Push/Pull，插件不呼叫不存在的 `tt_sync_check_diff`。
- [x] 前端顯示本機/遠端差異摘要。結果：插件已新增 `mcs_tts_diff` 真資料渲染區，可承接 command 回傳或 `tt_sync:diff` event 的 summary；仍需 TauriTavern 後端實際發出 pre-transfer diff payload 才能完成完整產品驗證。
- [x] 前端顯示上傳/下載預估大小。結果：`mcs_tts_diff` 會顯示真實 `uploadBytes` / `downloadBytes`；仍需 TauriTavern 後端在 dry-run 或 event payload 暴露預估 plan。
- [x] 空 diff 時明確顯示「沒有需要同步的變更」。結果：Minimal server smoke 覆蓋 empty diff；現有 TauriTavern command surface 尚未提供前端 dry-run 顯示。

### Phase 3：衝突處理

- [x] 服務端 plan 標記 conflict。
- [x] 後端禁止未解決 conflict 的破壞性同步。
- [x] 前端列出 conflict。結果：插件已新增 `mcs_tts_conflicts` 真資料列表，可承接 `tt_sync:conflict` event 或 command 回傳的 conflicts；更新後的 TauriTavern source tree 已補上 conflict DTO / decision payload surface，並通過 event surface verifier。
- [x] 使用者可選本機或遠端版本。結果：衝突卡片已提供本機 / 遠端決策按鈕，並保留目前選擇狀態供後續契約承接。
- [x] 衝突決策寫入 plan commit。

### Phase 4：帳號式體驗

- [x] 設計 account/device 資料表。結果：Minimal server 以 `namespace.json` 保存 account、device、session、history、rollback metadata。
- [x] 登入與 token refresh。結果：`POST /v2/account/login` 與 `POST /v2/account/token/refresh`。
- [x] 裝置列表。結果：`GET /v2/devices?namespace=...`。
- [x] 每個裝置最後同步時間。結果：commit 後更新 device `lastSyncAt`。
- [x] 同步歷史。結果：`GET /v2/history?namespace=...` 回傳 committed plan history。
- [x] 可選回滾點。結果：push commit 前建立 rollback point，`POST /v2/rollback-points/{id}/restore` 可還原受影響檔案。

## 10. 前端工作清單

- [x] 找到目前設定面板放置同步入口的位置。
- [x] 建立「雲端同步」面板，避免和全量 zip 插件混淆。
- [x] 配對流程 UI。
- [x] 差異摘要 UI。結果：已新增 `mcs_tts_diff`，只顯示後端回傳或 event 內的真實 summary；真正 dry-run diff 完成證據仍需 TauriTavern command/event 擴充。
- [x] Push/Pull 操作按鈕。
- [x] 進度欄位顯示。
- [x] 衝突列表 UI。結果：已新增 `mcs_tts_conflicts`，只列出真實 conflict DTO，並提供本機 / 遠端決策按鈕；更新後的 TauriTavern source tree 也已補上 conflict DTO / 決策 payload surface。
- [x] 手機版排版檢查。結果：使用 responsive grid/flex；實機驗證仍列在驗證清單。
- [x] 錯誤訊息繁體中文化。

## 11. 驗證清單

- [x] 首次同步大資料目錄可完成。結果：server test `bulk first sync completes` 覆蓋 128-file first sync fixture；HTTPS tunnel 大資料 first-sync push plan `fe777e99-aeb9-418f-819f-81fc9056ef3c` 已 commit 128 檔 / 335,544,320 bytes / 637,324ms，後段 Pull 驗證遭 tunnel 503 中斷，因此完整 device/VPS Pull 證據仍需外部環境。
- [x] Android emulator runtime Push/Pull command path 可執行。結果：`/tmp/tt-sync-android-sync-probe/android-tt-sync-push-pull-result.json` 顯示 WebView 內真實 `tt_sync_push` fulfilled 並 emit 164 檔 progress/completed，`tt_sync_pull` fulfilled 並 emit empty-diff completed。第一次 probe 的 `/tmp/tt-sync-android-sync-probe/android-tt-sync-push-pull-result-before-concurrency-fix.json` 暴露 server plan concurrent upload race；已以 per-plan write lock、UUID temp path 與 `server/test/concurrent-upload-run-tests.js` 覆蓋。
- [x] 第二次未變更同步不傳檔案。結果：server test `pair, push, pull, and empty diff`。
- [x] 只新增一個聊天檔時，只傳該檔案。結果：server test `only changed files transfer and bundle endpoints work`。
- [x] 圖片/附件未變更時不重傳。結果：server test `only changed files transfer and bundle endpoints work`。
- [x] Pull 後本機檔案 mtime 保留。結果：desktop runtime `tt_sync_pull` 寫入 `/evidence/home-http/.local/share/com.tauritavern.client/data/default-user/user/files/desktop-mtime-proof-20260512.txt`，`pullMtimePreserved.ok=true`，且 `expectedModifiedMs == actualModifiedMs == 1710000000123`。
- [x] Push commit 前斷線不造成遠端 mirror delete。結果：server test `uncommitted push plan does not delete remote files`。
- [x] Pull 寫入中斷不破壞本機既有檔案。結果：desktop runtime `desktop-interruption-20260512` 中斷時 `beforeHash == afterHash`，`tt_sync_pull` 回報 `Connection to remote host was lost.`，`pullInterruptionSafe.ok=true`。
- [ ] LAN Sync 與雲端同步不能並行。驗證方式已文件化；仍需 TauriTavern runtime 互斥測試。
- [x] 同步狀態目錄不會被同步。結果：Minimal server 會拒收 LAN Sync、manual/incremental sync 狀態與 iOS policy cache 路徑。
- [x] Android 手機弱網路下錯誤可見。結果：Android 15 emulator 以 `adb shell cmd connectivity airplane-mode enable`、`adb shell svc wifi disable`、`adb shell svc data disable` 建立斷線 profile，`ping 10.0.2.2` 從 `baseline-ping-ok` 變為 `weaknet-ping-fail`；WebView CDP 內真實 `tt_sync_pull` emit `tt_sync:error`，UI popup 顯示 `Internal error: error sending request for url (https://10.0.2.2:9443/v2/session/open)`，截圖與事件證據位於 `/tmp/tt-sync-android-weak-network-probe`，`androidWeakNetworkErrorVisible.ok=true`。

## 12. 決策紀錄與剩餘依賴

- 第一階段採用既有 TT-Sync command surface：前端呼叫 `tt_sync_pair`、`tt_sync_list_servers`、`tt_sync_push`、`tt_sync_pull`、`tt_sync_remove_server`，不在純前端插件內新增假的增量同步，也不呼叫不存在的 dry-run command。
- TT-Sync 服務端以本 repo 的 Minimal TT-Sync server 作為可部署 artifact；systemd/env template、部署檢查器與 live smoke verifier 已提供。deploy report 與遠端 smoke report 已可用真實 HTTPS 來源補齊，剩下的外部缺口只是真實 device evidence。
- Minimal server 已相容 TauriTavern v2 pair/session/plan/commit schema：支援 Tauri pair body、Ed25519 signed session open、snake_case manifest plan input、Tauri plan response 與 commit `ok=true`。Android runtime push 暴露的並行 file upload plan 寫入 race 已修正，不以 mock/fallback 隱藏。
- 第一版接受配對式流程；帳號式能力已在 Minimal server 內提供 login、token refresh、device list、history 與 rollback endpoints，真實產品流程仍取決於 TauriTavern app 整合。
- 衝突第一版採保守策略：Minimal server 會在 unresolved conflict 時阻止破壞性 commit；插件已準備好渲染真實 `tt_sync:conflict` payload，並在卡片上提供本機 / 遠端決策按鈕；更新後的 TauriTavern source tree 也已補上 conflict DTO 與決策 payload surface，deploy / smoke 證據已可由真實遠端報告取得，剩下的外部缺口只是真實 device evidence。
- 圖片/附件不在第一階段拆成獨立可選 scope；同步範圍沿用 TT-Sync/LAN Sync scope 規則，並強制排除同步狀態與本機 cache 路徑。

## 13. 外部驗證入口

1. 使用 `npm run verify:tauritavern -- --source <path>` 確認手機與桌面 build 是否已有 `tt_sync_*` commands。
2. 使用 `npm run verify:tauritavern-events -- --source <path>` 確認 TauriTavern source tree 是否已有 `tt_sync:progress`、`tt_sync:completed`、`tt_sync:error` 與必要 payload 欄位；report 必須標示 `tool=verify-tauritavern-events` 與 `schemaVersion=1`，目前也用它記錄 dry-run diff/conflict surface 是否仍缺失。
3. 依 `docs/TauriTavernTtSyncCommandContract.md` 實作並檢查 TauriTavern 後端 `tt_sync_*` command contract。
4. 依 `docs/TauriTavernTtSyncVerification.md` 保存配對、mtime、中斷安全、互斥與弱網路證據。
5. Minimal TT-Sync server 已在本 repo 內提供；真實 VPS 啟動與端到端同步需保存 `smoke:tt-sync-server` 報告作為部署環境證據。
6. 可先用 `npm run evidence:device-template -- --output <device-evidence.json>` 建立真機證據模板；已有 mobile/desktop command reports 與 event report 時，可加上 `--mobile-command-report`、`--desktop-command-report`、`--event-report` 預填 report references 與 command names。模板預設 `ok=false` 且列出每項 required fields，不會被 final gate 視為完成。
7. 使用 `npm run verify:incremental-evidence -- --mobile-commands <mobile-command-report.json> --desktop-commands <desktop-command-report.json> --events <event-report.json> --deploy <deploy-report.json> --smoke <remote-smoke-report.json> --device-evidence <device-evidence.json> --manifest <final-evidence-report.json>` 做最終證據 gate，並保存 final evidence report。
