"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { collectionFetch } from "../lib/client-api";
import { restaurantReference, type RestaurantProfile } from "../lib/restaurant-profile";
import { pageAsset } from "../lib/client-urls";

type Props = { profile: RestaurantProfile | null; name: string; district: string; collectionId: string; canEdit: boolean; onSaved: () => Promise<void> };
export default function RestaurantProfilePanel({ profile, name, district, collectionId, canEdit, onSaved }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(profile);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const reference = restaurantReference(profile);
  const icons = { OpenRice: "platforms/openrice-app-icon.jpg", Foodpanda: "platforms/foodpanda-app-icon.jpg" };
  const change = <K extends keyof RestaurantProfile>(key: K, value: RestaurantProfile[K]) => setDraft((old) => old ? { ...old, [key]: value } : old);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setSaving(true); setError("");
    try {
      const { openriceUrl, foodpandaUrl, reviewNotes } = draft;
      const response = await collectionFetch(`/api/restaurants/${draft.id}`, collectionId, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedVersion: draft.version, openriceUrl, foodpandaUrl, reviewNotes, reviewState: openriceUrl || foodpandaUrl ? "verified" : "pending" }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "暫時無法儲存餐廳資料。");
      await onSaved(); setEditing(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "請稍後再試。"); }
    finally { setSaving(false); }
  }
  return <>
    <div className="restaurant-profile-panel restaurant-openrice-panel">
      <div className="restaurant-profile-info">
        {reference
          ? <a className="restaurant-app-link" href={reference.url} target="_blank" rel="noopener noreferrer" aria-label={reference.label} title={reference.label}><img src={pageAsset(icons[reference.provider])} width={32} height={32} alt={reference.provider} /></a>
          : <p className="restaurant-openrice-pending">餐廳連結待確認</p>}
        {canEdit && profile && <button type="button" className="restaurant-profile-edit" aria-label="編輯餐廳連結" title="編輯餐廳連結" onClick={() => { setDraft(profile); setError(""); setEditing(true); }}><Pencil size={17} aria-hidden="true" /></button>}
      </div>
    </div>
    {editing && draft && <div className="overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setEditing(false); }}><section className="dialog restaurant-profile-dialog" role="dialog" aria-modal="true" aria-labelledby="restaurant-profile-title"><div className="dialog-head"><div><h2 id="restaurant-profile-title">編輯餐廳連結</h2><p className="hint">{name} · {district || "未分類"}</p></div><button type="button" className="icon-button" aria-label="關閉餐廳連結設定" disabled={saving} onClick={() => setEditing(false)}>×</button></div>{error && <p className="notice error" role="alert">{error}</p>}<form onSubmit={save}>
      <label className="field">OpenRice 餐廳連結<input type="url" maxLength={2000} value={draft.openriceUrl ?? ""} onChange={(event) => change("openriceUrl", event.target.value)} placeholder="已確認分店的 OpenRice 餐廳主頁" /></label>
      <label className="field">Foodpanda 餐廳連結<input type="url" maxLength={2000} value={draft.foodpandaUrl ?? ""} onChange={(event) => change("foodpandaUrl", event.target.value)} placeholder="已確認分店的 Foodpanda 餐廳主頁" /></label>
      <p className="hint">請先核對餐廳名稱及分店。連結會開啟標示的原網站，不會下載或儲存相片。</p><div className="dialog-actions"><button type="button" className="button secondary" disabled={saving} onClick={() => setEditing(false)}>取消</button><button className="button primary" disabled={saving}>{saving ? "儲存中…" : "儲存連結"}</button></div>
    </form></section></div>}
  </>;
}
