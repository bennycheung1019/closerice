"use client";

import { useEffect, useState } from "react";
import { collectionFetch, responseJson } from "../lib/client-api";
import { apiUrl } from "../lib/client-urls";
import ReviewApp from "./review-app";
import SettingsPage from "./settings-page";

export type CollectionSummary = { id: string; name: string; role: "owner" | "editor" | "viewer" };
export type CollectionTag = { id: string; name: string; createdBy: string };
type Session = { user: { id: string; email: string; name: string }; collections: CollectionSummary[]; pendingTransfers: Array<{ collectionId: string; name: string }> };
const settingsPage = typeof window !== "undefined" && /^\/closerice\/settings(?:\/|\/index\.html)?$/.test(window.location.pathname);

export default function CollectionApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [tagData, setTagData] = useState<{ collectionId: string; tags: CollectionTag[] }>({ collectionId: "", tags: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("authError") ? "Google 登入未完成，請重試。" : "");

  async function loadSession(preferredId?: string) {
    const response = await collectionFetch("/api/me");
    if (response.status === 401) { setSession(null); setSelectedId(""); return null; }
    const data = await responseJson<Session>(response);
    setSession(data);
    const saved = localStorage.getItem("closerice_collection_id") ?? "";
    setSelectedId((old) => {
      const next = [preferredId, old, saved, data.collections[0]?.id].find((id) => id && data.collections.some((item) => item.id === id)) ?? "";
      if (next) localStorage.setItem("closerice_collection_id", next);
      else localStorage.removeItem("closerice_collection_id");
      return next;
    });
    return data;
  }

  function selectCollection(id: string) {
    setSelectedId(id);
    localStorage.setItem("closerice_collection_id", id);
  }

  async function loadTags(collectionId: string) {
    const data = await responseJson<{ tags: CollectionTag[] }>(await collectionFetch("/api/tags", collectionId));
    setTagData({ collectionId, tags: data.tags });
  }

  useEffect(() => {
    let cancelled = false;
    const url = new URL(window.location.href);
    if (url.searchParams.has("invite")) sessionStorage.setItem("closerice_invite", url.searchParams.get("invite")!);
    if (url.searchParams.has("invite") || url.searchParams.has("authError")) {
      url.searchParams.delete("invite"); url.searchParams.delete("authError");
      window.history.replaceState(null, "", url);
    }
    void (async () => {
      try {
        const current = await loadSession();
        const invite = sessionStorage.getItem("closerice_invite");
        if (current && invite) {
          const accepted = await responseJson<{ collectionId: string }>(await collectionFetch("/api/invites/accept", undefined, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: invite }),
          }));
          sessionStorage.removeItem("closerice_invite");
          await loadSession(accepted.collectionId);
          if (!cancelled) setError("");
        }
      } catch (cause) { if (!cancelled) setError(cause instanceof Error ? cause.message : "暫時無法讀取帳戶。"); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedId || settingsPage) return;
    void Promise.resolve().then(() => loadTags(selectedId)).catch((cause) => setError(cause instanceof Error ? cause.message : "無法讀取標籤。"));
  }, [selectedId]);

  async function createTag(name: string): Promise<string> {
    const data = await responseJson<{ id: string }>(await collectionFetch("/api/tags", selectedId, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }),
    }));
    await loadTags(selectedId);
    return data.id;
  }

  async function deleteTag(id: string) {
    await responseJson(await collectionFetch(`/api/tags/${id}`, selectedId, { method: "DELETE" }));
    await loadTags(selectedId);
  }

  async function logout() {
    await collectionFetch("/api/auth/logout", undefined, { method: "POST" });
    localStorage.removeItem("closerice_collection_id");
    setSession(null); setSelectedId(""); setTagData({ collectionId: "", tags: [] });
  }

  if (loading) return <main className="shell account-page"><p role="status">正在載入 Closerice…</p></main>;
  if (!session) return <main className="shell account-page"><div className="login-card"><div className="brand">Closerice</div><h1>一齊記低每一餐。</h1><p>Closerice 是與家人、朋友和同事分享食評的筆記。建立不同群組，記錄餐廳、食物、評分和相片，並由群組擁有人決定誰可以查看或編輯。</p><a className="button primary" href={apiUrl("/api/auth/google/start")}>使用 Google 登入</a>{typeof window !== "undefined" && sessionStorage.getItem("closerice_invite") && <p className="hint">登入後會自動加入受邀群組。</p>}{error && <p className="notice error" role="alert">{error}</p>}<nav className="legal-links" aria-label="網站資料"><a href="/closerice/privacy.html">私隱政策</a><a href="/closerice/terms.html">使用條款</a></nav></div></main>;

  const collection = session.collections.find((item) => item.id === selectedId);
  if (settingsPage) return <><SettingsPage user={session.user} collections={session.collections} pendingTransfers={session.pendingTransfers} selectedId={selectedId} onSelect={selectCollection} onSessionChanged={loadSession} onLogout={logout} />{error && <div className="global-notice notice error" role="alert">{error}<button className="icon-button" onClick={() => setError("")} aria-label="關閉">×</button></div>}</>;

  return <>
    {error && <div className="global-notice notice error" role="alert">{error}<button className="icon-button" onClick={() => setError("")} aria-label="關閉">×</button></div>}
    {collection ? <ReviewApp key={collection.id} collection={collection} collections={session.collections} onSelectCollection={selectCollection} user={session.user} tags={tagData.collectionId === selectedId ? tagData.tags : []} onCreateTag={createTag} onDeleteTag={deleteTag} /> : <main className="shell account-page"><div className="login-card"><h1>建立第一個食評群組</h1><p>建立後便可邀請家人或同事一起記錄。</p><a className="button primary" href="/closerice/settings/">前往設定</a></div></main>}
  </>;
}
