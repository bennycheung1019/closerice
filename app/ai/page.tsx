"use client";

import { useState } from "react";
import { pageAsset } from "../../lib/client-urls";

const guideUrl = typeof window === "undefined" ? "https://bunbun.space/closerice/llms.txt" : new URL(pageAsset("llms.txt"), window.location.origin).toString();
const prompt = `請幫我把這張食物訂單截圖的資料加入 Closerice。先閱讀 ${guideUrl}。只記錄截圖清楚顯示的資料；缺少完整日期、餐廳、食物或地區時先問我。評語和評分只使用我提供的內容。請先確認要存入哪個食評群組；若你能在我已登入的 Closerice 頁面使用 save_closerice_review 工具，資料齊全後直接儲存。不要上載或儲存訂單截圖。如果無法使用已登入頁面的工具，請給我一份可複製的草稿，不要索取我的登入 cookie。`;

export default function AiGuidePage() {
  const [copied, setCopied] = useState(false);

  async function copyPrompt() {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
  }

  return <main className="shell ai-guide">
    <header className="topbar"><a className="brand brand-link" href={pageAsset("")}><span className="brandmark" aria-hidden="true"><img src={pageAsset("favicon.svg?v=2")} alt="" /></span>Closerice</a><span className="account">共享食評</span></header>
    <section className="ai-intro"><p className="eyebrow">用 AI 新增食評</p><h1>截圖交給 AI，食評由你話事。</h1><p>登入後，在選好的群組中使用網站的圖片掃描，或讓可使用已登入頁面工具的 AI 幫你填寫。未授權的外部 AI 不能讀寫私人群組。</p></section>
    <section className="ai-prompt-card"><div className="ai-card-head"><h2>傳給 AI 的指示</h2><button className="button primary" onClick={() => void copyPrompt()}>{copied ? "已複製" : "複製指示"}</button></div><p>{prompt}</p></section>
    <section className="ai-notes"><h2>使用前知道</h2><ul><li>網站內建掃描使用 Kimi API，辨認圖片後不會儲存截圖。</li><li>每個群組有自己的成員權限；外部 AI 不能只靠網址寫入群組。</li><li>食物相片只在你親自選擇後才會上載。</li></ul><p><a href={guideUrl}>AI 操作說明</a> · <a href={pageAsset("openapi.json")}>API 規格</a> · <a href={pageAsset("")}>返回食評</a></p></section>
  </main>;
}
