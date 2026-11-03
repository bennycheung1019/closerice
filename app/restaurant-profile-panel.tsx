"use client";

import { useState } from "react";
import { ExternalLink, MapPin, Pencil, Store } from "lucide-react";
import { collectionFetch } from "../lib/client-api";
import { googleMapsUrl, usableCover, type RestaurantProfile } from "../lib/restaurant-profile";

type Props = { profile: RestaurantProfile | null; name: string; district: string; collectionId: string; canEdit: boolean; onSaved: () => Promise<void> };
function RestaurantCover({ profile }: { profile: RestaurantProfile | null }) {
  const [failed, setFailed] = useState(false);
  return profile && usableCover(profile) && !failed ? <figure className="restaurant-cover"><img src={profile.coverPhotoUrl} alt={`${profile.name}的餐廳封面`} referrerPolicy="no-referrer" loading="lazy" onError={() => setFailed(true)} /><figcaption><a href={profile.coverSourceUrl} target="_blank" rel="noopener noreferrer">{profile.coverAttribution} · {profile.coverLicense}</a></figcaption></figure> : <div className="restaurant-cover-fallback"><Store size={37} aria-hidden="true" /><span>餐廳封面待補充</span></div>;
}

export default function RestaurantProfilePanel({ profile, name, district, collectionId, canEdit, onSaved }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(profile);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const change = <K extends keyof RestaurantProfile>(key: K, value: RestaurantProfile[K]) => setDraft((old) => old ? { ...old, [key]: value } : old);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setSaving(true); setError("");
    try {
      const { address, region, sourceUrl, coverPhotoUrl, coverSourceUrl, coverAttribution, coverLicense, coverUsage, reviewNotes } = draft;
      const response = await collectionFetch(`/api/restaurants/${draft.id}`, collectionId, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedVersion: draft.version, address, region, sourceUrl, coverPhotoUrl, coverSourceUrl, coverAttribution, coverLicense, coverUsage, reviewNotes, reviewState: draft.reviewState === "uncertain" ? "uncertain" : address ? "verified" : "pending" }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "暫時無法儲存餐廳資料。");
      await onSaved(); setEditing(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "請稍後再試。"); }
    finally { setSaving(false); }
  }
  return <>
    <div className="restaurant-profile-panel">
      <RestaurantCover key={profile?.coverPhotoUrl || "missing"} profile={profile} />
      <div className="restaurant-profile-info">
        <div className="restaurant-address"><MapPin size={18} aria-hidden="true" /><span>{profile?.address || "地址待補充"}</span></div>
        {profile?.reviewState === "uncertain" && <p className="restaurant-check-state">分店資料待確認</p>}
        {profile?.reviewNotes && profile.reviewState === "uncertain" && <p className="restaurant-profile-note">{profile.reviewNotes}</p>}
        <div className="restaurant-profile-actions"><a className="button secondary" href={googleMapsUrl(name, district, profile?.address ?? "", profile?.region ?? "香港")} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} aria-hidden="true" /> Google 地圖</a>{canEdit && profile && <button type="button" className="restaurant-profile-edit" onClick={() => { setDraft(profile); setError(""); setEditing(true); }}><Pencil size={15} aria-hidden="true" />編輯餐廳資料</button>}</div>
        {profile?.coverSourceUrl && !usableCover(profile) && <a className="restaurant-source" href={profile.coverSourceUrl} target="_blank" rel="noopener noreferrer">查看原網站相片 ↗</a>}
        {profile?.sourceUrl && <a className="restaurant-source" href={profile.sourceUrl} target="_blank" rel="noopener noreferrer">地址來源 ↗</a>}
      </div>
    </div>
    {editing && draft && <div className="overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setEditing(false); }}><section className="dialog restaurant-profile-dialog" role="dialog" aria-modal="true" aria-labelledby="restaurant-profile-title"><div className="dialog-head"><div><h2 id="restaurant-profile-title">編輯餐廳資料</h2><p className="hint">{name} · {district || "未分類"}</p></div><button type="button" className="icon-button" aria-label="關閉餐廳資料" disabled={saving} onClick={() => setEditing(false)}>×</button></div>{error && <p className="notice error" role="alert">{error}</p>}<form onSubmit={save}>
      <label className="field">地址<textarea maxLength={500} value={draft.address} onChange={(event) => change("address", event.target.value)} placeholder="街道、樓層及舖號" /></label>
      <label className="field">地區／城市<input maxLength={80} required value={draft.region} onChange={(event) => change("region", event.target.value)} /></label>
      <label className="field">地址來源網址<input type="url" maxLength={2000} value={draft.sourceUrl} onChange={(event) => change("sourceUrl", event.target.value)} placeholder="https://" /></label>
      <label className="restaurant-uncertain-choice"><input type="checkbox" checked={draft.reviewState === "uncertain"} onChange={(event) => change("reviewState", event.target.checked ? "uncertain" : "pending")} />分店資料仍待確認</label>
      {draft.reviewState === "uncertain" && <label className="field">待確認事項<textarea maxLength={1000} value={draft.reviewNotes} onChange={(event) => change("reviewNotes", event.target.value)} /></label>}
      <details className="restaurant-cover-settings"><summary>餐廳封面及來源</summary><p className="hint">只使用你擁有或獲准使用的圖片網址。Google Maps、Street View 和 OpenRice 相片請在原網站查看。</p>
        <label className="field">使用方式<select value={draft.coverUsage} onChange={(event) => { change("coverUsage", event.target.value as RestaurantProfile["coverUsage"]); if (!["owned", "licensed"].includes(event.target.value)) change("coverPhotoUrl", ""); }}><option value="missing">尚未有封面</option><option value="owned">自有圖片</option><option value="licensed">已獲授權使用</option><option value="link_only">只保留原圖連結</option><option value="restricted">尚未取得使用授權</option></select></label>
        {(draft.coverUsage === "owned" || draft.coverUsage === "licensed") && <label className="field">封面圖片網址<input type="url" maxLength={2000} value={draft.coverPhotoUrl} onChange={(event) => change("coverPhotoUrl", event.target.value)} placeholder="https://" /></label>}
        <label className="field">圖片來源頁面<input type="url" maxLength={2000} value={draft.coverSourceUrl} onChange={(event) => change("coverSourceUrl", event.target.value)} placeholder="https://" /></label>
        <label className="field">攝影者／署名<input maxLength={500} value={draft.coverAttribution} onChange={(event) => change("coverAttribution", event.target.value)} /></label>
        <label className="field">授權或使用依據<input maxLength={300} value={draft.coverLicense} onChange={(event) => change("coverLicense", event.target.value)} placeholder="例如：CC BY-SA 4.0 或攝影者授權" /></label>
      </details><p className="hint">你儲存的餐廳資料會保留，自動補充不會覆寫。</p><div className="dialog-actions"><button type="button" className="button secondary" disabled={saving} onClick={() => setEditing(false)}>取消</button><button className="button primary" disabled={saving}>{saving ? "儲存中…" : "儲存餐廳資料"}</button></div>
    </form></section></div>}
  </>;
}
