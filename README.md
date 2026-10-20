# Closerice 食評筆記

主要網址：[bunbun.space/closerice](https://bunbun.space/closerice/)。用戶使用 Google 登入，可建立多個食評群組；每個群組的擁有人可邀請或移除成員、設定「可編輯／只可查看」權限，並在對方接受後轉讓擁有權。最愛和黑名單標記仍保留；每個群組亦可建立及篩選自訂標籤。

## 架構

- GitHub Pages 提供靜態 React 網頁；Cloudflare Worker 在 `bunbun.space/closerice/` 代理網頁，並在同一網域的 `/closerice/api/` 處理登入和資料請求。GitHub Pages 直連網址會導向主要網址。
- Google OpenID Connect 驗證身分。Worker 用 HttpOnly、Secure、SameSite=Lax cookie 保存網站工作階段，並在每次讀取帳戶時把有效工作階段續期至 400 日；瀏覽器可能提早清除 Cookie。Google client secret 只存於 Worker Secret。應用程式只要求 `openid email profile`，以 Google `sub` 識別用戶。
- Cloudflare D1 保存用戶、群組、成員權限、邀請、食評、標籤和食物相片。每次讀寫都由 Worker 核對用戶對指定群組的權限。圖片掃描使用 Kimi，截圖不會儲存；食物相片只在用戶自行選擇後才上載。
- 根網址 `bunbun.space/` 回傳 404，其他子網域不受影響。公開的 workers.dev API 不提供私人群組資料。

## 權限

| 角色 | 權限 |
| --- | --- |
| 擁有人 | 讀寫食評、管理成員和邀請、轉讓擁有權 |
| 可編輯 | 讀寫食評和相片、建立標籤；可刪除自己建立的標籤 |
| 只可查看 | 讀取和篩選食評、查看相片 |

邀請連結只對指定 Google 電郵有效，7 日後過期，用過即失效。擁有權轉讓亦需受邀成員親自接受。每個用戶可以在不同群組擁有不同角色。

## 部署或升級

需要 Node.js 22.13 或更新版本、GitHub Pages、Cloudflare Worker 和 D1、Google Cloud OAuth Web client。部署前先備份現有 D1 資料。

1. 在 Google Cloud 建立 OAuth Web client，授權重新導向網址為 `https://bunbun.space/closerice/api/auth/google/callback`。用戶類型需支援受邀的外部 Google 帳戶。
2. 複製 `worker/wrangler.example.toml` 至忽略版本控制的 `worker/wrangler.toml`，填入 D1 ID 和 `GOOGLE_CLIENT_ID`。現有 Cloudflare `bunbun.space/*` Worker route 繼續使用。
3. 在 Worker 設定 `GOOGLE_CLIENT_SECRET` 和 `INITIAL_OWNER_EMAIL` 兩個 Secret。後者填入應取得現有「Home」食評群組的 Google 電郵；第一次以該電郵登入時會認領群組。原有 `MOONSHOT_API_KEY` Secret 繼續供圖片掃描使用。不要把 Secret 放進 GitHub 或網頁。
4. 對現有 D1 依序執行尚未套用的遷移至 `drizzle/0004_quiet_gauntlet.sql`；新資料庫則依序執行 `drizzle/0000` 至 `0004`。`0004` 會把舊評語和星級搬到各人的獨立食評，並保留用餐紀錄和相片。先完成遷移，再部署新版 Worker 和網頁。使用 Wrangler 時可執行 `npx wrangler d1 migrations apply closerice --remote --config worker/wrangler.toml`。
5. 部署 Worker，然後推送網頁至 GitHub `main`。`.github/workflows/pages.yml` 會建置並發佈網頁；它設定 API base 為 `https://bunbun.space/closerice`。確認 Google 登入、舊食評、相片、不同群組權限和邀請連結正常運作。

本機檢查：

```sh
npm ci
npx tsc --noEmit
npx drizzle-kit check
VITE_API_BASE_URL=https://bunbun.space/closerice npm run build:pages
```

已登入網頁的 AI 工具可在當前可編輯群組儲存食評。外部 AI 不能只憑公開網址讀寫私人群組；不要向 AI 聊天傳送登入 cookie。
