"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronRight, Heart, List, Plus, ScanLine, Settings } from "lucide-react";
import { apiUrl, pageAsset } from "../lib/client-urls";
import { collectionFetch } from "../lib/client-api";
import { districtGroups, districtNames, districtValues, isDistrict, type District } from "../lib/districts";
import type { CollectionSummary, CollectionTag } from "./collection-app";

type Channel = "keeta" | "foodpanda" | "takeaway" | "dine_in";
type Status = "none" | "favorite" | "blacklist";
type Photo = { id: string; url: string; name: string };
type Review = {
  id: string; diningDate: string; restaurant: string; food: string; comment: string;
  score: number | null; channel: Channel; status: Status; orderNumber: string;
  amountCents: number | null; district: District | null; photos: Photo[]; tagIds: string[];
};
type Draft = Omit<Review, "id" | "photos" | "district"> & { district: District | "" };
type ToolInput = Pick<Draft, "diningDate" | "restaurant" | "food" | "comment" | "channel"> & {
  score: number; district: District; orderNumber?: string; amountHKD?: number; status?: Status;
};
type ScanResult = { restaurant: string; food: string; diningDate: string | null; channel: Channel | null; orderNumber: string; amountCents: number | null; district: District | null; locationText: string };
type ModelContext = { registerTool: (tool: { name: string; description: string; inputSchema: object; annotations?: object; execute: (input: ToolInput) => Promise<object> }) => Promise<unknown> };

const channelNames: Record<Channel, string> = { keeta: "Keeta", foodpanda: "foodpanda", takeaway: "外賣自取", dine_in: "堂食" };
const recentDistrictsKey = "closerice_recent_districts";
function readRecentDistricts(): District[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(recentDistrictsKey) ?? "[]");
    return Array.isArray(stored) ? [...new Set(stored.filter(isDistrict))].slice(0, 3) : [];
  } catch { return []; }
}
function DistrictChoices({ recent }: { recent: District[] }) {
  const recentSet = new Set(recent);
  return <>
    {recent.length > 0 && <optgroup label="最近使用">{recent.map((value) => <option value={value} key={value}>{districtNames[value]}</option>)}</optgroup>}
    {districtGroups.map((group) => {
      const options = group.options.filter((option) => !recentSet.has(option.value));
      return options.length > 0 && <optgroup label={group.label} key={group.label}>{options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</optgroup>;
    })}
  </>;
}
const todayHK = () => {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};
const blankDraft = (): Draft => ({ diningDate: todayHK(), restaurant: "", food: "", comment: "", score: null, channel: "dine_in", status: "none", orderNumber: "", amountCents: null, district: "", tagIds: [] });
const money = (cents: number | null) => cents === null ? "" : `HK$${(cents / 100).toFixed(2)}`;
const restaurantKey = (review: Pick<Review, "restaurant" | "district">) => `${review.restaurant.normalize("NFKC").toLocaleLowerCase().replace(/[\s·•.．()（）_—-]+/g, "")}::${review.district ?? ""}`;
type RestaurantGroup = { key: string; visits: Review[] };
function groupByRestaurant(visits: Review[]): RestaurantGroup[] {
  const groups = new Map<string, RestaurantGroup>();
  for (const visit of visits) {
    const key = restaurantKey(visit);
    const group = groups.get(key);
    if (group) group.visits.push(visit);
    else groups.set(key, { key, visits: [visit] });
  }
  return [...groups.values()];
}

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

export default function ReviewApp({ collection, collections, onSelectCollection, user, tags, onCreateTag, onDeleteTag }: {
  collection: CollectionSummary;
  collections: CollectionSummary[];
  onSelectCollection: (id: string) => void;
  user: { id: string; email: string; name: string };
  tags: CollectionTag[];
  onCreateTag: (name: string) => Promise<string>;
  onDeleteTag: (id: string) => Promise<void>;
}) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("view") === "favorite" ? "favorite" : "all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [districtFilter, setDistrictFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [selectedRestaurant, setSelectedRestaurant] = useState<string | null>(null);
  const [recentDistricts, setRecentDistricts] = useState<District[]>(readRecentDistricts);
  const [newTagName, setNewTagName] = useState("");
  const [open, setOpen] = useState(() => typeof window !== "undefined" && collection.role !== "viewer" && new URLSearchParams(window.location.search).get("view") === "new");
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

  const loadReviews = useCallback(async () => {
    try {
      const response = await collectionFetch("/api/reviews", collection.id);
      const data = await response.json() as { reviews: Review[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "讀取失敗");
      setReviews(data.reviews.map((review) => ({ ...review, photos: review.photos.map((photo) => ({ ...photo, url: apiUrl(photo.url) })) })));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "暫時無法讀取紀錄。");
    } finally {
      setLoading(false);
    }
  }, [collection.id]);

  useEffect(() => { void Promise.resolve().then(() => loadReviews()); }, [loadReviews]);
  useEffect(() => { setSelectedRestaurant(null); }, [collection.id]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("view")) { url.searchParams.delete("view"); window.history.replaceState(null, "", url); }
  }, []);

  useEffect(() => {
    const onSaved = (event: Event) => {
      if ((event as CustomEvent<{ collectionId: string }>).detail.collectionId !== collection.id) return;
      void loadReviews();
      setMessage("AI 食評已儲存。訂單截圖沒有上載。");
    };
    window.addEventListener("closerice-review-saved", onSaved);
    return () => window.removeEventListener("closerice-review-saved", onSaved);
  }, [collection.id, loadReviews]);

  useEffect(() => {
    const context = (document as Document & { modelContext?: ModelContext }).modelContext;
    if (!context?.registerTool || collection.role === "viewer") return;
    void context.registerTool({
      name: "save_closerice_review",
      description: `把用戶在聊天中提供的食評直接儲存到 Closerice「${collection.name}」群組。先與用戶確認群組。可從訂單截圖讀取可見的餐廳、食物、日期、平台、訂單號、金額及分店地區；截圖只作讀取，不會上載或儲存。完整日期或地區缺失時先問用戶；評語和評分只用用戶親自提供的內容，不要猜測。資料齊全後一次儲存。`,
      inputSchema: {
        type: "object",
        properties: {
          diningDate: { type: "string", description: "完整且確定的用餐日期，YYYY-MM-DD；日期不完整時先問用戶" },
          restaurant: { type: "string", description: "截圖上可見的餐廳名稱" },
          food: { type: "string", description: "截圖上可見的食物或餐點，保留原文" },
          comment: { type: "string", description: "只填使用者親自描述的感想，不要從收據推測" },
          score: { type: "integer", minimum: 1, maximum: 5, description: "使用者親自提供的 1 至 5 分評分" },
          channel: { type: "string", enum: ["keeta", "foodpanda", "takeaway", "dine_in"] },
          district: { type: "string", enum: [...districtValues], description: "用餐地區：可選香港18區，亦保留旺角及尖沙咀。圖片沒有明確分店或地址時，先問用戶。" },
          orderNumber: { type: "string", description: "截圖上可見的訂單編號" },
          amountHKD: { type: "number", description: "實付總額（港幣），只在清楚顯示時填寫" },
          status: { type: "string", enum: ["none", "favorite", "blacklist"] },
        }, required: ["diningDate", "restaurant", "food", "comment", "score", "channel", "district"], additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: async (input) => {
        if (localStorage.getItem("closerice_collection_id") !== collection.id) {
          return { saved: false, error: "所選食評群組已改變，請重新選擇群組並重試。" };
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(input.diningDate) || !input.restaurant?.trim() || !input.food?.trim() || !Number.isInteger(input.score) || input.score < 1 || input.score > 5 || !(input.channel in channelNames) || !isDistrict(input.district)) {
          return { saved: false, error: "資料未齊全，請先向用戶確認日期、餐廳、食物、地區、用餐方式和評分。" };
        }
        const amountCents = typeof input.amountHKD === "number" && Number.isFinite(input.amountHKD) && input.amountHKD >= 0 ? Math.round(input.amountHKD * 100) : null;
        const response = await collectionFetch("/api/agent/reviews", collection.id, {
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
        window.dispatchEvent(new CustomEvent("closerice-review-saved", { detail: { collectionId: collection.id } }));
        return { saved: true, id: result.id, result: "食評已儲存到 Closerice，共享紀錄已更新；訂單截圖沒有上載。" };
      },
    }).catch((cause) => console.warn("Site tool unavailable", cause));
  }, [collection.id, collection.name, collection.role]);

  const activeTagFilter = tagFilter === "all" || tags.some((tag) => tag.id === tagFilter) ? tagFilter : "all";
  function rememberDistrict(value: District) {
    setRecentDistricts((old) => {
      const next = [value, ...old.filter((item) => item !== value)].slice(0, 3);
      localStorage.setItem(recentDistrictsKey, JSON.stringify(next));
      return next;
    });
  }
  const filtered = useMemo(() => reviews.filter((review) => {
    const matchesText = `${review.restaurant} ${review.food} ${review.comment}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
    return matchesText && (statusFilter === "all" || review.status === statusFilter) && (channelFilter === "all" || review.channel === channelFilter) && (districtFilter === "all" || (districtFilter === "unclassified" ? review.district === null : review.district === districtFilter)) && (activeTagFilter === "all" || review.tagIds.includes(activeTagFilter));
  }), [reviews, search, statusFilter, channelFilter, districtFilter, activeTagFilter]);
  const restaurantGroups = useMemo(() => groupByRestaurant(filtered), [filtered]);
  const allRestaurantGroups = useMemo(() => groupByRestaurant(reviews), [reviews]);
  const selectedGroup = allRestaurantGroups.find((group) => group.key === selectedRestaurant);
  const suggestedGroups = useMemo(() => {
    const query = draft.restaurant.normalize("NFKC").toLocaleLowerCase().replace(/[\s·•.．()（）_—-]+/g, "");
    if (query.length < 2) return [];
    return allRestaurantGroups.filter((group) => {
      const latest = group.visits[0];
      return restaurantKey(latest).split("::")[0].includes(query);
    }).slice(0, 4);
  }, [allRestaurantGroups, draft.restaurant]);

  function startNew() { if (collection.role === "viewer") return; setDraft(blankDraft()); setFiles([]); setEditingId(null); setExistingPhotos([]); setViewingPhotos(null); setOpen(true); setError(""); setScanMessage(""); setScanError(""); setEntryMode("manual"); }
  function showReviews(filter: "all" | "favorite") { setOpen(false); setViewingPhotos(null); setSelectedRestaurant(null); setStatusFilter(filter); setChannelFilter("all"); setDistrictFilter("all"); setTagFilter("all"); setSearch(""); setError(""); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function startRepeat(review: Review) {
    if (collection.role === "viewer") return;
    setDraft({ ...blankDraft(), restaurant: review.restaurant, district: review.district ?? "", food: review.food, channel: review.channel });
    setEditingId(null); setExistingPhotos([]); setFiles([]); setViewingPhotos(null); setEntryMode("manual"); setScanMessage(""); setScanError(""); setError(""); setOpen(true);
  }
  function chooseRestaurant(review: Review) {
    setDraft((old) => ({ ...old, restaurant: review.restaurant, district: review.district ?? "" }));
  }
  function startEdit(review: Review) { const { id: _id, photos: imageList, ...data } = review; setDraft({ ...data, district: review.district ?? "" }); setEditingId(review.id); setExistingPhotos(imageList); setFiles([]); setOpen(true); setError(""); }
  function change<K extends keyof Draft>(key: K, value: Draft[K]) { setDraft((old) => ({ ...old, [key]: value })); }

  async function scanReceipt(file: File) {
    setScanError(""); setScanMessage("");
    if (file.size === 0 || file.size > 8 * 1024 * 1024) { setScanError("圖片需小於 8 MB。"); return; }
    setScanning(true);
    try {
      const form = new FormData(); form.append("image", file);
      const response = await collectionFetch("/api/scan", collection.id, { method: "POST", body: form });
      const result = await response.json() as { scan?: ScanResult; error?: string };
      if (!response.ok || !result.scan) throw new Error(result.error ?? "無法辨認圖片，請手動填寫。");
      const scan = result.scan;
      const missing = [
        !scan.restaurant && "餐廳名稱",
        !scan.food && "食物",
        !scan.diningDate && "用餐日期",
        !scan.district && "地區",
      ].filter((field): field is string => Boolean(field));
      if (!scan.restaurant && !scan.food && !scan.diningDate && !scan.orderNumber) {
        throw new Error(`AI 未能從圖片辨認${missing.join("、")}。請換一張清晰的圖片，或手動填寫。`);
      }
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
      if (missing.length) {
        setScanError(`AI 未能從圖片辨認${missing.join("、")}。已填入其他可辨認的資料，請手動補上並核對。截圖不會保留。`);
      } else {
        setScanMessage(`已填入圖片中可辨認的資料${scan.district ? `，分店位於${districtNames[scan.district]}` : ""}。請核對資料。截圖不會保留。`);
      }
    } catch (cause) {
      setScanError(cause instanceof Error ? cause.message : "掃描失敗，請稍後再試。");
    } finally {
      setScanning(false);
    }
  }

  async function saveReview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (!draft.restaurant.trim() || !draft.food.trim()) { setError("請填寫餐廳名稱和食物。 "); return; }
    if (!draft.district) { setError("請選擇地區。 "); return; }
    setSaving(true);
    try {
      const endpoint = editingId ? `/api/reviews/${editingId}` : "/api/reviews";
      const response = await collectionFetch(endpoint, collection.id, { method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      const data = await response.json() as { id: string; error?: string };
      if (!response.ok) throw new Error(data.error ?? "儲存失敗");
      rememberDistrict(draft.district);
      const reviewId = editingId ?? data.id;
      let uploadError = "";
      for (const file of files) {
        let photo: Blob;
        try { photo = await compressFoodPhoto(file); }
        catch (cause) { uploadError = cause instanceof Error ? cause.message : "相片壓縮失敗。"; break; }
        const form = new FormData(); form.append("photo", photo, photo === file ? file.name : `${file.name.replace(/\.[^.]+$/, "")}.jpg`);
        const uploaded = await collectionFetch(`/api/reviews/${reviewId}/photos`, collection.id, { method: "POST", body: form });
        if (!uploaded.ok) { const issue = await uploaded.json().catch(() => ({})) as { error?: string }; uploadError = issue.error ?? "部分相片未能上載。"; break; }
      }
      setOpen(false); setFiles([]); setDraft(blankDraft()); setEditingId(null); setMessage(uploadError ? `紀錄已儲存。${uploadError}` : "紀錄已儲存。");
      await loadReviews();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "儲存失敗，請稍後再試。"); }
    finally { setSaving(false); }
  }

  async function deleteReview(review: Review) {
    if (!window.confirm(`確定刪除「${review.restaurant}」的紀錄和相片？`)) return;
    try {
      const response = await collectionFetch(`/api/reviews/${review.id}`, collection.id, { method: "DELETE" });
      if (!response.ok) throw new Error("刪除失敗。");
      setReviews((old) => old.filter((item) => item.id !== review.id)); setMessage("紀錄已刪除。");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "刪除失敗。"); }
  }

  async function deletePhoto(photo: Photo) {
    if (!window.confirm("確定移除此相片？")) return;
    try {
      const response = await collectionFetch(`/api/photos/${photo.id}`, collection.id, { method: "DELETE" });
      if (!response.ok) throw new Error("移除相片失敗。");
      setExistingPhotos((old) => old.filter((item) => item.id !== photo.id));
      await loadReviews();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "移除相片失敗。"); }
  }

  return <main className="shell review-app">
    <header className="topbar"><div className="brand"><span className="brandmark" aria-hidden="true"><img src={pageAsset("favicon.svg?v=2")} alt="" /></span>Closerice</div><div className="review-head-actions"><select className="header-group-select" aria-label="切換食評群組" title="切換食評群組" value={collection.id} onChange={(event) => onSelectCollection(event.target.value)}>{collections.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><a className="settings-link" href="/closerice/settings/"><Settings size={17} aria-hidden="true" />設定</a></div></header>
    <section className="intro"><div><p className="eyebrow">{collection.name} · 食評筆記</p><h1>一齊記低每一餐的味道。</h1><p>由外賣到堂食，下一次落單之前有得參考。</p></div>{collection.role !== "viewer" && <button className="button primary" onClick={startNew}>＋ 新增紀錄</button>}</section>
    <section className="mobile-page-head" aria-label="目前頁面"><p className="eyebrow">{collection.name} · 食評筆記</p><h1>{selectedGroup ? selectedGroup.visits[0].restaurant : statusFilter === "favorite" ? "我的最愛" : "餐廳紀錄"}</h1><p>{loading ? "正在讀取…" : selectedGroup ? `${selectedGroup.visits.length} 次用餐記錄` : statusFilter === "favorite" ? `${restaurantGroups.length} 間餐廳有最愛食評` : `${allRestaurantGroups.length} 間餐廳 · ${reviews.length} 筆食評`}</p></section>
    {message && <div className="notice" role="status">{message} <button className="icon-button" onClick={() => setMessage("")} aria-label="關閉提示">×</button></div>}
    {error && !open && <div className="notice error" role="alert">{error}</div>}
    {selectedGroup ? <section className="restaurant-detail" aria-label={`${selectedGroup.visits[0].restaurant}的食評`}>
      <div className="restaurant-detail-head">
        <button type="button" className="restaurant-back" onClick={() => setSelectedRestaurant(null)}><ArrowLeft size={18} aria-hidden="true" /> 返回餐廳列表</button>
        <h2>{selectedGroup.visits[0].restaurant}</h2>
        <p>{selectedGroup.visits[0].district ? districtNames[selectedGroup.visits[0].district] : "未分類"} · {selectedGroup.visits.length} 次記錄 · 最近於 {selectedGroup.visits[0].diningDate}</p>
        {collection.role !== "viewer" && <button type="button" className="button primary" onClick={() => startRepeat(selectedGroup.visits[0])}>＋ 再記一餐</button>}
      </div>
      <h3 className="visit-heading">每次用餐</h3>
      <div className="list visit-list">{selectedGroup.visits.map((review) => <article className="card" key={review.id}><div className="card-body"><div className="card-top"><div><h2>{review.diningDate}</h2><p className="meta">{review.district ? districtNames[review.district] : "未分類"} · {channelNames[review.channel]} {review.amountCents !== null && `· ${money(review.amountCents)}`}</p></div>{review.status !== "none" && <span className={`status ${review.status}`}>{review.status === "favorite" ? "最愛" : "黑名單"}</span>}</div><p className="food">{review.food}</p>{review.tagIds.length > 0 && <div className="tag-chips">{tags.filter((tag) => review.tagIds.includes(tag.id)).map((tag) => <button className="tag-chip" key={tag.id} onClick={() => { setTagFilter(tag.id); setSelectedRestaurant(null); }}># {tag.name}</button>)}</div>}{review.comment && <p className="comment">{review.comment}</p>}{review.orderNumber && <p className="meta">訂單：{review.orderNumber}</p>}{review.photos.length > 0 && <button className="photo-link" onClick={() => setViewingPhotos(review)}>查看食物相片（{review.photos.length}）</button>}<div className="card-bottom"><span className="score" aria-label={review.score ? `${review.score} 分（滿分 5 分）` : "未評分"}>{review.score ? `${"★".repeat(review.score)}${"☆".repeat(5 - review.score)}` : "未評分"}</span>{collection.role !== "viewer" && <div className="small-actions"><button className="icon-button" onClick={() => startEdit(review)} aria-label={`編輯 ${review.diningDate} 食評`}>編輯</button><button className="icon-button" onClick={() => deleteReview(review)} aria-label={`刪除 ${review.diningDate} 食評`}>刪除</button></div>}</div></div></article>)}</div>
    </section> : <>
      <div className="toolbar"><input className="search" aria-label="搜尋餐廳或食物" placeholder="搜尋餐廳、食物或評語" value={search} onChange={(event) => setSearch(event.target.value)} /><select className="filter" aria-label="按地區篩選" value={districtFilter} onChange={(event) => { setDistrictFilter(event.target.value); if (isDistrict(event.target.value)) rememberDistrict(event.target.value); }}><option value="all">所有地區</option><DistrictChoices recent={recentDistricts} /><option value="unclassified">未分類</option></select><select className="filter" aria-label="按標記篩選" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">所有標記</option><option value="favorite">我的最愛</option><option value="blacklist">黑名單</option></select><select className="filter" aria-label="按用餐方式篩選" value={channelFilter} onChange={(event) => setChannelFilter(event.target.value)}><option value="all">所有方式</option>{Object.entries(channelNames).map(([key, name]) => <option value={key} key={key}>{name}</option>)}</select><select className="filter" aria-label="按自訂標籤篩選" value={activeTagFilter} onChange={(event) => setTagFilter(event.target.value)}><option value="all">所有標籤</option>{tags.map((tag) => <option value={tag.id} key={tag.id}>{tag.name}</option>)}</select></div>
      {loading ? <p role="status">正在讀取紀錄…</p> : reviews.length === 0 ? <section className="empty"><div className="empty-copy"><h2>第一餐，從這裏開始。</h2><p>新增一筆食評。餐廳、食物和分數都會儲存；食物相片只在你選擇上載時才會附上。</p>{collection.role !== "viewer" && <button className="button primary" onClick={startNew}>新增第一筆紀錄</button>}</div><img src={pageAsset("food-hero.png")} alt="一盒叉燒飯和青菜" /></section> : restaurantGroups.length === 0 ? <section className="no-results"><Heart size={26} aria-hidden="true" /><h2>{statusFilter === "favorite" && !search && channelFilter === "all" ? "仲未有最愛食評" : "找不到餐廳"}</h2><p>{statusFilter === "favorite" && !search && channelFilter === "all" ? "開啟食評的「編輯」，標記為最愛後就會顯示在這裏。" : "試試其他搜尋字眼或篩選條件。"}</p></section> : <section className="list restaurant-list" aria-label="餐廳列表">{restaurantGroups.map((group) => { const latest = group.visits[0]; const total = allRestaurantGroups.find((item) => item.key === group.key)?.visits.length ?? group.visits.length; const lastRated = group.visits.find((visit) => visit.score !== null); return <article className="card restaurant-card" key={group.key}><button type="button" className="restaurant-card-button" onClick={() => { setSelectedRestaurant(group.key); window.scrollTo({ top: 0, behavior: "smooth" }); }} aria-label={`查看 ${latest.restaurant} 的 ${total} 次食評`}><div className="card-top"><div><h2>{latest.restaurant}</h2><p className="meta">{latest.district ? districtNames[latest.district] : "未分類"} · {total} 次記錄</p></div><ChevronRight size={20} className="restaurant-chevron" aria-hidden="true" /></div><p className="restaurant-latest-label">最近一次 · {latest.diningDate}</p><p className="food">{latest.food}</p><div className="restaurant-card-footer"><span>{lastRated?.score ? `${"★".repeat(lastRated.score)}${"☆".repeat(5 - lastRated.score)}` : "未評分"}</span><span>查看全部食評</span></div></button></article>; })}</section>}
    </>}
    <nav className={`mobile-tabs ${collection.role === "viewer" ? "viewer-tabs" : ""}`} aria-label="底部分頁"><button type="button" className={`mobile-tab ${!open && statusFilter !== "favorite" ? "active" : ""}`} aria-current={!open && statusFilter !== "favorite" ? "page" : undefined} onClick={() => showReviews("all")}><span className="mobile-tab-icon"><List size={22} strokeWidth={2.2} aria-hidden="true" /></span><span>食評</span></button>{collection.role !== "viewer" && <button type="button" className={`mobile-tab ${open ? "active" : ""}`} aria-current={open ? "page" : undefined} onClick={startNew}><span className="mobile-tab-icon"><Plus size={23} strokeWidth={2.4} aria-hidden="true" /></span><span>新增</span></button>}<button type="button" className={`mobile-tab ${!open && statusFilter === "favorite" ? "active" : ""}`} aria-current={!open && statusFilter === "favorite" ? "page" : undefined} onClick={() => showReviews("favorite")}><span className="mobile-tab-icon"><Heart size={22} strokeWidth={2.2} aria-hidden="true" /></span><span>最愛</span></button><a className="mobile-tab" href="/closerice/settings/"><span className="mobile-tab-icon"><Settings size={22} strokeWidth={2.2} aria-hidden="true" /></span><span>設定</span></a></nav>
    {viewingPhotos && <div className="overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setViewingPhotos(null); }}><section className="photo-dialog" role="dialog" aria-modal="true" aria-label={`${viewingPhotos.restaurant}的食物相片`}><div className="dialog-head"><h2>{viewingPhotos.restaurant}的食物相片</h2><button className="icon-button" onClick={() => setViewingPhotos(null)} aria-label="關閉相片">×</button></div><div className="photo-viewer-grid">{viewingPhotos.photos.map((photo) => <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer"><img src={photo.url} alt={photo.name} loading="lazy" /></a>)}</div></section></div>}
    {open && <div className="overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div className="dialog-head"><div><h2 id="dialog-title">{editingId ? "編輯食評" : "新增食評"}</h2><p className="hint">餐廳、食物和地區為必填；其他資料可以稍後補上。</p></div><button className="icon-button" onClick={() => setOpen(false)} aria-label="關閉">×</button></div>{error && <div className="notice error" role="alert">{error}</div>}<form onSubmit={saveReview}>{!editingId && <div className="entry-mode" role="group" aria-label="新增方式"><button type="button" className={entryMode === "manual" ? "active" : ""} aria-pressed={entryMode === "manual"} onClick={() => setEntryMode("manual")}>手動填寫</button><button type="button" className={entryMode === "scan" ? "active" : ""} aria-pressed={entryMode === "scan"} onClick={() => setEntryMode("scan")}>掃描圖片</button></div>}{!editingId && entryMode === "scan" && <div className="scan-box"><div className="scan-heading"><span className="scan-icon"><ScanLine size={23} aria-hidden="true" /></span><div><strong>掃描訂單截圖或收據</strong><p>圖片會傳給 Kimi 辨認，但不會儲存在食評。</p></div></div><input id="receipt-scan" className="scan-input" type="file" accept="image/jpeg,image/png,image/webp" disabled={scanning} onChange={(event) => { const file = event.target.files?.[0]; if (file) void scanReceipt(file); event.target.value = ""; }} /><label className="button secondary scan-pick" htmlFor="receipt-scan">{scanning ? "正在掃描…" : "選擇圖片並掃描"}</label>{scanMessage && <p className="scan-feedback" role="status">{scanMessage}</p>}{scanError && <p className="scan-feedback error-text" role="alert">{scanError}</p>}</div>}<div className="form-grid"><label className="field">用餐日期<input type="date" required value={draft.diningDate} onChange={(event) => change("diningDate", event.target.value)} /></label><label className="field">用餐方式<select value={draft.channel} onChange={(event) => change("channel", event.target.value as Channel)}>{Object.entries(channelNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label><label className="field full">地區 *<select required value={draft.district} onChange={(event) => { const value = event.target.value; change("district", value as District | ""); if (isDistrict(value)) rememberDistrict(value); }}><option value="">請選擇地區</option><DistrictChoices recent={recentDistricts} /></select></label><label className="field full">餐廳名稱（包括分店） *<input required maxLength={120} placeholder="例如：某某茶餐廳（旺角店）" value={draft.restaurant} onChange={(event) => change("restaurant", event.target.value)} /></label>{!editingId && suggestedGroups.length > 0 && <div className="restaurant-suggestions field full" role="group" aria-label="以往用過的餐廳"><strong>這間餐廳以前有記錄</strong><p>選擇同一間餐廳和地區，方便日後一起查看。</p>{suggestedGroups.map((group) => { const latest = group.visits[0]; return <button type="button" key={group.key} onClick={() => chooseRestaurant(latest)}><span><b>{latest.restaurant}</b><small>{latest.district ? districtNames[latest.district] : "未分類"} · {group.visits.length} 次 · 最近 {latest.diningDate}</small></span><ChevronRight size={17} aria-hidden="true" /></button>; })}</div>}<label className="field full">食物 *<textarea required maxLength={1000} placeholder="例如：叉燒飯、凍檸茶" value={draft.food} onChange={(event) => change("food", event.target.value)} /></label><label className="field">訂單編號<input maxLength={80} value={draft.orderNumber} onChange={(event) => change("orderNumber", event.target.value)} /></label><label className="field">實付金額（港幣）<input type="number" min="0" step="0.01" inputMode="decimal" value={draft.amountCents === null ? "" : (draft.amountCents / 100).toFixed(2)} onChange={(event) => change("amountCents", event.target.value === "" ? null : Math.round(Number(event.target.value) * 100))} /></label><div className="field full"><span>你的評分</span><div className="rating" role="group" aria-label="評分">{[1, 2, 3, 4, 5].map((n) => <button type="button" key={n} className={draft.score !== null && n <= draft.score ? "active" : ""} aria-label={`${n} 分`} onClick={() => change("score", draft.score === n ? null : n)}>★</button>)}</div></div><label className="field full">你的評語<textarea maxLength={3000} placeholder="味道、份量、送餐速度，或者下次會否再叫" value={draft.comment} onChange={(event) => change("comment", event.target.value)} /></label><div className="field full"><span>標記</span><div className="toggle-row"><button type="button" className={`toggle ${draft.status === "favorite" ? "selected" : ""}`} onClick={() => change("status", draft.status === "favorite" ? "none" : "favorite")}>☆ 最愛</button><button type="button" className={`toggle ${draft.status === "blacklist" ? "selected" : ""}`} onClick={() => change("status", draft.status === "blacklist" ? "none" : "blacklist")}>⊘ 黑名單</button></div></div><div className="field full"><span>自訂標籤（每筆最多 10 個）</span><div className="tag-options">{tags.map((tag) => <div className="tag-option" key={tag.id}><button type="button" className={`tag-choice ${draft.tagIds.includes(tag.id) ? "selected" : ""}`} aria-pressed={draft.tagIds.includes(tag.id)} onClick={() => change("tagIds", draft.tagIds.includes(tag.id) ? draft.tagIds.filter((id) => id !== tag.id) : draft.tagIds.length < 10 ? [...draft.tagIds, tag.id] : draft.tagIds)}># {tag.name}</button>{(collection.role === "owner" || tag.createdBy === user.id) && <button type="button" className="tag-delete" aria-label={`刪除標籤 ${tag.name}`} onClick={() => { if (window.confirm(`刪除「${tag.name}」標籤？此群組的食評將一併移除該標籤。`)) void onDeleteTag(tag.id).then(() => { change("tagIds", draft.tagIds.filter((id) => id !== tag.id)); void loadReviews(); }).catch((cause) => setError(cause instanceof Error ? cause.message : "刪除標籤失敗。")); }}>×</button>}</div>)}</div><div className="tag-create"><input aria-label="新標籤名稱" maxLength={24} placeholder="例如：檸茶正" value={newTagName} onChange={(event) => setNewTagName(event.target.value)} /><button type="button" className="button secondary" disabled={!newTagName.trim()} onClick={() => void onCreateTag(newTagName).then((id) => { setNewTagName(""); change("tagIds", [...draft.tagIds, id]); }).catch((cause) => setError(cause instanceof Error ? cause.message : "新增標籤失敗。"))}>新增標籤</button></div></div><label className="field full">食物相片（每筆最多 5 張）<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, Math.max(0, 5 - existingPhotos.length)))} />{files.length > 0 && <span className="hint">待上載：{files.map((file) => file.name).join("、")}</span>}</label>{existingPhotos.length > 0 && <div className="field full"><span>已儲存相片</span><div className="photo-grid">{existingPhotos.map((photo) => <div className="photo-tile" key={photo.id}><img src={photo.url} alt={photo.name} /><button type="button" onClick={() => deletePhoto(photo)} aria-label={`移除${photo.name}`}>×</button></div>)}</div></div>}</div><div className="dialog-actions"><button type="button" className="button secondary" onClick={() => setOpen(false)}>取消</button><button type="submit" className="button primary" disabled={saving}>{saving ? "儲存中…" : "儲存紀錄"}</button></div></form></section></div>}
  </main>;
}
