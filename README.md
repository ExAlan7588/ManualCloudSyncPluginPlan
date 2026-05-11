# 手動雲端同步

這是 TauriTavern 的手動雲端交棒同步插件。插件包含兩個入口：

- `增量 TT-Sync`：連到 TauriTavern 既有 TT-Sync v2 後端命令，走配對式增量同步。
- `完整封存交棒同步`：使用既有 `cloud_sync_*` 原生命令；沒有這些命令時，明確改用資料遷移相容模式支援手機舊版 app。

支援：

- WebDAV：Basic 帳密或 Bearer Token。
- S3 相容儲存：含 Path Style 模式。
- TT-Sync 配對、服務端列表、差異摘要、Push、Pull、解除配對入口。
- 增量同步進度欄位：phase、檔案數、bytes、平均速度、目前檔案。
- 增量同步衝突清單與「使用本機 / 使用遠端」決策 UI。
- 手動上傳完整資料封存。
- 手動下載遠端佇列中最舊的一包。
- 顯示遠端佇列並手動刪除遠端項目。
- 舊版手機 app 相容模式：WebDAV 佇列、選擇 zip 上傳、下載後用資料遷移匯入。

## 安裝

在 TauriTavern 的 Extensions 面板安裝這個 GitHub repo：

```text
https://github.com/ExAlan7588/ManualCloudSyncPluginPlan
```

酒館的 GitHub 擴充安裝器會從 repo 根目錄讀取 `manifest.json`，所以本 repo 已把 `manifest.json`、`index.js`、`settings.html`、`style.css` 放在根目錄。

## 必要條件

這個 repo 只包含前端插件。增量 TT-Sync 需要 TauriTavern 版本提供下列原生命令：

- `tt_sync_pair`
- `tt_sync_list_servers`
- `tt_sync_check_diff`
- `tt_sync_push`
- `tt_sync_pull`
- `tt_sync_unpair`

插件會直接呼叫上述命令，不會模擬成功；缺少命令時會顯示後端不支援的錯誤。

完整 mirror 封存同步需要 TauriTavern 版本提供下列原生命令：

- `cloud_sync_get_config`
- `cloud_sync_save_config`
- `cloud_sync_list_queue`
- `cloud_sync_upload_now`
- `cloud_sync_download_now`
- `cloud_sync_delete_remote_item`

如果這些命令不存在，插件會在畫面上明確切到資料遷移相容模式，不會模擬成功，也不會靜默降級。

## 增量 TT-Sync 使用方式

1. 在 VPS 或同網路主機啟動 TT-Sync v2 服務。
2. 取得服務端配對 URI。
3. 在 `增量 TT-Sync` 面板填入配對 URI 與裝置名稱後按「配對」。
4. 按「刷新服務端」確認已保存的服務端。
5. 按「檢查差異」檢視待上傳、待下載、待刪除與衝突摘要。
6. 沒有未處理衝突時，可按 `Push` 或 `Pull`。

如果後端回傳 conflict 清單，面板會要求每個路徑選擇「使用本機」或「使用遠端」後才允許 Push/Pull。這個插件只負責 UI 與 command 呼叫；manifest 掃描、plan、原子寫入、mtime 保留、mirror delete 與 commit 必須由 TauriTavern TT-Sync 後端實作。

## Minimal TT-Sync Server

本 repo 內含一個無第三方依賴的最小 TT-Sync v2-compatible server，供尚未取得上游 TT-Sync server artifact 時部署測試：

```bash
npm install
TT_SYNC_PAIRING_TOKEN='change-me' npm run tt-sync:server
TT_SYNC_PAIRING_TOKEN='change-me' npm run tt-sync:pair
```

主要環境變數：

- `TT_SYNC_DATA_DIR`：資料目錄，預設 `.tt-sync-data`
- `TT_SYNC_HOST`：監聽位址，預設 `127.0.0.1`
- `TT_SYNC_PORT`：監聽 port，預設 `8787`
- `TT_SYNC_PUBLIC_URL`：產生配對 URI 時使用的公開 URL
- `TT_SYNC_PAIRING_TOKEN`：配對必填 token

服務端契約與儲存格式請看：[docs/MinimalTtSyncServer.md](docs/MinimalTtSyncServer.md)。systemd 範本在：[deploy/systemd/manual-cloud-tt-sync.service](deploy/systemd/manual-cloud-tt-sync.service)。

## WebDAV 使用方式

第一次設定時，預設就是 WebDAV Basic，只需要先填：

- 端點 URL：你的 WebDAV 目錄 URL，例如 `https://example.com/dav/tauritavern/`
- 使用者名稱：WebDAV Basic 帳號
- 密碼：WebDAV Basic 密碼

進階設定中可調整：

- 遠端路徑前綴：預設 `manual-cloud-sync`
- 裝置 ID：留空時會在儲存後由後端自動生成並回填
- WebDAV 驗證方式：可改用 Bearer Token

本機開發時可按「使用本機 WebDAV 開發服務」，插件會套入：

- 端點 URL：`http://127.0.0.1:1900/`
- 遠端路徑前綴：`manual-cloud-sync`
- 驗證方式：Basic 帳密
- 使用者名稱：`webdav`

按「儲存」後，可用「立即上傳」產生遠端同步包；另一台裝置安裝同一插件並填同一組 WebDAV 設定後，按「重新整理佇列」再按「下載最舊項目」即可套用。下載會以 mirror 語意覆蓋本機資料。

## 手機舊版 app 相容模式

如果手機上的 TauriTavern 沒有 `cloud_sync_*` 後端命令，GitHub 插件仍可使用 WebDAV，但行為改成：

- 設定儲存在該裝置的前端 localStorage。
- 「匯出到檔案」會呼叫既有資料遷移匯出，讓 Android/iOS/桌面用原生方式保存 zip。
- 「選擇 zip 上傳」會把你選到的 zip 上傳到 WebDAV，並建立 `sync-MMDDHHMMSS.json` manifest。
- 「下載最舊項目」會從 WebDAV 下載 zip、驗證大小與 SHA-256，然後走既有資料遷移匯入。
- WebDAV zip 上傳與下載會顯示百分比、已傳輸大小與平均速度。
- 相容模式匯入是資料遷移語意：合併並覆蓋同路徑檔案，不會刪除本機多出的檔案；完整 mirror 仍需要原生 `cloud_sync_*` 後端。

相容模式的 WebDAV 伺服器必須允許瀏覽器/WebView 直連 CORS，至少要允許 `OPTIONS, GET, PUT, DELETE, PROPFIND, HEAD` 與 `Authorization, Content-Type, Depth` headers。

Android release 版若封鎖 `http://100.x.x.x` 這類明文 Tailscale 端點，請改用 HTTPS WebDAV 端點，例如反向代理或已啟用的 Tailscale Serve。

## S3 使用方式

將同步後端切換成 `S3` 後，S3 欄位才會展開。此時需要填：

- 端點 URL
- Bucket
- Region
- Access Key
- Secret Key
- Session Token，可留空
- Path Style，依你的 S3 相容服務設定決定

## 同步模型

每次上傳都會建立一組 `sync-MMDDHHMMSS.zip` 和同名 `.json` manifest。下載時會處理最舊的一包，先驗證大小與 SHA-256，再以 mirror 語意套用本機資料。匯入成功後才刪除遠端 zip 與 manifest。

## 後續計畫

增量同步與 VPS 端後續工作請看：[docs/IncrementalCloudSyncPlan.md](docs/IncrementalCloudSyncPlan.md)。
