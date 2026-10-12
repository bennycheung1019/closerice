"use client";

import { useEffect, useState } from "react";
import { collectionFetch, responseJson } from "../lib/client-api";
import { apiUrl } from "../lib/client-urls";
import ReviewApp from "./review-app";

export type CollectionSummary = { id: string; name: string; role: "owner" | "editor" | "viewer" };
export type CollectionTag = { id: string; name: string; createdBy: string };
type Session = { user: { id: string; email: string; name: string }; collections: CollectionSummary[]; pendingTransfers: Array<{ collectionId: string; name: string }> };
type Member = { id: string; email: string; name: string; role: "owner" | "editor" | "viewer" };
type Members = { owner: Member | null; members: Member[]; invites: Array<{ id: string; email: string; role: "editor" | "viewer"; expiresAt: number }>; transfer: { toUserId: string; expiresAt: number } | null };

export default function CollectionApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [tagData, setTagData] = useState<{ collectionId: string; tags: CollectionTag[] }>({ collectionId: "", tags: [] });
  const [members, setMembers] = useState<Members | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("authError") ? "Google 登入未完成，請重試。" : "");
  const [manageOpen, setManageOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("editor");
  const [inviteLink, setInviteLink] = useState("");
  const [invitedEmail, setInvitedEmail] = useState("");

  async function loadSession(preferredId?: string) {
    const response = await collectionFetch("/api/me");
    if (response.status === 401) { setSession(null); setSelectedId(""); return null; }
    const data = await responseJson<Session>(response);
    setSession(data);
    const saved = localStorage.getItem("closerice_collection_id") ?? "";
    setSelectedId((old) => {
      const next = [preferredId, old, saved, data.collections[0]?.id].find((id) => id && data.collections.some((item) => item.id === id)) ?? "";
      if (next) localStorage.setItem("closerice_collection_id", next);
      return next;
    });
    return data;
  }

  async function loadTags(collectionId: string) {
    const data = await responseJson<{ tags: CollectionTag[] }>(await collectionFetch("/api/tags", collectionId));
    setTagData({ collectionId, tags: data.tags });
  }

  async function loadMembers(collectionId: string) {
    setMembers(await responseJson<Members>(await collectionFetch(`/api/collections/${collectionId}/members`)));
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
          const accepted = await responseJson<{ collectionId: string }>(await collectionFetch("/api/invites/accept", undefined, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: invite }) }));
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
    if (!selectedId) return;
    void Promise.resolve().then(() => loadTags(selectedId)).catch((cause) => setError(cause instanceof Error ? cause.message : "無法讀取標籤。"));
  }, [selectedId]);

  async function createCollection(event: React.FormEvent) {
    event.preventDefault();
    try {
      const data = await responseJson<{ id: string }>(await collectionFetch("/api/collections", undefined, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newCollectionName }) }));
      setNewCollectionName(""); setCreating(false); setError("");
      await loadSession(data.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "新增群組失敗。"); }
  }

  async function createTag(name: string): Promise<string> {
    const data = await responseJson<{ id: string }>(await collectionFetch("/api/tags", selectedId, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }));
    await loadTags(selectedId);
    return data.id;
  }

  async function deleteTag(id: string) {
    await responseJson(await collectionFetch(`/api/tags/${id}`, selectedId, { method: "DELETE" }));
    await loadTags(selectedId);
  }

  async function manageAction(path: string, init: RequestInit) {
    try {
      await responseJson(await collectionFetch(path, selectedId, init));
      setError("");
      await loadMembers(selectedId);
      await loadSession(selectedId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "操作失敗。"); }
  }

  async function sendInvite(event: React.FormEvent) {
    event.preventDefault();
    try {
      const data = await responseJson<{ link: string }>(await collectionFetch(`/api/collections/${selectedId}/invites`, selectedId, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: inviteEmail, role: inviteRole }) }));
      setInviteLink(data.link); setInvitedEmail(inviteEmail); setInviteEmail(""); setError("");
      await loadMembers(selectedId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "邀請失敗。"); }
  }

  async function acceptTransfer() {
    try {
      await responseJson(await collectionFetch(`/api/collections/${selectedId}/transfer/accept`, selectedId, { method: "POST" }));
      await loadSession(selectedId);
      if (manageOpen) await loadMembers(selectedId);
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "無法接受轉讓。"); }
  }

  async function logout() {
    await collectionFetch("/api/auth/logout", undefined, { method: "POST" });
    localStorage.removeItem("closerice_collection_id");
    setSession(null); setSelectedId(""); setTagData({ collectionId: "", tags: [] });
  }

  if (loading) return <main className="shell account-page"><p role="status">正在載入 Closerice…</p></main>;
  if (!session) return <main className="shell account-page"><div className="login-card"><div className="brand">Closerice</div><h1>一齊記低每一餐。</h1><p>登入後可建立自己的食評群組，並與家人或同事分享。</p><a className="button primary" href={apiUrl("/api/auth/google/start")}>使用 Google 登入</a>{typeof window !== "undefined" && sessionStorage.getItem("closerice_invite") && <p className="hint">登入後會自動加入受邀群組。</p>}{error && <p className="notice error" role="alert">{error}</p>}</div></main>;

  const collection = session.collections.find((item) => item.id === selectedId);
  return <>
    {error && <div className="global-notice notice error" role="alert">{error}<button className="icon-button" onClick={() => setError("")} aria-label="關閉">×</button></div>}
    <div className="collection-bar shell"><div className="collection-picker"><label htmlFor="collection-select">食評群組</label><select id="collection-select" value={selectedId} onChange={(event) => { setSelectedId(event.target.value); localStorage.setItem("closerice_collection_id", event.target.value); setManageOpen(false); }}>{session.collections.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div><div className="collection-actions"><button className="button secondary" onClick={() => setCreating((old) => !old)}>＋ 新增群組</button>{collection?.role === "owner" && <button className="button secondary" onClick={() => { setManageOpen(true); setInviteLink(""); void loadMembers(selectedId).catch((cause) => setError(cause instanceof Error ? cause.message : "無法讀取成員。")); }}>成員與權限</button>}<button className="button ghost" onClick={() => void logout()}>登出</button></div></div>
    {creating && <form className="shell create-collection" onSubmit={createCollection}><label>新群組名稱<input required maxLength={60} value={newCollectionName} onChange={(event) => setNewCollectionName(event.target.value)} placeholder="例如：Home、Work" /></label><button className="button primary" type="submit">建立群組</button></form>}
    {collection && session.pendingTransfers.some((item) => item.collectionId === selectedId) && <div className="shell transfer-banner notice"><span>群組擁有人邀請你接手「{collection.name}」。</span><button className="button primary" onClick={() => void acceptTransfer()}>接受擁有權</button></div>}
    {collection ? <ReviewApp key={collection.id} collection={collection} user={session.user} tags={tagData.collectionId === selectedId ? tagData.tags : []} onCreateTag={createTag} onDeleteTag={deleteTag} /> : <main className="shell account-page"><h1>建立第一個食評群組</h1><p>建立後便可邀請家人或同事一起記錄。</p><button className="button primary" onClick={() => setCreating(true)}>新增群組</button></main>}
    {manageOpen && collection && <div className="overlay manage-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setManageOpen(false); }}><section className="dialog manage-dialog" role="dialog" aria-modal="true" aria-label="成員與權限"><div className="dialog-head"><div><h2>{collection.name} · 成員</h2><p className="hint">擁有人可以管理邀請、權限和擁有權。</p></div><button className="icon-button" onClick={() => setManageOpen(false)} aria-label="關閉">×</button></div>{!members ? <p>正在載入…</p> : <><div className="member-list">{members.owner && <div className="member-row"><span><strong>{members.owner.name || members.owner.email}</strong><small>{members.owner.email}</small></span><b>擁有人</b></div>}{members.members.map((member) => <div className="member-row" key={member.id}><span><strong>{member.name || member.email}</strong><small>{member.email}</small></span>{collection.role === "owner" ? <div className="member-controls"><select aria-label={`${member.email} 權限`} value={member.role} onChange={(event) => void manageAction(`/api/collections/${selectedId}/members/${member.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: event.target.value }) })}><option value="editor">可編輯</option><option value="viewer">只可查看</option></select><button className="icon-button" aria-label={`移除 ${member.email}`} onClick={() => { if (window.confirm(`移除 ${member.email}？`)) void manageAction(`/api/collections/${selectedId}/members/${member.id}`, { method: "DELETE" }); }}>移除</button><button className="icon-button" onClick={() => { if (window.confirm(`把「${collection.name}」的擁有權轉讓給 ${member.email}？對方接受後才會生效。`)) void manageAction(`/api/collections/${selectedId}/transfer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: member.id }) }); }}>轉讓</button></div> : <b>{member.role === "editor" ? "可編輯" : "只可查看"}</b>}</div>)}</div>{collection.role === "owner" && <><h3>邀請成員</h3><form className="invite-form" onSubmit={sendInvite}><input type="email" required placeholder="對方的 Google 電郵" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} /><select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as "editor" | "viewer")}><option value="editor">可編輯</option><option value="viewer">只可查看</option></select><button className="button primary" type="submit">產生邀請連結</button></form>{inviteLink && <div className="invite-link notice"><p>請把連結傳給 {invitedEmail || "受邀者"}；只有受邀電郵登入後可加入。</p><input readOnly aria-label="邀請連結" value={inviteLink} /><button className="button secondary" onClick={() => void navigator.clipboard.writeText(inviteLink)}>複製連結</button></div>}{members.invites.length > 0 && <><h3>待接受邀請</h3>{members.invites.map((item) => <div className="member-row" key={item.id}><span>{item.email} · {item.role === "editor" ? "可編輯" : "只可查看"}</span><button className="icon-button" onClick={() => void manageAction(`/api/collections/${selectedId}/invites/${item.id}`, { method: "DELETE" })}>撤銷</button></div>)}</>}{members.transfer && <p className="notice">擁有權轉讓待接受。<button className="icon-button" onClick={() => void manageAction(`/api/collections/${selectedId}/transfer`, { method: "DELETE" })}>取消轉讓</button></p>}</>}</>}</section></div>}
  </>;
}
