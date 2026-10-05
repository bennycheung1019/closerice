"use client";

import { useEffect, useMemo, useState } from "react";

type Channel = "keeta" | "foodpanda" | "takeaway" | "dine_in";
type Status = "none" | "favorite" | "blacklist";
type Photo = { id: string; url: string; name: string };
type Review = {
  id: string; diningDate: string; restaurant: string; food: string; comment: string;
  score: number | null; channel: Channel; status: Status; orderNumber: string;
  amountCents: number | null; photos: Photo[];
};
type Draft = Omit<Review, "id" | "photos">;
type ToolInput = Partial<Pick<Draft, "diningDate" | "restaurant" | "food" | "comment" | "channel" | "orderNumber">> & { amountHKD?: number };
type ModelContext = { registerTool: (tool: { name: string; description: string; inputSchema: object; annotations?: object; execute: (input: ToolInput) => Promise<object> }) => Promise<unknown> };

const channelNames: Record<Channel, string> = { keeta: "Keeta", foodpanda: "foodpanda", takeaway: "外賣自取", dine_in: "堂食" };
const todayHK = () => {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};
const blankDraft = (): Draft => ({ diningDate: todayHK(), restaurant: "", food: "", comment: "", score: null, channel: "dine_in", status: "none", orderNumber: "", amountCents: null });
const money = (cents: number | null) => cents === null ? "" : `HK$${(cents / 100).toFixed(2)}`;

export default function ReviewApp({ displayName }: { displayName: string }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [files, setFiles] = useState<File[]>([]);
  const [existingPhotos, setExistingPhotos] = useState<Photo[]>([]);
  const [saving, setSaving] = useState(false);
  const [aiDraft, setAiDraft] = useState(false);

  async function loadReviews() {
    try {
      const response = await fetch("/api/reviews", { cache: "no-store" });
      const data = await response.json() as { reviews: Review[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "讀取失敗");
      setReviews(data.reviews);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "暫時無法讀取紀錄。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadReviews(); }, []);

  useEffect(() => {
    const context = (document as Document & { modelContext?: ModelContext }).modelContext;
    if (!context?.registerTool) return;
    void context.registerTool({
      name: "prepare_closerice_review_draft",
      description: "從使用者在聊天中提供的訂單截圖或收據，將可見的餐廳、食物、日期、平台、訂單號及金額填入 Closerice 表單，讓使用者核對後自行儲存。不要猜測評分或食物品質；日期不完整時留空。此工具只準備草稿，不會儲存。",
      inputSchema: {
        type: "object",
        properties: {
          diningDate: { type: "string", description: "完整且確定的用餐日期，YYYY-MM-DD；未見年份時省略" },
          restaurant: { type: "string", description: "截圖上可見的餐廳名稱" },
          food: { type: "string", description: "截圖上可見的食物或餐點，保留原文" },
          comment: { type: "string", description: "只填使用者親自描述的感想，不要從收據推測" },
          channel: { type: "string", enum: ["keeta", "foodpanda", "takeaway", "dine_in"] },
          orderNumber: { type: "string", description: "截圖上可見的訂單編號" },
          amountHKD: { type: "number", description: "實付總額（港幣），只在清楚顯示時填寫" },
        }, additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: async (input) => {
        const validDate = input.diningDate && /^\d{4}-\d{2}-\d{2}$/.test(input.diningDate) ? input.diningDate : "";
        const validChannel = input.channel && input.channel in channelNames ? input.channel : "dine_in";
        setDraft({ ...blankDraft(), diningDate: validDate, restaurant: input.restaurant?.slice(0, 120) ?? "", food: input.food?.slice(0, 1000) ?? "", comment: input.comment?.slice(0, 3000) ?? "", channel: validChannel, orderNumber: input.orderNumber?.slice(0, 80) ?? "", amountCents: typeof input.amountHKD === "number" && Number.isFinite(input.amountHKD) && input.amountHKD >= 0 ? Math.round(input.amountHKD * 100) : null });
        setEditingId(null); setExistingPhotos([]); setFiles([]); setAiDraft(true); setOpen(true); setError("");
        return { result: "已在 Closerice 開啟草稿。請用戶核對日期、餐點及金額，親自填寫評分和評語，再按儲存。", saved: false };
      },
    }).catch((cause) => console.warn("Site tool unavailable", cause));
  }, []);

  const filtered = useMemo(() => reviews.filter((review) => {
    const matchesText = `${review.restaurant} ${review.food} ${review.comment}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
    return matchesText && (statusFilter === "all" || review.status === statusFilter) && (channelFilter === "all" || review.channel === channelFilter);
  }), [reviews, search, statusFilter, channelFilter]);

  function startNew() { setDraft(blankDraft()); setEditingId(null); setExistingPhotos([]); setFiles([]); setAiDraft(false); setOpen(true); setError(""); }
  function startEdit(review: Review) { const { id: _id, photos: imageList, ...data } = review; setDraft(data); setEditingId(review.id); setExistingPhotos(imageList); setFiles([]); setAiDraft(false); setOpen(true); setError(""); }
  function change<K extends keyof Draft>(key: K, value: Draft[K]) { setDraft((old) => ({ ...old, [key]: value })); }

  async function saveReview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (!draft.restaurant.trim() || !draft.food.trim()) { setError("請填寫餐廳名稱和食物。 "); return; }
    setSaving(true);
    try {
      const endpoint = editingId ? `/api/reviews/${editingId}` : "/api/reviews";
      const response = await fetch(endpoint, { method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      const data = await response.json() as { id: string; error?: string };
      if (!response.ok) throw new Error(data.error ?? "儲存失敗");
      const reviewId = editingId ?? data.id;
      let uploadError = "";
      for (const file of files) {
        const form = new FormData(); form.append("photo", file);
        const uploaded = await fetch(`/api/reviews/${reviewId}/photos`, { method: "POST", body: form });
        if (!uploaded.ok) { const issue = await uploaded.json().catch(() => ({})) as { error?: string }; uploadError = issue.error ?? "部分相片未能上載。"; break; }
      }
      setOpen(false); setFiles([]); setMessage(uploadError ? `紀錄已儲存。${uploadError}` : "紀錄已儲存。");
      await loadReviews();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "儲存失敗，請稍後再試。"); }
    finally { setSaving(false); }
  }

  async function quickStatus(review: Review, status: Status) {
    const next = review.status === status ? "none" : status;
    try {
      const { id: _id, photos: _photos, ...data } = review;
      const response = await fetch(`/api/reviews/${review.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...data, status: next }) });
      if (!response.ok) throw new Error("更新標記失敗。");
      setReviews((old) => old.map((item) => item.id === review.id ? { ...item, status: next } : item));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "更新失敗。"); }
  }

  async function deleteReview(review: Review) {
    if (!window.confirm(`確定刪除「${review.restaurant}」的紀錄和相片？`)) return;
    try {
      const response = await fetch(`/api/reviews/${review.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("刪除失敗。");
      setReviews((old) => old.filter((item) => item.id !== review.id)); setMessage("紀錄已刪除。");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "刪除失敗。"); }
  }

  async function deletePhoto(photo: Photo) {
    if (!window.confirm("確定移除此相片？")) return;
    try {
      const response = await fetch(`/api/photos/${photo.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("移除相片失敗。");
      setExistingPhotos((old) => old.filter((item) => item.id !== photo.id));
      await loadReviews();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "移除相片失敗。"); }
  }

  return <main className="shell">
    <header className="topbar"><div className="brand"><span className="brandmark" aria-hidden="true">◒</span>Closerice</div><span className="account" title={displayName}>{displayName}</span></header>
    <section className="intro"><div><p className="eyebrow">你的私人食評筆記</p><h1>記低每一餐的味道。</h1><p>由外賣到堂食，下一次落單之前有得參考。</p></div><button className="button primary" onClick={startNew}>＋ 新增紀錄</button></section>
    <section className="helper"><div><strong>用 ChatGPT 幫你填資料</strong><span>在桌面版內建瀏覽器開啟此頁，再把訂單截圖傳到聊天，請 ChatGPT「幫我填入 Closerice 草稿」。核對後才儲存。</span></div><span aria-hidden="true">✦</span></section>
    {message && <div className="notice" role="status">{message} <button className="icon-button" onClick={() => setMessage("")} aria-label="關閉提示">×</button></div>}
    {error && !open && <div className="notice error" role="alert">{error}</div>}
    <div className="toolbar"><input className="search" aria-label="搜尋餐廳或食物" placeholder="搜尋餐廳、食物或評語" value={search} onChange={(event) => setSearch(event.target.value)} /><select className="filter" aria-label="按標記篩選" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">所有標記</option><option value="favorite">我的最愛</option><option value="blacklist">黑名單</option></select><select className="filter" aria-label="按用餐方式篩選" value={channelFilter} onChange={(event) => setChannelFilter(event.target.value)}><option value="all">所有方式</option>{Object.entries(channelNames).map(([key, name]) => <option value={key} key={key}>{name}</option>)}</select></div>
    {loading ? <p role="status">正在讀取紀錄…</p> : reviews.length === 0 ? <section className="empty"><div className="empty-copy"><h2>第一餐，從這裏開始。</h2><p>新增一筆食評。餐廳、食物、分數和相片都會妥善保存，手機和電腦都看得到。</p><button className="button primary" onClick={startNew}>新增第一筆紀錄</button></div><img src="/food-hero.png" alt="一盒叉燒飯和青菜" /></section> : filtered.length === 0 ? <p>沒有符合條件的紀錄。試試其他搜尋字眼或篩選條件。</p> : <section className="list" aria-label="食評紀錄">{filtered.map((review) => <article className="card" key={review.id}>{review.photos[0] && <img className="card-media" src={review.photos[0].url} alt={`${review.restaurant}的相片`} />}<div className="card-body"><div className="card-top"><div><h2>{review.restaurant}</h2><p className="meta">{review.diningDate} · {channelNames[review.channel]} {review.amountCents !== null && `· ${money(review.amountCents)}`}</p></div>{review.status !== "none" && <span className={`status ${review.status}`}>{review.status === "favorite" ? "最愛" : "黑名單"}</span>}</div><p className="food">{review.food}</p>{review.comment && <p className="comment">{review.comment}</p>}{review.orderNumber && <p className="meta">訂單：{review.orderNumber}</p>}<div className="card-bottom"><span className="score" aria-label={review.score ? `${review.score} 分（滿分 5 分）` : "未評分"}>{review.score ? `${"★".repeat(review.score)}${"☆".repeat(5 - review.score)}` : "未評分"}</span><div className="small-actions"><button className="icon-button" title="標記最愛" aria-label="標記最愛" onClick={() => quickStatus(review, "favorite")}>{review.status === "favorite" ? "★" : "☆"}</button><button className="icon-button" title="加入黑名單" aria-label="加入黑名單" onClick={() => quickStatus(review, "blacklist")}>⊘</button><button className="icon-button" onClick={() => startEdit(review)} aria-label="編輯紀錄">編輯</button><button className="icon-button" onClick={() => deleteReview(review)} aria-label="刪除紀錄">刪除</button></div></div></div></article>)}</section>}
    {open && <div className="overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div className="dialog-head"><div><h2 id="dialog-title">{editingId ? "編輯食評" : aiDraft ? "核對截圖草稿" : "新增食評"}</h2><p className="hint">{aiDraft ? "AI 只填入可見的訂單資料。請確認日期、食物和金額，親自填寫評分與感想。" : "餐廳和食物為必填；其他資料可以稍後補上。"}</p></div><button className="icon-button" onClick={() => setOpen(false)} aria-label="關閉">×</button></div>{error && <div className="notice error" role="alert">{error}</div>}<form onSubmit={saveReview}><div className="form-grid"><label className="field">用餐日期<input type="date" required value={draft.diningDate} onChange={(event) => change("diningDate", event.target.value)} /></label><label className="field">用餐方式<select value={draft.channel} onChange={(event) => change("channel", event.target.value as Channel)}>{Object.entries(channelNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label><label className="field full">餐廳名稱 *<input required maxLength={120} placeholder="例如：某某茶餐廳" value={draft.restaurant} onChange={(event) => change("restaurant", event.target.value)} /></label><label className="field full">食物 *<textarea required maxLength={1000} placeholder="例如：叉燒飯、凍檸茶" value={draft.food} onChange={(event) => change("food", event.target.value)} /></label><label className="field">訂單編號<input maxLength={80} value={draft.orderNumber} onChange={(event) => change("orderNumber", event.target.value)} /></label><label className="field">實付金額（港幣）<input type="number" min="0" step="0.01" inputMode="decimal" value={draft.amountCents === null ? "" : (draft.amountCents / 100).toFixed(2)} onChange={(event) => change("amountCents", event.target.value === "" ? null : Math.round(Number(event.target.value) * 100))} /></label><div className="field full"><span>你的評分</span><div className="rating" role="group" aria-label="評分">{[1, 2, 3, 4, 5].map((n) => <button type="button" key={n} className={draft.score !== null && n <= draft.score ? "active" : ""} aria-label={`${n} 分`} onClick={() => change("score", draft.score === n ? null : n)}>★</button>)}</div></div><label className="field full">你的評語<textarea maxLength={3000} placeholder="味道、份量、送餐速度，或者下次會否再叫" value={draft.comment} onChange={(event) => change("comment", event.target.value)} /></label><div className="field full"><span>標記</span><div className="toggle-row"><button type="button" className={`toggle ${draft.status === "favorite" ? "selected" : ""}`} onClick={() => change("status", draft.status === "favorite" ? "none" : "favorite")}>☆ 最愛</button><button type="button" className={`toggle ${draft.status === "blacklist" ? "selected" : ""}`} onClick={() => change("status", draft.status === "blacklist" ? "none" : "blacklist")}>⊘ 黑名單</button></div></div><label className="field full">相片（每筆最多 5 張，每張 8 MB 以下）<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, Math.max(0, 5 - existingPhotos.length)))} />{files.length > 0 && <span className="hint">待上載：{files.map((file) => file.name).join("、")}</span>}</label>{existingPhotos.length > 0 && <div className="field full"><span>已儲存相片</span><div className="photo-grid">{existingPhotos.map((photo) => <div className="photo-tile" key={photo.id}><img src={photo.url} alt={photo.name} /><button type="button" onClick={() => deletePhoto(photo)} aria-label={`移除${photo.name}`}>×</button></div>)}</div></div>}</div><div className="dialog-actions"><button type="button" className="button secondary" onClick={() => setOpen(false)}>取消</button><button type="submit" className="button primary" disabled={saving}>{saving ? "儲存中…" : "儲存紀錄"}</button></div></form></section></div>}
  </main>;
}
