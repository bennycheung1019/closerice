# Closerice 食評筆記

朋友共享食評網頁應用程式，適合手機及電腦使用。新版網頁預計發佈於 [GitHub Pages](https://bennycheung1019.github.io/closerice/)；任何取得網址的人都可以查看、新增、修改及刪除同一份食評紀錄。

## 架構

- **GitHub Pages** 提供靜態 React 網頁、AI 操作說明及 OpenAPI 文件。
- **Cloudflare Worker** 提供 `/api`。D1 保存文字紀錄及掃描用量，R2 只保存用戶親自上載的食物相片。
- **Kimi API** 只在 Worker 內讀取訂單截圖或收據。`MOONSHOT_API_KEY` 是 Worker Secret，不會放進 GitHub 或瀏覽器。截圖不會儲存。掃描限制為每個 IP 每小時 20 次、全站每日 100 次。

GitHub Pages 只能提供靜態檔案，因此 API、共享資料庫及 Kimi 金鑰不能直接搬到 Pages。遷移後，資料表仍是 `reviews`、`photos` 和 `scan_usage`；要在新 D1 執行 `drizzle/0000_*.sql` 及 `drizzle/0001_*.sql`，再把現有資料匯入。原本的 Sites 資料庫不會隨 GitHub 原始碼自動轉移。

## 功能

- 手動填寫食評，或掃描訂單截圖／收據後核對表單。
- 必須選擇旺角或尖沙咀；圖片有明確分店或地址時會自動選擇。
- 記錄日期、餐廳、食物、評語、1 至 5 分評分、用餐方式、訂單編號及實付金額。
- 標記最愛或黑名單，並可搜尋和按地區、標記、用餐方式篩選。
- 只有用戶親自選擇食物相片時才上載；每筆最多 5 張 JPEG、PNG 或 WebP，每張不超過 8 MB。
- 具備圖片理解和網頁寫入能力的 AI 助手可按 `/ai/` 指示，直接把文字食評加入共享紀錄。

## 部署

需要 Node.js 22.13 或更新版本、GitHub Pages，以及用於 API 的 Cloudflare 帳戶。

1. 在 Cloudflare 建立 D1 資料庫 `closerice` 和 R2 bucket `closerice-photos`。
2. 複製 `worker/wrangler.example.toml` 至 `worker/wrangler.toml`，填入 D1 資料庫 ID。後者已加入 `.gitignore`。
3. 在新 D1 依次執行 `drizzle/0000_cynical_mister_fear.sql` 和 `drizzle/0001_dark_nuke.sql`，並匯入舊資料。
4. 用 Wrangler 把 `MOONSHOT_API_KEY` 設為 Worker Secret，再部署 `worker/index.ts`。不要把金鑰放進 GitHub Actions 變數或網頁。
5. 在 GitHub repository variables 設定 `CLOSERICE_API_BASE_URL` 為已部署 Worker 的 HTTPS origin，例如 `https://closerice-api.<account>.workers.dev`。
6. 在 repository 的 **Settings → Pages** 把發佈來源設為 **GitHub Actions**。推送 `main` 後，`.github/workflows/pages.yml` 會建置及發佈網頁。

本機檢查：

```sh
npm ci
npm run build
npm run build:pages  # 先設定 VITE_API_BASE_URL 為 Worker HTTPS origin
```

新版 Worker 重用原本的 API 路徑及資料庫 schema。原本的 ChatGPT Sites 網頁可以保留為備份，直到 GitHub Pages 和新 API 都經過測試。
