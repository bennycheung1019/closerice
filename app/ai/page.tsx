"use client";

import { useState } from "react";
import { pageAsset } from "../../lib/client-urls";

const guideUrl = typeof window === "undefined" ? "https://closerice.benny-cheung.chatgpt.site/llms.txt" : new URL(pageAsset("llms.txt"), window.location.origin).toString();
const prompt = `請幫我把這張食物訂單截圖的資料加入 Closerice 共享食評。先閱讀 ${guideUrl}，按當中的 API 說明操作。只記錄截圖清楚顯示的資料；缺少完整日期或無法確認餐廳在旺角還是尖沙咀，就問我。評語和 1–5 分評分由我提供，沒有的話先問我。資料齊全後，直接用一次 JSON 請求儲存紀錄；不要另開草稿，也不要上載或儲存訂單截圖。只有我親自在網站選擇食物相片時才附相片。如果你不能發送網頁寫入請求，請告訴我並給我一份可複製的草稿。`;

export default function AiGuidePage() {
  const [copied, setCopied] = useState(false);

  async function copyPrompt() {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
  }

  return <main className="shell ai-guide">
    <header className="topbar"><a className="brand brand-link" href={pageAsset("")}><span className="brandmark" aria-hidden="true">◒</span>Closerice</a><span className="account">朋友共享食評</span></header>
    <section className="ai-intro"><p className="eyebrow">用 AI 新增食評</p><h1>截圖交給 AI，食評由你話事。</h1><p>把下面的指示和訂單截圖傳給能讀圖片、發送網頁請求的 AI 助手。它會問你缺少的資料，然後直接儲存文字紀錄。訂單截圖不會上載到 Closerice。</p></section>
    <section className="ai-prompt-card"><div className="ai-card-head"><h2>傳給 AI 的指示</h2><button className="button primary" onClick={() => void copyPrompt()}>{copied ? "已複製" : "複製指示"}</button></div><p>{prompt}</p></section>
    <section className="ai-notes"><h2>使用前知道</h2><ul><li>這個方式由你選用的 AI 助手讀取圖片；網站內建掃描則使用 Kimi API，由網站擁有人支付其用量。</li><li>AI 必須能發送網頁寫入請求；只能瀏覽網頁的助手可以準備草稿，但不能直接儲存。</li><li>訂單截圖只用來讀取資料，不會附在食評。食物相片可由你在網站表單親自選擇上載。</li></ul><p><a href={guideUrl}>AI 操作說明</a> · <a href={pageAsset("openapi.json")}>API 規格</a> · <a href={pageAsset("")}>返回食評</a></p></section>
  </main>;
}
