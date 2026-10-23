"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ChevronRight, Search, ShieldCheck, X } from "lucide-react";
import { collectionFetch, responseJson } from "../lib/client-api";
import { apiUrl, pageAsset } from "../lib/client-urls";
import { districtGroups } from "../lib/districts";
import "./admin.css";

type Section = "overview" | "users" | "collections" | "reviews" | "settings";
type Settings = { registrationEnabled: boolean; newGroupsEnabled: boolean };
type Overview = { admin: { email: string }; counts: { users: number; collections: number; reviews: number; opinions: number }; activity: Array<{ id: string; action: string; targetType: string; targetId: string; createdAt: string; actor: string }>; settings: Settings };
type User = { id: string; email: string; name: string; displayName: string | null; pictureUrl: string | null; disabledAt: number | null; createdAt: string; groupCount: number; opinionCount: number; isAdmin: number };
type Group = { id: string; name: string; ownerUserId: string | null; ownerName: string | null; ownerEmail: string | null; memberCount: number; reviewCount: number; createdAt: string };
type Member = { id: string; email: string; name: string; pictureUrl: string | null; role: "editor" | "viewer"; disabledAt: number | null };
type GroupDetail = { collection: { id: string; name: string; owner_user_id: string | null }; members: Member[]; invites: Array<{ id: string; email: string; role: string; expiresAt: number }>; tags: Array<{ id: string; name: string; userId: string }>; tagUsers: Array<{ id: string; name: string; email: string }> };
type Review = { id: string; collectionId: string; collectionName: string; restaurant: string; food: string; diningDate: string; channel: string; status: string; amountCents: number | null; orderNumber: string; district: string | null; createdBy: string | null; creatorName: string | null; opinionCount: number; averageScore: number | null };
type ReviewDetail = { review: { id: string; collectionId: string; restaurant: string; food: string; diningDate: string; channel: string; status: string; amountCents: number | null; orderNumber: string; district: string | null }; opinions: Array<{ id: string; authorId: string | null; authorName: string | null; comment: string; score: number | null; selectedFoods: string | null }>; photos: Array<{ id: string; name: string; contentType: string }>; labels: Array<{ id: string; name: string; email: string; tagIds: string[] }>; availableTags: Array<{ id: string; name: string; userId: string }> };
type ListResult<T> = { nextOffset: number | null } & T;
const sections: Array<{ id: Section; label: string }> = [
  { id: "overview", label: "概覽" }, { id: "users", label: "用戶" }, { id: "collections", label: "食評群組" }, { id: "reviews", label: "食評" }, { id: "settings", label: "網站設定" },
];
const channelNames: Record<string, string> = { keeta: "Keeta", foodpanda: "foodpanda", takeaway: "外賣自取", dine_in: "堂食" };
const roleNames: Record<string, string> = { editor: "可編輯", viewer: "只可查看" };
const actionNames: Record<string, string> = {
  "user.update": "更新用戶", "user.sessions.revoke": "登出用戶", "collection.update": "更新群組", "collection.delete": "刪除群組",
  "membership.upsert": "加入成員", "membership.update": "更改權限", "membership.remove": "移除成員", "invite.create": "建立邀請",
  "invite.revoke": "撤銷邀請", "tag.create": "新增標籤", "tag.delete": "刪除標籤", "review.update": "更新紀錄",
  "review.delete": "刪除紀錄", "review.labels.update": "更新個人標記", "opinion.update": "更新評語", "opinion.delete": "刪除評語", "photo.delete": "刪除相片", "settings.update": "更新網站設定",
};
const read = async <T,>(path: string) => responseJson<T>(await collectionFetch(path));
const write = async <T,>(path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => responseJson<T>(await collectionFetch(path, undefined, {
  method, headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
}));
function Avatar({ name, src }: { name: string; src: string | null }) {
  const [failed, setFailed] = useState(false);
  return src && !failed ? <img className="admin-avatar" src={src} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : <span className="admin-avatar fallback" aria-hidden="true">{name.slice(0, 1) || "?"}</span>;
}
function SmallNotice({ children, danger = false }: { children: React.ReactNode; danger?: boolean }) {
  return <p className={danger ? "admin-notice is-error" : "admin-notice"} role={danger ? "alert" : "status"}>{children}</p>;
}

export default function AdminPage() {
  const [section, setSection] = useState<Section>("overview");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [detail, setDetail] = useState<{ kind: "user" | "collection" | "review"; id: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [authStatus, setAuthStatus] = useState<"ok" | "login" | "forbidden">("ok");

  const reload = useCallback(async (tab: Section, q = "", collectionId = "", offset = 0) => {
    if (tab === "overview") {
      const data = await read<Overview>("/api/admin/overview"); setOverview(data); setSettings(data.settings);
    } else if (tab === "users") {
      const data = await read<ListResult<{ users: User[] }>>("/api/admin/users?q=" + encodeURIComponent(q) + "&offset=" + offset);
      setUsers((old) => offset ? [...old, ...data.users] : data.users); setNextOffset(data.nextOffset);
    } else if (tab === "collections") {
      const data = await read<ListResult<{ collections: Group[] }>>("/api/admin/collections?q=" + encodeURIComponent(q) + "&offset=" + offset);
      setGroups((old) => offset ? [...old, ...data.collections] : data.collections); setNextOffset(data.nextOffset);
    } else if (tab === "reviews") {
      const data = await read<ListResult<{ reviews: Review[] }>>("/api/admin/reviews?q=" + encodeURIComponent(q) + "&collectionId=" + encodeURIComponent(collectionId) + "&offset=" + offset);
      setReviews((old) => offset ? [...old, ...data.reviews] : data.reviews); setNextOffset(data.nextOffset);
    } else {
      const data = await read<{ settings: Settings }>("/api/admin/settings"); setSettings(data.settings);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void read<Overview>("/api/admin/overview").then((data) => {
      if (!cancelled) { setOverview(data); setSettings(data.settings); setAuthStatus("ok"); }
    }).catch((cause) => {
      if (!cancelled) { setAuthStatus(cause instanceof Error && cause.message.includes("請先登入") ? "login" : "forbidden"); setError(cause instanceof Error ? cause.message : "無法讀取管理資料。"); }
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function changeTab(tab: Section) {
    setSection(tab); setDetail(null); setError(""); setNotice(""); setQuery(""); setSubmittedQuery(""); setNextOffset(null);
    try {
      if (tab === "reviews") {
        const result = await read<{ collections: Group[] }>("/api/admin/collections");
        setGroups(result.collections);
      }
      await reload(tab);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "無法讀取資料。"); }
  }
  async function searchList(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSubmittedQuery(query); setError("");
    try { await reload(section, query, groupFilter); } catch (cause) { setError(cause instanceof Error ? cause.message : "搜尋失敗。"); }
  }
  async function perform(task: () => Promise<unknown>, message: string) {
    setBusy(true); setError("");
    try { await task(); setNotice(message); await reload(section, submittedQuery, groupFilter); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : "操作失敗。"); return false; }
    finally { setBusy(false); }
  }
  function closeDetail() { setDetail(null); setError(""); setNotice(""); }

  if (loading) return <main className="shell admin-loading"><p>正在載入管理後台…</p></main>;
  if (authStatus !== "ok") return <main className="shell admin-locked"><div className="admin-card"><ShieldCheck size={34} /><h1>管理後台</h1><p>{error}</p><a className="button primary" href={authStatus === "login" ? apiUrl("/api/auth/google/start") : "/closerice/"}>{authStatus === "login" ? "使用 Google 登入" : "返回 Closerice"}</a></div></main>;

  return <main className="shell admin-page">
    <header className="admin-top"><a href="/closerice/" className="admin-brand"><img src={pageAsset("brand-logo.png?v=3")} alt="Closerice" /></a><a href="/closerice/settings/" className="admin-back"><ArrowLeft size={17} />返回設定</a></header>
    <div className="admin-heading"><div><p className="eyebrow">CLOSERICE ADMIN</p><h1>管理後台</h1><p>管理用戶、食評群組和所有用餐紀錄。</p></div><span className="admin-identity"><ShieldCheck size={16} />{overview?.admin.email}</span></div>
    <nav className="admin-nav" aria-label="管理項目">{sections.map((item) => <button key={item.id} type="button" className={section === item.id ? "active" : ""} onClick={() => void changeTab(item.id)}>{item.label}</button>)}</nav>
    {error && <SmallNotice danger>{error}</SmallNotice>}{notice && <SmallNotice>{notice}</SmallNotice>}
    {section === "overview" && overview && <><div className="admin-stats"><div><strong>{overview.counts.users}</strong><span>用戶</span></div><div><strong>{overview.counts.collections}</strong><span>群組</span></div><div><strong>{overview.counts.reviews}</strong><span>用餐紀錄</span></div><div><strong>{overview.counts.opinions}</strong><span>評語</span></div></div><section className="admin-card"><h2>最近管理操作</h2>{overview.activity.length ? <div className="admin-rows">{overview.activity.map((item) => <div className="admin-audit-row" key={item.id}><div><strong>{actionNames[item.action] ?? item.action}</strong><small>{item.actor} · {item.targetType} · {item.targetId}</small></div><time>{new Date(item.createdAt).toLocaleString("zh-HK")}</time></div>)}</div> : <p className="admin-muted">尚未有管理操作。</p>}</section></>}
    {["users", "collections", "reviews"].includes(section) && <><form className="admin-search" onSubmit={searchList}><Search size={19} /><input aria-label="搜尋" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={section === "users" ? "搜尋名稱或電郵" : section === "collections" ? "搜尋群組" : "搜尋餐廳、食物或訂單編號"} /><button type="submit">搜尋</button></form>{section === "reviews" && <label className="admin-filter">群組<select value={groupFilter} onChange={(event) => { setGroupFilter(event.target.value); void reload("reviews", submittedQuery, event.target.value); }}><option value="">全部群組</option>{groups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}</>}
    {section === "users" && <section className="admin-card"><div className="admin-card-head"><h2>用戶</h2><span>{users.length} 位</span></div><div className="admin-rows">{users.map((item) => <button className="admin-row" key={item.id} onClick={() => setDetail({ kind: "user", id: item.id })}><Avatar name={item.name} src={item.pictureUrl} /><span className="admin-row-text"><strong>{item.name || item.email}{item.isAdmin ? " · 管理員" : ""}</strong><small>{item.email} · {item.groupCount} 個群組 · {item.opinionCount} 則評語</small></span>{item.disabledAt && <span className="admin-pill warning">已停用</span>}<ChevronRight size={17} /></button>)}</div>{!users.length && <p className="admin-muted">找不到用戶。</p>}</section>}
    {section === "collections" && <section className="admin-card"><div className="admin-card-head"><h2>食評群組</h2><span>{groups.length} 個</span></div><div className="admin-rows">{groups.map((item) => <button className="admin-row" key={item.id} onClick={() => setDetail({ kind: "collection", id: item.id })}><span className="admin-group-icon">{item.name.slice(0, 1)}</span><span className="admin-row-text"><strong>{item.name}</strong><small>{item.ownerEmail || "未指定擁有人"} · {item.memberCount} 位成員 · {item.reviewCount} 次用餐</small></span><ChevronRight size={17} /></button>)}</div>{!groups.length && <p className="admin-muted">找不到群組。</p>}</section>}
    {section === "reviews" && <section className="admin-card"><div className="admin-card-head"><h2>用餐紀錄</h2><span>{reviews.length} 筆</span></div><div className="admin-rows">{reviews.map((item) => <button className="admin-row" key={item.id} onClick={() => setDetail({ kind: "review", id: item.id })}><span className="admin-review-date">{item.diningDate.slice(5)}</span><span className="admin-row-text"><strong>{item.restaurant}</strong><small>{item.collectionName} · {item.food} · {item.opinionCount} 則評語{item.averageScore ? " · " + item.averageScore + " ★" : ""}</small></span><ChevronRight size={17} /></button>)}</div>{!reviews.length && <p className="admin-muted">找不到食評。</p>}</section>}
    {nextOffset !== null && ["users", "collections", "reviews"].includes(section) && <button className="button secondary admin-more" onClick={() => void reload(section, submittedQuery, groupFilter, nextOffset)}>載入更多</button>}
    {section === "settings" && settings && <SettingsEditor key={JSON.stringify(settings)} settings={settings} busy={busy} onSave={async (value) => { if (await perform(() => write("/api/admin/settings", "PATCH", value), "網站設定已更新。")) setSettings(value); }} />}
    {detail?.kind === "user" && users.find((item) => item.id === detail.id) && <UserEditor user={users.find((item) => item.id === detail.id)!} currentAdminEmail={overview?.admin.email ?? ""} busy={busy} onClose={closeDetail} onSave={async (value) => { if (await perform(() => write("/api/admin/users/" + detail.id, "PATCH", value), "用戶已更新。")) closeDetail(); }} onRevoke={async () => { await perform(() => write("/api/admin/users/" + detail.id + "/sessions", "DELETE"), "已登出該用戶的所有工作階段。"); }} />}
    {detail?.kind === "collection" && <GroupEditor id={detail.id} busy={busy} onClose={closeDetail} onChange={async (task, message, close = false) => { const ok = await perform(task, message); if (ok && close) closeDetail(); return ok; }} />}
    {detail?.kind === "review" && <ReviewEditor id={detail.id} busy={busy} onClose={closeDetail} onChange={async (task, message, close = false) => { const ok = await perform(task, message); if (ok && close) closeDetail(); return ok; }} />}
  </main>;
}

function Panel({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="admin-panel-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="admin-panel" role="dialog" aria-modal="true" aria-label={title}><div className="admin-panel-head"><button type="button" onClick={onClose} aria-label="返回"><ArrowLeft size={20} /></button><h2>{title}</h2><button type="button" onClick={onClose} aria-label="關閉"><X size={20} /></button></div><div className="admin-panel-body">{children}</div></section></div>;
}
function SettingsEditor({ settings, busy, onSave }: { settings: Settings; busy: boolean; onSave: (value: Settings) => Promise<void> }) {
  const [value, setValue] = useState(settings);
  return <section className="admin-card admin-settings"><h2>網站設定</h2><p className="admin-muted">這些設定只影響新帳戶和新群組，現有資料保持可用。</p><label className="admin-setting-row"><span><strong>接受新用戶註冊</strong><small>關閉後，現有用戶仍可登入。</small></span><input type="checkbox" checked={value.registrationEnabled} onChange={(event) => setValue({ ...value, registrationEnabled: event.target.checked })} /></label><label className="admin-setting-row"><span><strong>允許建立新群組</strong><small>關閉後，現有群組仍可使用。</small></span><input type="checkbox" checked={value.newGroupsEnabled} onChange={(event) => setValue({ ...value, newGroupsEnabled: event.target.checked })} /></label><button className="button primary" disabled={busy || JSON.stringify(value) === JSON.stringify(settings)} onClick={() => void onSave(value)}>儲存網站設定</button></section>;
}
function UserEditor({ user, currentAdminEmail, busy, onClose, onSave, onRevoke }: {
  user: User; currentAdminEmail: string; busy: boolean; onClose: () => void;
  onSave: (value: { displayName: string; disabled: boolean }) => Promise<void>; onRevoke: () => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState(user.displayName ?? "");
  const [disabled, setDisabled] = useState(Boolean(user.disabledAt));
  return <Panel title="管理用戶" onClose={onClose}><div className="admin-person"><Avatar name={user.name} src={user.pictureUrl} /><div><strong>{user.name}</strong><small>{user.email}</small></div></div><form onSubmit={(event) => { event.preventDefault(); void onSave({ displayName, disabled }); }}><label className="admin-field">顯示名稱<input maxLength={60} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="留空使用 Google 名稱" /></label><label className="admin-check"><input type="checkbox" checked={disabled} disabled={user.email === currentAdminEmail} onChange={(event) => setDisabled(event.target.checked)} /><span>停用帳戶並登出所有裝置</span></label><p className="admin-muted">Google 電郵和帳戶識別碼不能在 Closerice 修改。</p><button className="button primary" type="submit" disabled={busy || (displayName === (user.displayName ?? "") && disabled === Boolean(user.disabledAt))}>儲存用戶</button></form><div className="admin-divider" /><button className="button secondary" type="button" disabled={busy} onClick={() => { if (window.confirm("確定登出這位用戶在所有裝置上的工作階段？")) void onRevoke(); }}>登出所有裝置</button></Panel>;
}
function GroupEditor({ id, busy, onClose, onChange }: {
  id: string; busy: boolean; onClose: () => void;
  onChange: (task: () => Promise<unknown>, message: string, close?: boolean) => Promise<boolean>;
}) {
  const [data, setData] = useState<GroupDetail | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<"editor" | "viewer">("editor");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("editor");
  const [inviteLink, setInviteLink] = useState("");
  const [tagName, setTagName] = useState("");
  const [tagUserId, setTagUserId] = useState("");
  const [deleteName, setDeleteName] = useState("");
  const refresh = useCallback(async () => {
    const result = await read<GroupDetail>("/api/admin/collections/" + id);
    setData(result); setName(result.collection.name); setOwnerId(result.collection.owner_user_id ?? "");
    setTagUserId((current) => result.tagUsers.some((person) => person.id === current) ? current : result.tagUsers[0]?.id ?? "");
  }, [id]);
  useEffect(() => { void Promise.resolve().then(refresh).catch((cause) => setError(cause instanceof Error ? cause.message : "無法讀取群組。")); }, [refresh]);
  async function act(task: () => Promise<unknown>, message: string, close = false) {
    const ok = await onChange(task, message, close);
    if (ok && !close) await refresh();
  }
  return <Panel title="管理食評群組" onClose={onClose}>{error && <SmallNotice danger>{error}</SmallNotice>}{!data ? <p>正在載入…</p> : <>
    <form className="admin-form" onSubmit={(event) => { event.preventDefault(); void act(() => write("/api/admin/collections/" + id, "PATCH", { name, ownerUserId: ownerId }), "群組已更新。"); }}><h3>群組資料</h3><label className="admin-field">群組名稱<input required maxLength={60} value={name} onChange={(event) => setName(event.target.value)} /></label><label className="admin-field">擁有人<select value={ownerId} onChange={(event) => setOwnerId(event.target.value)}><option value={data.collection.owner_user_id ?? ""}>目前擁有人</option>{data.members.filter((member) => !member.disabledAt).map((member) => <option key={member.id} value={member.id}>{member.name} · {member.email}</option>)}</select></label><p className="admin-muted">更換擁有人後，原擁有人會變成可編輯成員。</p><button className="button primary" disabled={busy || (name === data.collection.name && ownerId === data.collection.owner_user_id)}>儲存群組</button></form>
    <section className="admin-subsection"><h3>成員與權限</h3>{data.members.map((member) => <div className="admin-member-row" key={member.id}><Avatar name={member.name} src={member.pictureUrl} /><div className="admin-member-name"><strong>{member.name}</strong><small>{member.email}</small></div><select aria-label={member.name + " 的權限"} value={member.role} disabled={busy} onChange={(event) => void act(() => write("/api/admin/collections/" + id + "/members/" + member.id, "PATCH", { role: event.target.value }), "成員權限已更新。")}><option value="editor">可編輯</option><option value="viewer">只可查看</option></select><button type="button" className="admin-text-danger" disabled={busy} onClick={() => { if (window.confirm("移除 " + member.name + " 的群組權限？")) void act(() => write("/api/admin/collections/" + id + "/members/" + member.id, "DELETE"), "成員已移除。"); }}>移除</button></div>)}<form className="admin-inline" onSubmit={(event) => { event.preventDefault(); void act(() => write("/api/admin/collections/" + id + "/members", "POST", { email: memberEmail, role: memberRole }), "成員已加入。").then(() => setMemberEmail("")); }}><input type="email" required value={memberEmail} onChange={(event) => setMemberEmail(event.target.value)} placeholder="現有用戶的 Google 電郵" /><select aria-label="新成員權限" value={memberRole} onChange={(event) => setMemberRole(event.target.value as "editor" | "viewer")}><option value="editor">可編輯</option><option value="viewer">只可查看</option></select><button className="button secondary" disabled={busy}>加入</button></form></section>
    <section className="admin-subsection"><h3>邀請</h3>{data.invites.map((invite) => <div className="admin-simple-row" key={invite.id}><span>{invite.email} · {roleNames[invite.role]}</span><button type="button" className="admin-text-danger" disabled={busy} onClick={() => void act(() => write("/api/admin/collections/" + id + "/invites/" + invite.id, "DELETE"), "邀請已撤銷。")}>撤銷</button></div>)}<form className="admin-inline" onSubmit={(event) => { event.preventDefault(); void write<{ link: string }>("/api/admin/collections/" + id + "/invites", "POST", { email: inviteEmail, role: inviteRole }).then((result) => { setInviteLink(result.link); setInviteEmail(""); void refresh(); }).catch((cause) => setError(cause instanceof Error ? cause.message : "建立邀請失敗。")); }}><input type="email" required value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="受邀人的 Google 電郵" /><select aria-label="邀請權限" value={inviteRole} onChange={(event) => setInviteRole(event.target.value as "editor" | "viewer")}><option value="editor">可編輯</option><option value="viewer">只可查看</option></select><button className="button secondary" disabled={busy}>產生連結</button></form>{inviteLink && <label className="admin-field">邀請連結<input readOnly value={inviteLink} onFocus={(event) => event.target.select()} /></label>}</section>
    <section className="admin-subsection"><h3>成員的個人標籤</h3><label className="admin-field">選擇成員<select value={tagUserId} onChange={(event) => setTagUserId(event.target.value)}>{data.tagUsers.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.email}</option>)}</select></label><div className="admin-chip-list">{data.tags.filter((tag) => tag.userId === tagUserId).map((tag) => <span className="admin-chip" key={tag.id}>{tag.name}<button type="button" aria-label={"刪除 " + tag.name} onClick={() => { if (window.confirm("刪除這位成員的標籤「" + tag.name + "」？")) void act(() => write("/api/admin/collections/" + id + "/tags/" + tag.id, "DELETE"), "標籤已刪除。"); }}>×</button></span>)}</div><form className="admin-inline" onSubmit={(event) => { event.preventDefault(); void act(() => write("/api/admin/collections/" + id + "/tags", "POST", { name: tagName, userId: tagUserId }), "標籤已建立。").then(() => setTagName("")); }}><input required maxLength={24} value={tagName} onChange={(event) => setTagName(event.target.value)} placeholder="新標籤" /><button className="button secondary" disabled={busy || !tagUserId || data.tags.filter((tag) => tag.userId === tagUserId).length >= 10}>新增</button></form></section>
    <section className="admin-danger-box"><h3>刪除群組</h3><p>會永久刪除群組及其食評、評語和相片。請輸入完整群組名稱。</p><input value={deleteName} onChange={(event) => setDeleteName(event.target.value)} placeholder={data.collection.name} /><button className="button danger" disabled={busy || deleteName !== data.collection.name} onClick={() => void act(() => write("/api/admin/collections/" + id, "DELETE", { name: deleteName }), "群組已刪除。", true)}>永久刪除群組</button></section>
  </>}</Panel>;
}

function ReviewEditor({ id, busy, onClose, onChange }: {
  id: string; busy: boolean; onClose: () => void;
  onChange: (task: () => Promise<unknown>, message: string, close?: boolean) => Promise<boolean>;
}) {
  const [data, setData] = useState<ReviewDetail | null>(null);
  const [form, setForm] = useState<ReviewDetail["review"] | null>(null);
  const [deleteName, setDeleteName] = useState("");
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    const result = await read<ReviewDetail>("/api/admin/reviews/" + id);
    setData(result); setForm(result.review);
  }, [id]);
  useEffect(() => { void Promise.resolve().then(refresh).catch((cause) => setError(cause instanceof Error ? cause.message : "無法讀取紀錄。")); }, [refresh]);
  async function act(task: () => Promise<unknown>, message: string, close = false) {
    const ok = await onChange(task, message, close);
    if (ok && !close) await refresh();
  }
  function update<K extends keyof ReviewDetail["review"]>(key: K, value: ReviewDetail["review"][K]) {
    if (form) setForm({ ...form, [key]: value });
  }
  return <Panel title="管理用餐紀錄" onClose={onClose}>{error && <SmallNotice danger>{error}</SmallNotice>}{!data || !form ? <p>正在載入…</p> : <>
    <form className="admin-form" onSubmit={(event) => { event.preventDefault(); void act(() => write("/api/admin/reviews/" + id, "PATCH", {
      diningDate: form.diningDate, restaurant: form.restaurant, food: form.food, channel: form.channel,
      orderNumber: form.orderNumber, amountCents: form.amountCents, district: form.district,
      comment: "", score: null,
    }), "用餐紀錄已更新。"); }}>
      <h3>用餐資料</h3>
      <div className="admin-form-grid"><label className="admin-field">日期<input type="date" required value={form.diningDate} onChange={(event) => update("diningDate", event.target.value)} /></label><label className="admin-field">餐廳<input required maxLength={120} value={form.restaurant} onChange={(event) => update("restaurant", event.target.value)} /></label></div>
      <label className="admin-field">食物<textarea required maxLength={1000} value={form.food} onChange={(event) => update("food", event.target.value)} /></label>
      <div className="admin-form-grid"><label className="admin-field">用餐方式<select value={form.channel} onChange={(event) => update("channel", event.target.value)}>{Object.entries(channelNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="admin-field">地區<select value={form.district ?? ""} onChange={(event) => update("district", event.target.value || null)}><option value="">未指定</option>{districtGroups.map((group) => <optgroup key={group.label} label={group.label}>{group.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</optgroup>)}</select></label></div>
      <div className="admin-form-grid"><label className="admin-field">訂單編號<input maxLength={80} value={form.orderNumber} onChange={(event) => update("orderNumber", event.target.value)} /></label><label className="admin-field">實付金額 HK$<input type="number" min="0" step="0.01" value={form.amountCents === null ? "" : (form.amountCents / 100).toFixed(2)} onChange={(event) => update("amountCents", event.target.value === "" ? null : Math.round(Number(event.target.value) * 100))} /></label></div>
      <button className="button primary" disabled={busy}>儲存紀錄</button>
    </form>
    <section className="admin-subsection"><h3>成員的個人標記</h3>{data.labels.map((label) => <PersonalLabelEditor key={label.id + label.tagIds.join(",")} label={label} tags={data.availableTags.filter((tag) => tag.userId === label.id)} busy={busy} onSave={async (value) => { await act(() => write("/api/admin/reviews/" + id + "/labels/" + label.id, "PATCH", value), "個人標記已更新。"); }} />)}</section>
    <section className="admin-subsection"><h3>成員評語與評分</h3>{data.opinions.length ? data.opinions.map((opinion) => <OpinionEditor key={opinion.id} opinion={opinion} busy={busy} onSave={async (value) => { await act(() => write("/api/admin/opinions/" + opinion.id, "PATCH", value), "評語已更新。"); }} onDelete={async () => { await act(() => write("/api/admin/opinions/" + opinion.id, "DELETE"), "評語已刪除。"); }} />) : <p className="admin-muted">這筆紀錄沒有評語。</p>}</section>
    <section className="admin-subsection"><h3>食物相片</h3>{data.photos.length ? <div className="admin-photo-grid">{data.photos.map((photo) => <figure key={photo.id}><img src={apiUrl("/api/admin/photos/" + photo.id)} alt={photo.name} /><figcaption>{photo.name}</figcaption><button className="admin-text-danger" type="button" onClick={() => { if (window.confirm("刪除這張食物相片？")) void act(() => write("/api/admin/photos/" + photo.id, "DELETE"), "相片已刪除。"); }}>刪除相片</button></figure>)}</div> : <p className="admin-muted">沒有食物相片。</p>}</section>
    <section className="admin-danger-box"><h3>刪除整筆紀錄</h3><p>此操作會連同所有成員評語及相片永久刪除。請輸入餐廳名稱。</p><input value={deleteName} onChange={(event) => setDeleteName(event.target.value)} placeholder={data.review.restaurant} /><button className="button danger" disabled={busy || deleteName !== data.review.restaurant} onClick={() => void act(() => write("/api/admin/reviews/" + id, "DELETE"), "紀錄已刪除。", true)}>永久刪除紀錄</button></section>
  </>}</Panel>;
}
function PersonalLabelEditor({ label, tags, busy, onSave }: {
  label: ReviewDetail["labels"][number]; tags: ReviewDetail["availableTags"]; busy: boolean;
  onSave: (value: { tagIds: string[] }) => Promise<void>;
}) {
  const [tagIds, setTagIds] = useState(label.tagIds);
  return <form className="admin-opinion" onSubmit={(event) => { event.preventDefault(); void onSave({ tagIds }); }}>
    <strong>{label.name} · {label.email}</strong>
    {tags.length > 0 && <div className="admin-field"><span>個人標籤</span><div className="admin-chip-list">{tags.map((tag) => <label className="admin-chip" key={tag.id}><input type="checkbox" checked={tagIds.includes(tag.id)} onChange={(event) => setTagIds(event.target.checked ? [...tagIds, tag.id] : tagIds.filter((id) => id !== tag.id))} />{tag.name}</label>)}</div></div>}
    <button className="button secondary" disabled={busy || (tagIds.length === label.tagIds.length && tagIds.every((id) => label.tagIds.includes(id)))}>儲存個人標記</button>
  </form>;
}

function OpinionEditor({ opinion, busy, onSave, onDelete }: {
  opinion: ReviewDetail["opinions"][number]; busy: boolean;
  onSave: (value: { comment: string; score: number | null }) => Promise<void>; onDelete: () => Promise<void>;
}) {
  const [comment, setComment] = useState(opinion.comment);
  const [score, setScore] = useState<number | null>(opinion.score);
  return <form className="admin-opinion" onSubmit={(event) => { event.preventDefault(); void onSave({ comment, score }); }}><strong>{opinion.authorName || "舊紀錄"}</strong><label className="admin-field">評分<select value={score ?? ""} onChange={(event) => setScore(event.target.value ? Number(event.target.value) : null)}><option value="">未評分</option>{Array.from({ length: 10 }, (_, index) => (index + 1) / 2).map((value) => <option key={value} value={value}>{value} ★</option>)}</select></label><label className="admin-field">評語<textarea maxLength={3000} value={comment} onChange={(event) => setComment(event.target.value)} /></label><div className="admin-form-actions"><button className="button secondary" disabled={busy || (comment === opinion.comment && score === opinion.score) || (!comment.trim() && score === null)}>儲存評語</button><button type="button" className="admin-text-danger" disabled={busy} onClick={() => { if (window.confirm("刪除 " + (opinion.authorName || "這位成員") + " 的評語？")) void onDelete(); }}>刪除評語</button></div></form>;
}
