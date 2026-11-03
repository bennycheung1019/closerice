"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Share, Smartphone } from "lucide-react";

type Platform = "iphone" | "android";

export default function HomeScreenTip() {
  const [detected, setDetected] = useState<Platform | null>(null);
  const [selected, setSelected] = useState<Platform>("iphone");

  useEffect(() => {
    const agent = navigator.userAgent;
    const platform = /iPhone|iPad|iPod/i.test(agent) || (/Macintosh/i.test(agent) && navigator.maxTouchPoints > 1)
      ? "iphone" : /Android/i.test(agent) ? "android" : null;
    setDetected(platform);
    if (platform) setSelected(platform);
  }, []);

  const platform = detected ?? selected;
  return <details className="settings-card home-screen-tip">
    <summary className="home-screen-tip-heading"><span className="home-screen-tip-icon"><Smartphone size={21} aria-hidden="true" /></span><span className="home-screen-tip-title">加入手機主畫面</span><ChevronDown className="home-screen-tip-chevron" size={19} aria-hidden="true" /></summary>
    <div className="home-screen-tip-content">
    {!detected && <div className="home-screen-platforms" role="tablist" aria-label="選擇手機系統">
      {(["iphone", "android"] as const).map((item) => <button key={item} id={`home-screen-tab-${item}`} type="button" role="tab" aria-selected={selected === item} aria-controls="home-screen-instructions" tabIndex={selected === item ? 0 : -1} onClick={() => setSelected(item)} onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === "Home" ? "iphone" : event.key === "End" ? "android" : item === "iphone" ? "android" : "iphone";
        setSelected(next);
        document.getElementById(`home-screen-tab-${next}`)?.focus();
      }}>{item === "iphone" ? "iPhone" : "Android"}</button>)}
    </div>}
    <div id="home-screen-instructions" role={detected ? undefined : "tabpanel"} aria-labelledby={detected ? undefined : `home-screen-tab-${selected}`}>
      <p className="home-screen-browser">{platform === "iphone" ? "使用 Safari" : "使用 Chrome"}</p>
      {platform === "iphone" ? <ol className="home-screen-steps">
        <li>在 Safari 打開 <a href="/closerice/">Closerice 首頁</a>。</li>
        <li>點選「分享」<Share size={15} aria-hidden="true" />，再選「加入主畫面」。部分版面需先點「更多」。</li>
        <li>如有「以網頁 App 開啟」，將它開啟，再點「加入」。</li>
      </ol> : <ol className="home-screen-steps">
        <li>在 Chrome 打開 <a href="/closerice/">Closerice 首頁</a>。</li>
        <li>點右上角「⋮」，選「加到主畫面」或「安裝並建立捷徑」。</li>
        <li>按畫面選擇「安裝」或「建立捷徑」，再確認加入。</li>
      </ol>}
    </div>
    </div>
  </details>;
}
