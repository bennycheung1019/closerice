# Closerice 食評筆記

私人食評網頁應用程式，適合手機及電腦使用。網址：[closerice.benny-cheung.chatgpt.site](https://closerice.benny-cheung.chatgpt.site)。網站只向擁有人開放，使用 ChatGPT 帳戶登入。

## 功能

- 記錄用餐日期、餐廳、食物、評語、1 至 5 分評分、用餐方式、訂單編號及實付金額。
- 標記最愛或黑名單，並可搜尋和篩選紀錄。
- 每筆紀錄可上載最多 5 張 JPEG、PNG 或 WebP 相片，每張不超過 8 MB。
- 在 ChatGPT 桌面版的內建瀏覽器開啟網站後，可把訂單截圖或收據傳到聊天，請 ChatGPT「幫我填入 Closerice 草稿」。AI 只把可見資料填入表單；評分和食評由用戶自己填寫，核對後才儲存。

網站使用 Cloudflare D1 儲存紀錄，R2 儲存相片。API 以 ChatGPT 用戶 ID 限定每位用戶只能存取自己的資料。

## 本機開發

需要 Node.js 22.13 或更新版本。此程式以 ChatGPT Sites 的 vinext 環境建置。

```sh
npm ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_cynical_mister_fear.sql
npm run dev
```

本機預覽可前往 `/signin-with-chatgpt?return_to=/` 使用開發模式模擬登入。正式網站由 Sites 處理登入、資料庫遷移和部署。
