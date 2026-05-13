# 手動雲端同步

這是 TauriTavern 的手動雲端交棒同步插件。插件包含兩個入口：

- `增量 TT-Sync`：連到 TauriTavern 既有 TT-Sync v2 後端命令，走配對式增量同步。
- `完整封存交棒同步`：使用既有 `cloud_sync_*` 原生命令；沒有這些命令時，明確改用資料遷移相容模式支援手機舊版 app。

支援：

- WebDAV：Basic 帳密或 Bearer Token。
- S3 相容儲存：含 Path Style 模式。
- TT-Sync 配對、服務端列表、Push、Pull、解除配對入口。
- TT-Sync 帳號登入、短效配對 URI 產生、裝置列表與同步歷史入口。
- 增量同步進度欄位：phase、檔案數、bytes、目前檔案。
- 增量同步完成摘要：方向、檔案數、bytes、刪除檔案。
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
- `tt_sync_push`
- `tt_sync_pull`
- `tt_sync_remove_server`

插件會直接呼叫上述命令，不會模擬成功；缺少命令時會顯示後端不支援的錯誤。

可用以下命令檢查 TauriTavern source tree、APK/AAB 或桌面 build 是否真的包含這些命令：

```bash
npm run verify:tauritavern -- --source /path/to/TauriTavern --manifest /tmp/tt-sync-command-report.json
```

verifier 會在 JSON 報告中寫入 `tool=verify-tauritavern-tt-sync`、`schemaVersion=1` 與 `sourceKind`。`sourceKind=build-artifact` 時只接受可信 build artifact 內的 command 字串；`sourceKind=source-tree` 或 `source-file` 時，command 必須同時具備 Tauri command 宣告與 handler 註冊。README、測試 fixture 或一般文件中的字串會被列為 ignored，不會讓報告通過。

可用以下命令檢查 TauriTavern source tree 是否暴露實際 TT-Sync event surface 與 payload 欄位：

```bash
npm run verify:tauritavern-events -- --source /path/to/TauriTavern --manifest /tmp/tt-sync-event-report.json
```

event verifier 會在 JSON 報告中寫入 `tool=verify-tauritavern-events` 與 `schemaVersion=1`，並要求 `tt_sync:progress`、`tt_sync:completed`、`tt_sync:error` 與 progress/completed payload 欄位存在，且在 `diffConflictSurface` 中明確回報是否已有 dry-run diff 或 conflict DTO surface；目前上游沒有這些 diff/conflict surface，不能把它們當成已完成。

完整的真機與 VPS 驗證清單請看：[docs/TauriTavernTtSyncVerification.md](docs/TauriTavernTtSyncVerification.md)。
TauriTavern 後端需要實作的 `tt_sync_*` command contract 請看：[docs/TauriTavernTtSyncCommandContract.md](docs/TauriTavernTtSyncCommandContract.md)。

完整 mirror 封存同步需要 TauriTavern 版本提供下列原生命令：

- `cloud_sync_get_config`
- `cloud_sync_save_config`
- `cloud_sync_list_queue`
- `cloud_sync_upload_now`
- `cloud_sync_download_now`
- `cloud_sync_delete_remote_item`

如果這些命令不存在，插件會在畫面上明確切到資料遷移相容模式，不會模擬成功，也不會靜默降級。

## 增量 TT-Sync 使用方式

1. 在 VPS 或同網路主機啟動 TT-Sync v2 服務，並讓手機與電腦都能連到同一個 HTTPS 公開 URL。
2. 設定同一組服務端配對 token，或設定帳號登入環境變數後由插件產生短效配對 URI。
3. 在插件的 `增量 TT-Sync` 面板登入帳號並產生配對 URI，或手動填入既有配對 URI 後按「配對」。
4. 按「刷新服務端」確認已保存的服務端；手機與電腦都要各自配對一次。
5. 選擇 `Incremental` 或 `Mirror` 同步模式。
6. 要把目前裝置的變更送上服務端時按 `Push`；要把服務端變更套到目前裝置時按 `Pull`。

目前上游 TauriTavern command surface 沒有獨立 dry-run diff command；插件不呼叫不存在的 `tt_sync_check_diff`，也不會用 fake summary 模擬成功。這個插件只負責 UI 與 command 呼叫；manifest 掃描、plan、原子寫入、mtime 保留、mirror delete、mutex 與 commit 必須由 TauriTavern TT-Sync 後端實作。

## Minimal TT-Sync Server

本 repo 內含一個無第三方依賴的最小 TT-Sync v2-compatible server，供尚未取得上游 TT-Sync server artifact 時部署測試：

```bash
npm install
TT_SYNC_PAIRING_TOKEN='change-me' npm run tt-sync:server
TT_SYNC_PAIRING_TOKEN='change-me' npm run tt-sync:pair
```

本機快速測試時，上面會啟動 `http://127.0.0.1:8787`，並印出 Minimal smoke client 使用的 `tt-sync://pair?...` URI。這個 URI 可給本 repo 的 smoke verifier 使用；TauriTavern App 插件面板要填的是 TauriTavern 後端認得的 `tauritavern://tt-sync/pair?...` URI，格式如下：

```text
tauritavern://tt-sync/pair?v=2&url=https%3A%2F%2Fsync.example.com&token=<pairing-token>&exp=<unix-ms>&spki=<base64url-spki-pin>
```

欄位含義：

- `url`：TT-Sync server 的公開 HTTPS URL，必須和 `TT_SYNC_PUBLIC_URL`、smoke verifier 的 `--endpoint` 一致。
- `token`：服務端 `TT_SYNC_PAIRING_TOKEN`，用來完成一次配對；請用足夠長的隨機字串。
- `exp`：配對 URI 過期時間，Unix milliseconds；TauriTavern 後端會拒絕過期 URI。
- `spki`：HTTPS 憑證的 SPKI SHA-256 base64url pin；TauriTavern 用它確認連到的是預期服務端。

產生 App 配對 URI 的一個可重複範例：

```bash
export TT_SYNC_PUBLIC_URL='https://sync.example.com'
export TT_SYNC_PAIRING_TOKEN="$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=')"

host="$(node -e 'console.log(new URL(process.env.TT_SYNC_PUBLIC_URL).hostname)')"
port="$(node -e 'const url = new URL(process.env.TT_SYNC_PUBLIC_URL); console.log(url.port || "443")')"
spki="$(
    echo | openssl s_client -servername "$host" -connect "$host:$port" 2>/dev/null \
        | openssl x509 -pubkey -noout \
        | openssl pkey -pubin -outform der \
        | openssl dgst -sha256 -binary \
        | base64 | tr '+/' '-_' | tr -d '='
)"

SPKI="$spki" node -e '
const url = new URL("tauritavern://tt-sync/pair");
url.searchParams.set("v", "2");
url.searchParams.set("url", process.env.TT_SYNC_PUBLIC_URL);
url.searchParams.set("token", process.env.TT_SYNC_PAIRING_TOKEN);
url.searchParams.set("exp", String(Date.now() + 10 * 60 * 1000));
url.searchParams.set("spki", process.env.SPKI);
console.log(url.toString());
'
```

同一組 `TT_SYNC_PAIRING_TOKEN` 也要放進服務端環境變數；否則 App 端送到 `/v2/pair/complete?token=...` 時會被服務端拒絕。配對完成後，TauriTavern 後端會保存服務端 ID、URL、裝置 key 與授權資訊，後續 `Push` / `Pull` 不再靠前端 localStorage 保存同步憑證。

在手機與電腦各打開一次插件，將同一條 `tauritavern://tt-sync/pair?...` 貼到 `配對 URI` 後按「配對」。配對成功後按「刷新服務端」，下拉選單應看到同一個服務端 URL。之後其中一台按 `Push` 上傳變更，另一台按 `Pull` 下載變更。

如果只是要驗證 Minimal server 本身，不需要 TauriTavern App，也可以直接用 smoke verifier 走 `tt-sync://pair?...` 流程：

```bash
npm run smoke:tt-sync-server -- --endpoint https://sync.example.com --pairing-token "$TT_SYNC_PAIRING_TOKEN" --manifest /tmp/tt-sync-smoke-report.json
```

若要用 PM2 跑服務端，可在部署目錄設定 env 後啟動 Node 入口：

```bash
TT_SYNC_DATA_DIR=/var/lib/manual-cloud-tt-sync \
TT_SYNC_HOST=127.0.0.1 \
TT_SYNC_PORT=8787 \
TT_SYNC_PUBLIC_URL=https://sync.example.com \
TT_SYNC_PAIRING_TOKEN='<strong-random-token>' \
pm2 start server/tt-sync-server.js --name manual-cloud-tt-sync -- serve
```

PM2 只負責把服務掛起來；手機通常不能直接連 VPS 的 `127.0.0.1:8787`。請在外層用 Nginx、Caddy、Cloudflare Tunnel 或 Tailscale Serve 提供 HTTPS，並把公開 URL 寫入 `TT_SYNC_PUBLIC_URL`。

主要環境變數：

- `TT_SYNC_DATA_DIR`：資料目錄，預設 `.tt-sync-data`
- `TT_SYNC_HOST`：監聽位址，預設 `127.0.0.1`
- `TT_SYNC_PORT`：監聽 port，預設 `8787`
- `TT_SYNC_PUBLIC_URL`：產生配對 URI 時使用的公開 URL；真機使用時應是 HTTPS
- `TT_SYNC_PAIRING_TOKEN`：配對必填 token
- `TT_SYNC_ACCOUNT_USERNAME`：帳號登入使用者名稱
- `TT_SYNC_ACCOUNT_PASSWORD`：帳號登入密碼

帳號式同步服務的最小流程：

1. 在 Minimal server env 設定 `TT_SYNC_PUBLIC_URL`、`TT_SYNC_ACCOUNT_USERNAME`、`TT_SYNC_ACCOUNT_PASSWORD` 與 `TT_SYNC_PAIRING_TOKEN`。
2. 在插件 `帳號式同步服務` 區塊填入服務端 URL、namespace、帳號、密碼與 SPKI pin。
3. 按「登入」取得 access/refresh token；token 只存在目前插件頁面記憶體，不寫入 repo source。
4. 按「產生配對 URI」呼叫 `POST /v2/account/pairing-uri`，服務端會建立 10 分鐘短效一次性 pairing token，並回傳 `tauritavern://tt-sync/pair?...` URI。
5. 插件會把這條 URI 填入既有 `配對 URI` 欄位，再按「配對」走 TauriTavern 的 `tt_sync_pair`，由 App 後端保存 server id、裝置 key 與同步授權。
6. 「刷新帳號資料」會查 `/v2/devices` 與 `/v2/history`，用來確認裝置最後同步時間與同步歷史。

Minimal server 會在 `/v2/plans/{plan_id}/events` 提供 SSE progress event，內容包含 phase、files、bytes 與目前路徑；檔案下載會回傳 `X-TT-Sync-Modified-Ms`，讓 TauriTavern 後端可保留 mtime。服務端契約與儲存格式請看：[docs/MinimalTtSyncServer.md](docs/MinimalTtSyncServer.md)。systemd 範本在：[deploy/systemd/manual-cloud-tt-sync.service](deploy/systemd/manual-cloud-tt-sync.service)，env 範例在：[deploy/systemd/manual-cloud-tt-sync.env.example](deploy/systemd/manual-cloud-tt-sync.env.example)。

部署前可檢查 systemd unit 與 env 檔；repo 內範例 env 需要明確允許 placeholder，真實 VPS env 不應使用 `--allow-placeholders`：

```bash
npm run verify:tt-sync-deploy -- --allow-placeholders
```

部署後可用 live smoke verifier 對實際端點跑 status、pair、session、Push、progress、Pull、mtime header、empty diff、device/history 檢查：

```bash
npm run smoke:tt-sync-server -- --endpoint https://sync.example.com --pairing-token "$TT_SYNC_PAIRING_TOKEN" --manifest /tmp/tt-sync-smoke-report.json
```

部署驗證若要覆蓋大批量首次同步，可加入 `--bulk-files <count>` 與 `--bulk-file-bytes <bytes>`；報告會保存 fixture file count、total bytes 與每個 smoke path。遠端模式會在所選 namespace 留下一組唯一命名的 smoke 檔案作為部署證據，不會自動刪除其他遠端資料。本機開發可明確使用 `--local` 啟動真實 minimal server 做同一套 smoke。

收齊 TauriTavern mobile/desktop build command reports、TauriTavern event surface report、真實 VPS deploy report、遠端 smoke report 與真機 device evidence 後，可用 final evidence gate 檢查是否足以關閉增量同步計畫：

```bash
npm run verify:incremental-evidence -- --mobile-commands /tmp/tt-sync-mobile-command-report.json --desktop-commands /tmp/tt-sync-desktop-command-report.json --events /tmp/tt-sync-event-report.json --deploy /tmp/tt-sync-deploy-report.json --smoke /tmp/tt-sync-smoke-report.json --device-evidence /tmp/tt-sync-device-evidence.json --manifest /tmp/tt-sync-final-evidence-report.json
```

final evidence gate 會確認 mobile 與 desktop command reports 都標示 `tool=verify-tauritavern-tt-sync` 與 `schemaVersion=1`，來自 `sourceKind=build-artifact` 的實際 build，並包含可解析 timestamp 的 `scannedAt`、source、scanned file 與 trusted command evidence；source-tree command report 只能作為整合前檢查，不能關閉 final evidence。event surface report 必須標示 `tool=verify-tauritavern-events` 與 `schemaVersion=1`，來自 `sourceKind=source-tree` 的 TauriTavern source tree，並有可解析 timestamp 的 `scannedAt`、source、scanned file、空的 `missingEvents` / `missingPayloadFields`，且包含 `tt_sync:progress`、`tt_sync:completed`、`tt_sync:error` 與 `diffConflictSurface` 內的 `preTransferDiffEvent`、`conflictEvent`、`conflictDto`、`conflictDecisionPayload`；device evidence 內的 mobile/desktop command report references 與 event surface report reference consistency 必須和頂層 reports 一致，且包含 tool/schemaVersion/source/scannedAt/sourceKind，`commandContractVerified.contract.commands` 覆蓋全部 `tt_sync_*` commands；deploy report 必須標示 `tool=verify-tt-sync-deploy` 與 `schemaVersion=1`，是不允許 placeholder 且 service/env path 為非範例絕對路徑的真實 env 模式、所有 deploy checks 都有 name/detail 且 `ok=true`，public URL、遠端 smoke endpoint 與 device evidence server URL 都必須使用 HTTPS，不能使用 placeholder or reserved domains，也不能包含 credentials/query/fragment，並且 public URL 與遠端 smoke endpoint 一致，遠端 smoke report 必須標示 `tool=smoke-tt-sync-server` 與 `schemaVersion=1`，且有可解析 timestamp 的 `completedAt`、`smokePath`、`deviceId`、`serverId`、`planIds`、`status.version`、fixture files/bytes/paths 並要求所有 smoke checks 都有 name/detail 且 `ok=true`，device evidence 有可解析 timestamp 的 `testedAt`、Android/desktop `deviceId` 與每個真機檢查要求的結構化欄位，large sync evidence 必須達到至少 300MiB，pairing evidence 必須包含 phone/desktop 重啟後保存的 server id 與 server URL，且 saved server id 必須和 smoke `serverId` 一致，progress evidence 必須包含 files/bytes/current path，mutex evidence 必須覆蓋 LAN 進行中阻擋雲端同步與雲端同步進行中阻擋 LAN，Android 弱網路 evidence 必須包含 operation、error code 與可解析 timestamp 的截取時間，Pull mtime evidence 必須包含檔案 path 且 expected/actual 必須相等，中斷 evidence 必須包含 path/runId 且前後 hash 必須相等，且 device evidence 的 server URL 與遠端 smoke endpoint 一致。

device evidence 可先用模板產生；模板內所有檢查預設 `ok=false`，不會通過 final evidence gate：

```bash
npm run evidence:device-template -- --output /tmp/tt-sync-device-evidence.json
```

若已經有 command/event reports，可在產生模板時預填 report references 與 command names；模板仍保持 `ok=false`，不會被視為完成證據：

```bash
npm run evidence:device-template -- --output /tmp/tt-sync-device-evidence.json --mobile-command-report /tmp/tt-sync-mobile-command-report.json --desktop-command-report /tmp/tt-sync-desktop-command-report.json --event-report /tmp/tt-sync-event-report.json
```

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
