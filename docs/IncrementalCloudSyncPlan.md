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

## 3.1 目前落地狀態（2026-05-11）

本 repo 是 GitHub 前端插件，不包含 `src-tauri` 後端、TT-Sync server、VPS 部署檔或手機 build pipeline。已完成 repo-local 交付：

- 新增獨立 `增量 TT-Sync` 面板，和既有全量 zip 交棒同步分離。
- UI 呼叫真實 `tt_sync_*` command 名稱：`tt_sync_pair`、`tt_sync_list_servers`、`tt_sync_check_diff`、`tt_sync_push`、`tt_sync_pull`、`tt_sync_unpair`。
- 顯示服務端狀態、差異摘要、Push/Pull 操作、進度欄位與 conflict 決策 UI。
- 缺少 TT-Sync 後端命令時顯示明確錯誤，不做 mock success 或靜默降級。
- 既有 WebDAV/S3 完整封存與資料遷移相容模式保留。
- 新增無第三方依賴的 Minimal TT-Sync server artifact，可保存 namespace、manifest、files、plans，並支援 per-file/bundle transfer 與 commit。

仍屬外部交付，不能在此 repo 內驗證完成：

- 手機/電腦 app build 是否已包含 `tt_sync_*` commands。
- Minimal TT-Sync server 已在 repo 內建立並以自動測試驗證；真實 VPS 上線與網路可達性仍需部署環境驗證。
- 真實端到端首同步、mtime 保留、mirror delete、弱網路與 LAN Sync 互斥驗證。

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
- 裝置名稱。
- 最後同步時間。
- 遠端差異摘要：
  - 待上傳檔案數與大小。
  - 待下載檔案數與大小。
  - 待刪除檔案數。
  - 衝突檔案數。
- 操作按鈕：
  - 檢查差異。
  - Push 本機到遠端。
  - Pull 遠端到本機。
  - 解除配對。
- 進度顯示：
  - phase。
  - files transferred / total。
  - bytes transferred / total。
  - 平均速度。
  - 目前檔案路徑。
- 衝突清單：
  - 路徑。
  - 本機大小/mtime。
  - 遠端大小/mtime。
  - 使用本機 / 使用遠端。

## 9. 後端工作清單

### Phase 0：盤點與決策

- [ ] 確認目前手機 build 是否已包含 `tt_sync_*` commands。
- [x] 確認前端是否已有 TT-Sync UI；若有，評估能否直接修 UI/部署 VPS。結果：本 repo 原本沒有 TT-Sync UI，已新增獨立面板。
- [x] 確認 TT-Sync 服務端程式是否已在 repo、VPS 或其他倉庫。結果：原本未找到既有 server；本 repo 已補 Minimal TT-Sync server artifact。
- [x] 在 VPS 上確認可部署方式：systemd 或 pm2。結果：提供 systemd template；實際 VPS 啟動仍需在部署環境驗證。
- [x] 決定第一階段採用「既有 TT-Sync」還是「新增 manual incremental cloud sync」。決策：採用既有 TT-Sync command surface，不在純前端插件內新增假的增量同步。

### Phase 1：最小可用增量同步

- [x] 建立或部署 VPS TT-Sync 服務。結果：建立可部署 Minimal TT-Sync server；尚未在真實 VPS 驗證。
- [x] 產生配對 URI。結果：`npm run tt-sync:pair` 會依 `TT_SYNC_PAIRING_TOKEN` 產生配對 URI。
- [ ] 手機與電腦能保存配對服務端。
- [x] Push 只傳變更檔案。結果：server push-plan 測試覆蓋未變更附件不重傳。
- [x] Pull 只抓變更檔案。結果：server pull-plan 測試覆蓋空 diff 不下載。
- [x] 進度事件能顯示 files/bytes。結果：Minimal server 提供 `/v2/plans/{plan_id}/events` SSE progress；前端已有 files/bytes 顯示欄位，真機 bridge 仍需裝置驗證。
- [x] 同步失敗時保留可讀錯誤。結果：server 回傳 JSON error，前端顯示 normalized error。

### Phase 2：差異預覽

- [x] 新增 `check_diff` 類 command 或復用 plan endpoint 回傳 summary。結果：Minimal server 的 push/pull plan endpoint 回傳 summary；前端預留 `tt_sync_check_diff` command。
- [x] 前端顯示本機/遠端差異摘要。
- [x] 前端顯示上傳/下載預估大小。
- [x] 空 diff 時明確顯示「沒有需要同步的變更」。

### Phase 3：衝突處理

- [x] 服務端 plan 標記 conflict。
- [x] 後端禁止未解決 conflict 的破壞性同步。
- [x] 前端列出 conflict。
- [x] 使用者可選本機或遠端版本。
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
- [x] 差異摘要 UI。
- [x] Push/Pull 操作按鈕。
- [x] 進度條與速度顯示。
- [x] 衝突列表 UI。
- [x] 手機版排版檢查。結果：使用 responsive grid/flex；實機驗證仍列在驗證清單。
- [x] 錯誤訊息繁體中文化。

## 11. 驗證清單

- [x] 首次同步大資料目錄可完成。結果：server test `bulk first sync completes` 覆蓋 128-file first sync fixture；真實 300MB device/VPS 測試仍需外部環境。
- [x] 第二次未變更同步不傳檔案。結果：server test `pair, push, pull, and empty diff`。
- [x] 只新增一個聊天檔時，只傳該檔案。結果：server test `only changed files transfer and bundle endpoints work`。
- [x] 圖片/附件未變更時不重傳。結果：server test `only changed files transfer and bundle endpoints work`。
- [ ] Pull 後本機檔案 mtime 保留。服務端已回傳 `X-TT-Sync-Modified-Ms` 與 `Last-Modified`；本機檔案 mtime 套用仍需 TauriTavern 後端/裝置驗證。
- [x] Push commit 前斷線不造成遠端 mirror delete。結果：server test `uncommitted push plan does not delete remote files`。
- [ ] Pull 寫入中斷不破壞本機既有檔案。
- [ ] LAN Sync 與雲端同步不能並行。
- [x] 同步狀態目錄不會被同步。結果：Minimal server 會拒收 LAN Sync、manual/incremental sync 狀態與 iOS policy cache 路徑。
- [ ] Android 手機弱網路下錯誤可見。

## 12. 開放問題

- 是否直接使用既有 TT-Sync v2 做第一階段？
- TT-Sync 服務端目前是否已有可部署實作？
- 第一版是否接受配對式，而不是帳號密碼登入？
- 衝突第一版要阻止同步，還是允許「整批以本機覆蓋」與「整批以遠端覆蓋」？
- 圖片/附件是否要提供可選同步 scope，讓使用者先只同步聊天與設定？

## 13. 建議下一步

1. 先確認手機 build 是否已有 `tt_sync_*` commands。
2. 找出 TT-Sync 服務端實作與部署方式。
3. 若 TT-Sync 服務端可用，優先部署到 VPS 做端到端測試。
4. 若服務端不可用，再補最小 TT-Sync server，而不是繼續擴充全量 zip 插件。
