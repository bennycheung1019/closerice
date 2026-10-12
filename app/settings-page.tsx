"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ChevronRight, Heart, List, Plus, Settings, X } from "lucide-react";
import { collectionFetch, responseJson } from "../lib/client-api";
import type { CollectionSummary } from "./collection-app";

type Member = { id: string; email: string; name: string; role: "owner" | "editor" | "viewer" };
type Members = { owner: Member | null; members: Member[]; invites: Array<{ id: string; email: string; role: "editor" | "viewer"; expiresAt: number }>; transfer: { toUserId: string; expiresAt: number } | null };

export default function SettingsPage({ user, collections, pendingTransfers, selectedId, onSelect, onSessionChanged, onLogout }: {
  user: { id: string; email: string; name: string };
  collections: CollectionSummary[];
  pendingTransfers: Array<{ collectionId: string; name: string }>;
  selectedId: string;
  onSelect: (id: string) => void;
  onSessionChanged: (preferredId?: string) => Promise<unknown>;
  onLogout: () => Promise<void>;
}) {
  const collection = collections.find((item) => item.id === selectedId);
  const [members, setMembers] = useState<Members | null>(null);
  const [newName, setNewName] = useState("");
  const [renameName, setRenameName] = useState("");
  const [deleteName, setDeleteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("editor");
  const [inviteLink, setInviteLink] = useState("");
  const [invitedEmail, setInvitedEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [panel, setPanel] = useState<null | "create" | "invite" | "members" | "rename" | "delete">(null);

  function openPanel(next: NonNullable<typeof panel>) {
    setError(""); setMessage(""); setInviteLink(""); setPanel(next);
    if (next === "rename") setRenameName(collection?.name ?? "");
    if (next === "delete") setDeleteName("");
  }

  async function loadMembers(id: string) {
    const data = await responseJson<Members>(await collectionFetch(`/api/collections/${id}/members`, id));
    setMembers(data);
  }

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setMembers(null);
      setRenameName(collection?.name ?? "");
      setDeleteName("");
      setInviteLink("");
      setError("");
      setPanel(null);
    });
    if (collection?.role === "owner") {
      void collectionFetch(`/api/collections/${collection.id}/members`, collection.id)
        .then((response) => responseJson<Members>(response))
        .then((data) => { if (!cancelled) setMembers(data); })
        .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "無法讀取成員。"); });
    }
    return () => { cancelled = true; };
  }, [collection?.id, collection?.role, collection?.name]);

  async function action(path: string, init: RequestInit, success: string): Promise<boolean> {
    setBusy(true);
    try {
      await responseJson(await collectionFetch(path, selectedId, init));
      setError(""); setMessage(success);
      if (collection?.role === "owner") await loadMembers(selectedId);
      await onSessionChanged(selectedId);
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "操作失敗。"); return false; }
    finally { setBusy(false); }
  }

  async function createCollection(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    try {
      const data = await responseJson<{ id: string }>(await collectionFetch("/api/collections", undefined, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newName }),
      }));
      setNewName(""); setError(""); setMessage("食評群組已建立。");
      await onSessionChanged(data.id);
      setPanel(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "建立群組失敗。"); }
    finally { setBusy(false); }
  }

  async function renameCollection(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await action(`/api/collections/${selectedId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: renameName }),
    }, "群組名稱已更新。");
    if (ok) setPanel(null);
  }

  async function sendInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    try {
      const data = await responseJson<{ link: string }>(await collectionFetch(`/api/collections/${selectedId}/invites`, selectedId, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      }));
      setInviteLink(data.link); setInvitedEmail(inviteEmail); setInviteEmail(""); setError(""); setMessage("邀請連結已建立。");
      await loadMembers(selectedId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "邀請失敗。"); }
    finally { setBusy(false); }
  }

  async function deleteCollection(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!collection || collection.role !== "owner" || deleteName !== collection.name) return;
    setBusy(true);
    try {
      await responseJson(await collectionFetch(`/api/collections/${collection.id}`, collection.id, {
        method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: deleteName }),
      }));
      localStorage.removeItem("closerice_collection_id");
      setDeleteName(""); setMembers(null); setError(""); setMessage(`「${collection.name}」已刪除。`);
      await onSessionChanged();
      setPanel(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "刪除群組失敗。"); }
    finally { setBusy(false); }
  }

  const roleName = collection?.role === "owner" ? "擁有人" : collection?.role === "editor" ? "可編輯" : "只可查看";
  return <main className="shell settings-page">
    <header className="settings-topbar"><a className="brand brand-link" href="/closerice/"><img className="brand-logo" src="/closerice/brand-logo.png?v=3" alt="Closerice" /></a><a className="settings-back" href="/closerice/"><ArrowLeft size={17} aria-hidden="true" />返回食評</a></header>
    <div className="settings-intro"><p className="eyebrow">帳戶與群組</p><h1>設定</h1><p>在這裏切換食評群組，管理成員及權限。</p></div>
    {error && <div className="notice error" role="alert">{error}</div>}
    {message && <div className="notice" role="status">{message}</div>}
    <div className="settings-layout"><div className="settings-main">
      <section className="settings-card" aria-labelledby="settings-groups">
        <div className="settings-card-head"><div><h2 id="settings-groups">食評群組</h2><p>切換群組，查看各自的食評。</p></div><button className="settings-head-button" onClick={() => openPanel("create")}><Plus size={16} aria-hidden="true" />新增</button></div>
        {collections.length > 0 && <label className="settings-field">目前群組<select aria-label="選擇食評群組" value={selectedId} onChange={(event) => onSelect(event.target.value)}>{collections.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        {collection && <div className="settings-current"><span className="settings-group-avatar">{collection.name.slice(0, 1).toUpperCase()}</span><div><strong>{collection.name}</strong><small>你的權限：{roleName}</small></div></div>}
        {collection?.role === "owner" && <div className="settings-row-list"><button className="settings-row-button" onClick={() => openPanel("rename")}><span>更改群組名稱</span><ChevronRight size={18} aria-hidden="true" /></button><button className="settings-row-button settings-row-danger" onClick={() => openPanel("delete")}><span>刪除食評群組</span><ChevronRight size={18} aria-hidden="true" /></button></div>}
      </section>
      {collection && pendingTransfers.some((item) => item.collectionId === collection.id) && <section className="settings-card transfer-banner"><div><h2>擁有權轉讓</h2><p>群組擁有人邀請你接手「{collection.name}」。</p></div><button className="button primary" disabled={busy} onClick={() => void action(`/api/collections/${collection.id}/transfer/accept`, { method: "POST" }, "你已成為群組擁有人。")}>接受擁有權</button></section>}
      {collection?.role === "owner" && <section className="settings-card" aria-labelledby="settings-members"><div className="settings-card-head"><div><h2 id="settings-members">成員與權限</h2><p>{members ? `目前有 ${1 + members.members.length} 位成員` : "管理群組的分享權限。"}</p></div><button className="settings-head-button" onClick={() => openPanel("invite")}><Plus size={16} aria-hidden="true" />邀請</button></div><button className="settings-row-button" onClick={() => openPanel("members")}><span>查看成員、邀請及擁有權</span><ChevronRight size={18} aria-hidden="true" /></button></section>}
    </div><aside className="settings-side"><section className="settings-card" aria-labelledby="settings-account"><h2 id="settings-account">你的帳戶</h2><p className="settings-account-name">{user.name || "Google 帳戶"}</p><p className="settings-email">{user.email}</p><button className="button secondary" onClick={() => void onLogout()}>登出</button></section><p className="settings-side-note">食評和相片只會顯示給有權查看該群組的成員。</p></aside></div>
    {panel && <div className="overlay settings-panel-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setPanel(null); }}><section className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-panel-title"><div className="settings-panel-head"><button className="settings-panel-back" onClick={() => setPanel(null)} aria-label="返回設定"><ArrowLeft size={20} aria-hidden="true" /></button><h2 id="settings-panel-title">{{ create: "建立食評群組", invite: "邀請新成員", members: "成員與權限", rename: "更改群組名稱", delete: "刪除食評群組" }[panel]}</h2><button className="settings-panel-close" onClick={() => setPanel(null)} aria-label="關閉"><X size={20} aria-hidden="true" /></button></div>
      {error && <div className="notice error" role="alert">{error}</div>}
      {panel === "create" && <><p className="settings-panel-hint">每個群組有自己的食評和成員。建立後，你會成為擁有人。</p><form className="settings-panel-form" onSubmit={createCollection}><label className="settings-field">群組名稱<input required autoFocus maxLength={60} value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="例如：Home、Work" /></label><button className="button primary" type="submit" disabled={busy || !newName.trim()}>建立群組</button></form></>}
      {panel === "invite" && collection?.role === "owner" && <><p className="settings-panel-hint">邀請對方的 Google 電郵加入「{collection.name}」，再傳送邀請連結。</p><form className="settings-panel-form" onSubmit={sendInvite}><label className="settings-field">Google 電郵<input type="email" required autoFocus placeholder="name@example.com" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} /></label><label className="settings-field">權限<select aria-label="受邀者權限" value={inviteRole} onChange={(event) => setInviteRole(event.target.value as "editor" | "viewer")}><option value="editor">可編輯</option><option value="viewer">只可查看</option></select></label><button className="button primary" type="submit" disabled={busy}>產生邀請連結</button></form>{inviteLink && <div className="invite-link notice"><p>把連結傳給 {invitedEmail || "受邀者"}；只有該電郵登入後才可加入。</p><input readOnly aria-label="邀請連結" value={inviteLink} /><button className="button secondary" onClick={() => void navigator.clipboard.writeText(inviteLink)}>複製連結</button></div>}</>}
      {panel === "members" && collection?.role === "owner" && <>{!members ? <p role="status">正在讀取成員…</p> : <div className="member-list">{members.owner && <div className="member-row"><span><strong>{members.owner.name || members.owner.email}</strong><small>{members.owner.email}</small></span><b>擁有人</b></div>}{members.members.map((member) => <div className="member-row" key={member.id}><span><strong>{member.name || member.email}</strong><small>{member.email}</small></span><div className="member-controls"><select aria-label={`${member.email} 權限`} value={member.role} disabled={busy} onChange={(event) => void action(`/api/collections/${selectedId}/members/${member.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: event.target.value }) }, "成員權限已更新.")}><option value="editor">可編輯</option><option value="viewer">只可查看</option></select><button className="button text-danger" disabled={busy} onClick={() => { if (window.confirm(`移除 ${member.email}？`)) void action(`/api/collections/${selectedId}/members/${member.id}`, { method: "DELETE" }, "成員已移除。"); }}>移除</button><button className="button secondary" disabled={busy} onClick={() => { if (window.confirm(`把「${collection.name}」的擁有權轉讓給 ${member.email}？對方接受後才會生效。`)) void action(`/api/collections/${selectedId}/transfer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: member.id }) }, "擁有權轉讓邀請已送出。"); }}>轉讓擁有權</button></div></div>)}</div>}{members && members.invites.length > 0 && <><h3>待接受邀請</h3>{members.invites.map((item) => <div className="member-row" key={item.id}><span>{item.email} · {item.role === "editor" ? "可編輯" : "只可查看"}</span><button className="button text-danger" disabled={busy} onClick={() => void action(`/api/collections/${selectedId}/invites/${item.id}`, { method: "DELETE" }, "邀請已撤銷。")}>撤銷</button></div>)}</>}{members?.transfer && <p className="notice transfer-pending">擁有權轉讓待接受。<button className="button text-danger" disabled={busy} onClick={() => void action(`/api/collections/${selectedId}/transfer`, { method: "DELETE" }, "擁有權轉讓已取消。")}>取消轉讓</button></p>}</>}
      {panel === "rename" && collection?.role === "owner" && <><p className="settings-panel-hint">更改「{collection.name}」的顯示名稱。</p><form className="settings-panel-form" onSubmit={renameCollection}><label className="settings-field">群組名稱<input required autoFocus maxLength={60} value={renameName} onChange={(event) => setRenameName(event.target.value)} /></label><button className="button primary" type="submit" disabled={busy || !renameName.trim() || renameName.trim() === collection.name}>儲存名稱</button></form></>}
      {panel === "delete" && collection?.role === "owner" && <><p className="settings-panel-hint">刪除後，「{collection.name}」的食評、相片、標籤、邀請和成員權限都會永久移除，無法復原。其他群組不受影響。</p><form className="settings-panel-form" onSubmit={deleteCollection}><label className="settings-field">輸入「{collection.name}」以確認<input autoFocus autoComplete="off" value={deleteName} onChange={(event) => setDeleteName(event.target.value)} /></label><button className="button danger" type="submit" disabled={busy || deleteName !== collection.name}>永久刪除群組</button></form></>}
    </section></div>}
    <nav className={`mobile-tabs settings-tabs ${collection?.role === "viewer" ? "viewer-tabs" : ""}`} aria-label="底部分頁"><a className="mobile-tab" href="/closerice/"><span className="mobile-tab-icon"><List size={22} aria-hidden="true" /></span><span>食評</span></a>{collection?.role !== "viewer" && <a className="mobile-tab" href="/closerice/?view=new"><span className="mobile-tab-icon"><Plus size={23} aria-hidden="true" /></span><span>新增</span></a>}<a className="mobile-tab" href="/closerice/?view=favorite"><span className="mobile-tab-icon"><Heart size={22} aria-hidden="true" /></span><span>最愛</span></a><a className="mobile-tab active" aria-current="page" href="/closerice/settings/"><span className="mobile-tab-icon"><Settings size={22} aria-hidden="true" /></span><span>設定</span></a></nav>
  </main>;
}
