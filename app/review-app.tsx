"use client";

import { useEffect, useMemo, useState } from "react";
import { Heart, List, Plus, ScanLine } from "lucide-react";
import { apiUrl, pageAsset } from "../lib/client-urls";

type Channel = "keeta" | "foodpanda" | "takeaway" | "dine_in";
type District = "mong_kok" | "tsim_sha_tsui";
type Status = "none" | "favorite" | "blacklist";
type Photo = { id: string; url: string; name: string };
type Review = {
  id: string; diningDate: string; restaurant: string; food: string; comment: string;
  score: number | null; channel: Channel; status: Status; orderNumber: string;
  amountCents: number | null; district: District | null; photos: Photo[];
};
type Draft = Omit<Review, "id" | "photos" | "district"> & { district: District | "" };
type ToolInput = Pick<Draft, "diningDate" | "restaurant" | "food" | "comment" | "channel"> & {
  score: number; district: District; orderNumber?: string; amountHKD?: number; status?: Status;
};
type ScanResult = { restaurant: string; food: string; diningDate: string | null; channel: Channel | null; orderNumber: string; amountCents: number | null; district: District | null; locationText: string };
type ModelContext = { registerTool: (tool: { name: string; description: string; inputSchema: object; annotations?: object; execute: (input: ToolInput) => Promise<object> }) => Promise<unknown> };

const channelNames: Record<Channel, string> = { keeta: "Keeta", foodpanda: "foodpanda", takeaway: "外賣自取", dine_in: "堂食" };
const districtNames: Record<District, string> = { mong_kok: "旺角", tsim_sha_tsui: "尖沙咀" };
const todayHK = () => {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};
const blankDraft = (): Draft => ({ diningDate: todayHK(), restaurant: "", food: "", comment: "", score: null, channel: "dine_in", status: "none", orderNumber: "", amountCents: null, district: "" });
const money = (cents: number | null) => cents === null ? "" : `HK$${(cents / 100).toFixed(2)}`;

async function compressFoodPhoto(file: File): Promise<Blob> {
  if (file.size <= 850 * 1024) return file;
  const image = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    const ratio = Math.min(1, 1400 / Math.max(image.width, image.height));
    canvas.width = Math.max(1, Math.round(image.width * ratio));
    canvas.height = Math.max(1, Math.round(image.height * ratio));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("無法處理相片，請換一張再試。");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.82, 0.7, 0.55, 0.4]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= 850 * 1024) return blob;
    }
    throw new Error("相片仍然太大，請換一張再試。");
  } finally {
    image.close();
  }
}

export default function ReviewApp() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [districtFilter, setDistrictFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [files, setFiles] = useState<File[]>([]);
  const [existingPhotos, setExistingPhotos] = useState<Photo[]>([]);
  const [saving, setSaving] = useState(false);
  const [viewingPhotos, setViewingPhotos] = useState<Review | null>(null);
  const [entryMode, setEntryMode] = useState<"manual" | "scan">("manual");
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState("");
  const [scanError, setScanError] = useState("");

  async function loadReviews() {
    try {
      const response = await fetch(apiUrl("/api/reviews"), { cache: "no-store" });
      const data = await response.json() as { reviews: Review[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "讀取失敗");
      setReviews(data.reviews.map((review) => ({ ...review, photos: review.photos.map((photo) => ({ ...photo, url: apiUrl(photo.url) })) })));
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
      name: "save_closerice_review",
      description: "把用戶在聊天中提供的食評直接儲存到 Closerice 共享紀錄。可從訂單截圖讀取可見的餐廳、食物、日期、平台、訂單號、金額及分店地區；截圖只作讀取，不會上載或儲存。完整日期或地區缺失時先問用戶；評語和評分只用用戶親自提供的內容，不要猜測。資料齊全後一次儲存。",
      inputSchema: {
        type: "object",
        properties: {
          diningDate: { type: "string", description: "完整且確定的用餐日期，YYYY-MM-DD；日期不完整時先問用戶" },
          restaurant: { type: "string", description: "截圖上可見的餐廳名稱" },
          food: { type: "string", description: "截圖上可見的食物或餐點，保留原文" },
          comment: { type: "string", description: "只填使用者親自描述的感想，不要從收據推測" },
          score: { type: "integer", minimum: 1, maximum: 5, description: "使用者親自提供的 1 至 5 分評分" },
          channel: { type: "string", enum: ["keeta", "foodpanda", "takeaway", "dine_in"] },
          district: { type: "string", enum: ["mong_kok", "tsim_sha_tsui"], description: "用餐地區：旺角為 mong_kok，尖沙咀為 tsim_sha_tsui。圖片沒有明確分店或地址時，先問用戶。" },
          orderNumber: { type: "string", description: "截圖上可見的訂單編號" },
          amountHKD: { type: "number", description: "實付總額（港幣），只在清楚顯示時填寫" },
          status: { type: "string", enum: ["none", "favorite", "blacklist"] },
        }, required: ["diningDate", "restaurant", "food", "comment", "score", "channel", "district"], additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: async (input) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(input.diningDate) || !input.restaurant?.trim() || !input.food?.trim() || !Number.isInteger(input.score) || input.score < 1 || input.score > 5 || !(input.channel in channelNames) || !(input.district in districtNames)) {
          return { saved: false, error: "資料未齊全，請先向用戶確認日期、餐廳、食物、地區、用餐方式和評分。" };
        }
        const amountCents = typeof input.amountHKD === "number" && Number.isFinite(input.amountHKD) && input.amountHKD >= 0 ? Math.round(input.amountHKD * 100) : null;
        const response = await fetch(apiUrl("/api/agent/reviews"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            diningDate: input.diningDate,
            restaurant: input.restaurant,
            food: input.food,
            comment: input.comment,
            score: input.score,
            channel: input.channel,
            district: input.district,
            status: input.status ?? "none",
            orderNumber: input.orderNumber ?? "",
            amountCents,
          }),
        });
        const result = await response.json() as { id?: string; error?: string };
        if (!response.ok || !result.id) return { saved: false, error: result.error ?? "儲存失敗，請稍後再試。" };
        await loadReviews();
        setMessage("AI 食評已儲存。訂單截圖沒有上載。");
        return { saved: true, id: result.id, result: "食評已儲存到 Closerice，共享紀錄已更新；訂單截圖沒有上載。" };
      },
    }).catch((cause) => console.warn("Site tool unavailable", cause));
  }, []);

  const filtered = useMemo(() => reviews.filter((review) => {
    const matchesText = `${review.restaurant} ${review.food} ${review.comment}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
    return matchesText && (statusFilter === "all" || review.status === statusFilter) && (channelFilter === "all" || review.channel === channelFilter) && (districtFilter === "all" || (districtFilter === "unclassified" ? review.district === null : review.district === districtFilter));
  }), [reviews, search, statusFilter, channelFilter, districtFilter]);

  function startNew() { if (editingId !== null) { setDraft(blankDraft()); setFiles([]); } setEditingId(null); setExistingPhotos([]); setViewingPhotos(null); setOpen(true); setError(""); setScanMessage(""); setScanError(""); setEntryMode("manual"); }
  function showReviews(filter: "all" | "favorite") { setOpen(false); setViewingPhotos(null); setStatusFilter(filter); setChannelFilter("all"); setDistrictFilter("all"); setSearch(""); setError(""); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function startEdit(review: Review) { const { id: _id, photos: imageList, ...data } = review; setDraft({ ...data, district: review.district ?? "" }); setEditingId(review.id); setExistingPhotos(imageList); setFiles([]); setOpen(true); setError(""); }
  function change<K extends keyof Draft>(key: K, value: Draft[K]) { setDraft((old) => ({ ...old, [key]: value })); }

  async function scanReceipt(file: File) {
    setScanError(""); setScanMessage("");
    if (file.size === 0 || file.size > 8 * 1024 * 1024) { setScanError("圖片需小於 8 MB。"); return; }
    setScanning(true);
    try {
      const form = new FormData(); form.append("image", file);
      const response = await fetch(apiUrl("/api/scan"), { method: "POST", body: form });
      const result = await response.json() as { scan?: ScanResult; error?: string };
      if (!response.ok || !result.scan) throw new Error(result.error ?? "無法辨認圖片，請手動填寫。");
      const scan = result.scan;
      if (!scan.restaurant && !scan.food && !scan.diningDate && !scan.orderNumber) throw new Error("圖片中找不到清晰的訂單資料，請換一張或手動填寫。");
      setDraft((old) => ({
        ...old,
        restaurant: old.restaurant || scan.restaurant,
        food: old.food || scan.food,
        diningDate: old.diningDate === todayHK() ? (scan.diningDate ?? "") : old.diningDate,
        channel: scan.channel && old.channel === "dine_in" ? scan.channel : old.channel,
        orderNumber: old.orderNumber || scan.orderNumber,
        amountCents: old.amountCents ?? scan.amountCents,
        district: old.district || scan.district || "",
      }));
      const missing = [!scan.diningDate && "用餐日期", !scan.district && "地區"].filter(Boolean).join("和");
      setScanMessage(`已填入圖片中可辨認的資料${scan.district ? `，分店位於${districtNames[scan.district]}` : ""}。${missing ? `請補上${missing}，並核對其他資料。` : "請核對資料。"}截圖不會保留。`);
    } catch (cause) {
      setScanError(cause instanceof Error ? cause.message : "掃描失敗，請稍後再試。");
    } finally {
      setScanning(false);
    }
  }

  async function saveReview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (!draft.restaurant.trim() || !draft.food.trim()) { setError("請填寫餐廳名稱和食物。 "); return; }
    if (!draft.district) { setError("請選擇旺角或尖沙咀。 "); return; }
    setSaving(true);
    try {
      const endpoint = apiUrl(editingId ? `/api/reviews/${editingId}` : "/api/reviews");
      const response = await fetch(endpoint, { method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      const data = await response.json() as { id: string; error?: string };
      if (!response.ok) throw new Error(data.error ?? "儲存失敗");
      const reviewId = editingId ?? data.id;
      let uploadError = "";
      for (const file of files) {
        let photo: Blob;
        try { photo = await compressFoodPhoto(file); }
        catch (cause) { uploadError = cause instanceof Error ? cause.message : "相片壓縮失敗。"; break; }
        const form = new FormData(); form.append("photo", photo, photo === file ? file.name : `${file.name.replace(/\.[^.]+$/, "")}.jpg`);
        const uploaded = await fetch(apiUrl(`/api/reviews/${reviewId}/photos`), { method: "POST", body: form });
        if (!uploaded.ok) { const issue = await uploaded.json().catch(() => ({})) as { error?: string }; uploadError = issue.error ?? "部分相片未能上載。"; break; }
      }
      setOpen(false); setFiles([]); setDraft(blankDraft()); setEditingId(null); setMessage(uploadError ? `紀錄已儲存。${uploadError}` : "紀錄已儲存。");
      await loadReviews();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "儲存失敗，請稍後再試。"); }
    finally { setSaving(false); }
  }

  async function quickStatus(review: Review, status: Status) {
    const next = review.status === status ? "none" : status;
    try {
      const { id: _id, photos: _photos, ...data } = review;
      const response = await fetch(apiUrl(`/api/reviews/${review.id}`), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...data, status: next }) });
      if (!response.ok) throw new Error("更新標記失敗。");
      setReviews((old) => old.map((item) => item.id === review.id ? { ...item, status: next } : item));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "更新失敗。"); }
  }

  async function deleteReview(review: Review) {
    if (!window.confirm(`確定刪除「${review.restaurant}」的紀錄和相片？`)) return;
    try {
      const response = await fetch(apiUrl(`/api/reviews/${review.id}`), { method: "DELETE" });
      if (!response.ok) throw new Error("刪除失敗。");
      setReviews((old) => old.filter((item) => item.id !== review.id)); setMessage("紀錄已刪除。");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "刪除失敗。"); }
  }

  async function deletePhoto(photo: Photo) {
    if (!window.confirm("確定移除此相片？")) return;
    try {
      const response = await fetch(apiUrl(`/api/photos/${photo.id}`), { method: "DELETE" });
      if (!response.ok) throw new Error("移除相片失敗。");
      setExistingPhotos((old) => old.filter((item) => item.id !== photo.id));
      await loadReviews();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "移除相片失敗。"); }
  }

  return <main className="shell review-app">
    <header className="topbar"><div className="brand"><span className="brandmark" aria-hidden="true"><img src={pageAsset("favicon.svg")} alt="" /></span>Closerice</div><span className="account">共享食評</span></header>
    <section className="intro"><div><p className="eyebrow">共享食評筆記</p><h1>一齊記低每一餐的味道。</h1><p>由外賣到堂食，下一次落單之前有得參考。</p></div><button className="button primary" onClick={startNew}>＋ 新增紀錄</button></section>
    <section className="mobile-page-head" aria-label="目前頁面"><p className="eyebrow">共享食評筆記</p><h1>{statusFilter === "favorite" ? "我的最愛" : "食評紀錄"}</h1><p>{loading ? "正在讀取…" : statusFilter === "favorite" ? `${reviews.filter((review) => review.status === "favorite").length} 筆最愛食評` : `一齊記低每一餐 · ${reviews.length} 筆紀錄`}</p></section>
    {message && <div className="notice" role="status">{message} <button className="icon-button" onClick={() => setMessage("")} aria-label="關閉提示">×</button></div>}
    {error && !open && <div className="notice error" role="alert">{error}</div>}
    <div className="toolbar"><input className="search" aria-label="搜尋餐廳或食物" placeholder="搜尋餐廳、食物或評語" value={search} onChange={(event) => setSearch(event.target.value)} /><select className="filter" aria-label="按地區篩選" value={districtFilter} onChange={(event) => setDistrictFilter(event.target.value)}><option value="all">所有地區</option><option value="mong_kok">旺角</option><option value="tsim_sha_tsui">尖沙咀</option><option value="unclassified">未分類</option></select><select className="filter" aria-label="按標記篩選" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">所有標記</option><option value="favorite">我的最愛</option><option value="blacklist">黑名單</option></select><select className="filter" aria-label="按用餐方式篩選" value={channelFilter} onChange={(event) => setChannelFilter(event.target.value)}><option value="all">所有方式</option>{Object.entries(channelNames).map(([key, name]) => <option value={key} key={key}>{name}</option>)}</select></div>
    {loading ? <p role="status">正在讀取紀錄…</p> : reviews.length === 0 ? <section className="empty"><div className="empty-copy"><h2>第一餐，從這裏開始。</h2><p>新增一筆食評。餐廳、食物和分數都會儲存；食物相片只在你選擇上載時才會附上。</p><button className="button primary" onClick={startNew}>新增第一筆紀錄</button></div><img src={pageAsset("food-hero.png")} alt="一盒叉燒飯和青菜" /></section> : filtered.length === 0 ? <section className="no-results"><Heart size={26} aria-hidden="true" /><h2>{statusFilter === "favorite" && !search && channelFilter === "all" ? "仲未有最愛食評" : "找不到食評"}</h2><p>{statusFilter === "favorite" && !search && channelFilter === "all" ? "喺食評紀錄按 ☆，就可以將喜歡的餐廳放到這裏。" : "試試其他搜尋字眼或篩選條件。"}</p></section> : <section className="list" aria-label="食評紀錄">{filtered.map((review) => <article className="card" key={review.id}><div className="card-body"><div className="card-top"><div><h2>{review.restaurant}</h2><p className="meta">{review.diningDate} · {review.district ? districtNames[review.district] : "未分類"} · {channelNames[review.channel]} {review.amountCents !== null && `· ${money(review.amountCents)}`}</p></div>{review.status !== "none" && <span className={`status ${review.status}`}>{review.status === "favorite" ? "最愛" : "黑名單"}</span>}</div><p className="food">{review.food}</p>{review.comment && <p className="comment">{review.comment}</p>}{review.orderNumber && <p className="meta">訂單：{review.orderNumber}</p>}{review.photos.length > 0 && <button className="photo-link" onClick={() => setViewingPhotos(review)}>查看食物相片（{review.photos.length}）</button>}<div className="card-bottom"><span className="score" aria-label={review.score ? `${review.score} 分（滿分 5 分）` : "未評分"}>{review.score ? `${"★".repeat(review.score)}${"☆".repeat(5 - review.score)}` : "未評分"}</span><div className="small-actions"><button className="icon-button" title="標記最愛" aria-label="標記最愛" onClick={() => quickStatus(review, "favorite")}>{review.status === "favorite" ? "★" : "☆"}</button><button className="icon-button" title="加入黑名單" aria-label="加入黑名單" onClick={() => quickStatus(review, "blacklist")}>⊘</button><button className="icon-button" onClick={() => startEdit(review)} aria-label="編輯紀錄">編輯</button><button className="icon-button" onClick={() => deleteReview(review)} aria-label="刪除紀錄">刪除</button></div></div></div></article>)}</section>}
    <nav className="mobile-tabs" aria-label="底部分頁"><button type="button" className={`mobile-tab ${!open && statusFilter !== "favorite" ? "active" : ""}`} aria-current={!open && statusFilter !== "favorite" ? "page" : undefined} onClick={() => showReviews("all")}><span className="mobile-tab-icon"><List size={22} strokeWidth={2.2} aria-hidden="true" /></span><span>食評</span></button><button type="button" className={`mobile-tab ${open ? "active" : ""}`} aria-current={open ? "page" : undefined} onClick={startNew}><span className="mobile-tab-icon"><Plus size={23} strokeWidth={2.4} aria-hidden="true" /></span><span>新增</span></button><button type="button" className={`mobile-tab ${!open && statusFilter === "favorite" ? "active" : ""}`} aria-current={!open && statusFilter === "favorite" ? "page" : undefined} onClick={() => showReviews("favorite")}><span className="mobile-tab-icon"><Heart size={22} strokeWidth={2.2} aria-hidden="true" /></span><span>最愛</span></button></nav>
    {viewingPhotos && <div className="overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setViewingPhotos(null); }}><section className="photo-dialog" role="dialog" aria-modal="true" aria-label={`${viewingPhotos.restaurant}的食物相片`}><div className="dialog-head"><h2>{viewingPhotos.restaurant}的食物相片</h2><button className="icon-button" onClick={() => setViewingPhotos(null)} aria-label="關閉相片">×</button></div><div className="photo-viewer-grid">{viewingPhotos.photos.map((photo) => <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer"><img src={photo.url} alt={photo.name} loading="lazy" /></a>)}</div></section></div>}
    {open && <div className="overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div className="dialog-head"><div><h2 id="dialog-title">{editingId ? "編輯食評" : "新增食評"}</h2><p className="hint">餐廳、食物和地區為必填；其他資料可以稍後補上。</p></div><button className="icon-button" onClick={() => setOpen(false)} aria-label="關閉">×</button></div>{error && <div className="notice error" role="alert">{error}</div>}<form onSubmit={saveReview}>{!editingId && <div className="entry-mode" role="group" aria-label="新增方式"><button type="button" className={entryMode === "manual" ? "active" : ""} aria-pressed={entryMode === "manual"} onClick={() => setEntryMode("manual")}>手動填寫</button><button type="button" className={entryMode === "scan" ? "active" : ""} aria-pressed={entryMode === "scan"} onClick={() => setEntryMode("scan")}>掃描圖片</button></div>}{!editingId && entryMode === "scan" && <div className="scan-box"><div className="scan-heading"><span className="scan-icon"><ScanLine size={23} aria-hidden="true" /></span><div><strong>掃描訂單截圖或收據</strong><p>圖片會傳給 Kimi 辨認，但不會儲存在食評。</p></div></div><input id="receipt-scan" className="scan-input" type="file" accept="image/jpeg,image/png,image/webp" disabled={scanning} onChange={(event) => { const file = event.target.files?.[0]; if (file) void scanReceipt(file); event.target.value = ""; }} /><label className="button secondary scan-pick" htmlFor="receipt-scan">{scanning ? "正在掃描…" : "選擇圖片並掃描"}</label>{scanMessage && <p className="scan-feedback" role="status">{scanMessage}</p>}{scanError && <p className="scan-feedback error-text" role="alert">{scanError}</p>}</div>}<div className="form-grid"><label className="field">用餐日期<input type="date" required value={draft.diningDate} onChange={(event) => change("diningDate", event.target.value)} /></label><label className="field">用餐方式<select value={draft.channel} onChange={(event) => change("channel", event.target.value as Channel)}>{Object.entries(channelNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label><label className="field full">地區 *<select required value={draft.district} onChange={(event) => change("district", event.target.value as District | "")}><option value="">請選擇地區</option><option value="mong_kok">旺角（屋企）</option><option value="tsim_sha_tsui">尖沙咀（工作地點）</option></select></label><label className="field full">餐廳名稱 *<input required maxLength={120} placeholder="例如：某某茶餐廳" value={draft.restaurant} onChange={(event) => change("restaurant", event.target.value)} /></label><label className="field full">食物 *<textarea required maxLength={1000} placeholder="例如：叉燒飯、凍檸茶" value={draft.food} onChange={(event) => change("food", event.target.value)} /></label><label className="field">訂單編號<input maxLength={80} value={draft.orderNumber} onChange={(event) => change("orderNumber", event.target.value)} /></label><label className="field">實付金額（港幣）<input type="number" min="0" step="0.01" inputMode="decimal" value={draft.amountCents === null ? "" : (draft.amountCents / 100).toFixed(2)} onChange={(event) => change("amountCents", event.target.value === "" ? null : Math.round(Number(event.target.value) * 100))} /></label><div className="field full"><span>你的評分</span><div className="rating" role="group" aria-label="評分">{[1, 2, 3, 4, 5].map((n) => <button type="button" key={n} className={draft.score !== null && n <= draft.score ? "active" : ""} aria-label={`${n} 分`} onClick={() => change("score", draft.score === n ? null : n)}>★</button>)}</div></div><label className="field full">你的評語<textarea maxLength={3000} placeholder="味道、份量、送餐速度，或者下次會否再叫" value={draft.comment} onChange={(event) => change("comment", event.target.value)} /></label><div className="field full"><span>標記</span><div className="toggle-row"><button type="button" className={`toggle ${draft.status === "favorite" ? "selected" : ""}`} onClick={() => change("status", draft.status === "favorite" ? "none" : "favorite")}>☆ 最愛</button><button type="button" className={`toggle ${draft.status === "blacklist" ? "selected" : ""}`} onClick={() => change("status", draft.status === "blacklist" ? "none" : "blacklist")}>⊘ 黑名單</button></div></div><label className="field full">食物相片（每筆最多 5 張）<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, Math.max(0, 5 - existingPhotos.length)))} />{files.length > 0 && <span className="hint">待上載：{files.map((file) => file.name).join("、")}</span>}</label>{existingPhotos.length > 0 && <div className="field full"><span>已儲存相片</span><div className="photo-grid">{existingPhotos.map((photo) => <div className="photo-tile" key={photo.id}><img src={photo.url} alt={photo.name} /><button type="button" onClick={() => deletePhoto(photo)} aria-label={`移除${photo.name}`}>×</button></div>)}</div></div>}</div><div className="dialog-actions"><button type="button" className="button secondary" onClick={() => setOpen(false)}>取消</button><button type="submit" className="button primary" disabled={saving}>{saving ? "儲存中…" : "儲存紀錄"}</button></div></form></section></div>}
  </main>;
}
