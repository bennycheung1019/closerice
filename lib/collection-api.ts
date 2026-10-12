import { env } from "cloudflare:workers";
import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { getDb } from "../db";
import { collections, invites, memberships, ownershipTransfers, photos, reviews, tags, users } from "../db/schema";
import { getCollectionAccess, getSessionUser, newInviteToken, refreshSession, tokenHash } from "./auth";
import { errorResponse, serverError } from "./reviews";

type MemberRole = "editor" | "viewer";
const validRole = (value: unknown): value is MemberRole => value === "editor" || value === "viewer";
const normalizedEmail = (value: unknown) => typeof value === "string" ? value.trim().toLowerCase() : "";
const validEmail = (value: string) => value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const noStore = { "Cache-Control": "no-store" };

export async function handleCollectionApi(request: Request, path: string): Promise<Response> {
  try {
    const db = getDb();
    const user = await getSessionUser(request);
    if (!user) return errorResponse("請先登入。", 401);

    if (path === "/api/me" && request.method === "GET") {
      const owned = await db.select({ id: collections.id, name: collections.name }).from(collections).where(eq(collections.ownerUserId, user.id));
      const joined = await db.select({ id: collections.id, name: collections.name, role: memberships.role }).from(memberships)
        .innerJoin(collections, eq(memberships.collectionId, collections.id)).where(eq(memberships.userId, user.id));
      const pending = await db.select({ collectionId: ownershipTransfers.collectionId, name: collections.name }).from(ownershipTransfers)
        .innerJoin(collections, eq(ownershipTransfers.collectionId, collections.id))
        .where(and(eq(ownershipTransfers.toUserId, user.id), gt(ownershipTransfers.expiresAt, Date.now())));
      const renewedCookie = await refreshSession(request, user.id);
      return Response.json({ user, collections: [...owned.map((item) => ({ ...item, role: "owner" })), ...joined], pendingTransfers: pending }, {
        headers: renewedCookie ? { ...noStore, "Set-Cookie": renewedCookie } : noStore,
      });
    }

    if (path === "/api/collections" && request.method === "POST") {
      const body = await request.json().catch(() => null) as { name?: unknown } | null;
      const name = typeof body?.name === "string" ? body.name.trim() : "";
      if (!name || name.length > 60) return errorResponse("請輸入 1 至 60 字的群組名稱。", 400);
      const id = crypto.randomUUID();
      await db.insert(collections).values({ id, name, ownerUserId: user.id, createdAt: new Date().toISOString() });
      return Response.json({ id }, { status: 201 });
    }

    if (path === "/api/invites/accept" && request.method === "POST") {
      const body = await request.json().catch(() => null) as { token?: unknown } | null;
      const token = typeof body?.token === "string" ? body.token : "";
      if (!token || token.length > 128) return errorResponse("邀請連結無效。", 400);
      const hash = await tokenHash(token);
      const invite = await db.select().from(invites).where(and(eq(invites.tokenHash, hash), gt(invites.expiresAt, Date.now()))).get();
      if (!invite || invite.acceptedAt || invite.email !== user.email.toLowerCase()) return errorResponse("邀請已過期、已使用，或與你的登入電郵不符。", 403);
      await env.DB!.batch([
        env.DB!.prepare("INSERT OR IGNORE INTO memberships (collection_id,user_id,role,created_at) SELECT collection_id, ?, role, ? FROM invites WHERE id = ? AND accepted_at IS NULL AND expires_at > ? AND email = ?").bind(user.id, new Date().toISOString(), invite.id, Date.now(), user.email.toLowerCase()),
        env.DB!.prepare("UPDATE invites SET accepted_at = ? WHERE id = ? AND accepted_at IS NULL").bind(Date.now(), invite.id),
      ]);
      return Response.json({ collectionId: invite.collectionId });
    }

    const match = /^\/api\/collections\/([^/]+)(?:\/(.*))?$/.exec(path);
    if (!match) return errorResponse("找不到頁面。", 404);
    const collectionId = match[1];
    const subpath = match[2] ?? "";
    const access = await getCollectionAccess(request, false, collectionId);
    if (!access) return errorResponse("你無權查看這個群組。", 403);

    if (!subpath && request.method === "PATCH") {
      if (access.role !== "owner") return errorResponse("只有群組擁有人可以更改名稱。", 403);
      const body = await request.json().catch(() => null) as { name?: unknown } | null;
      const name = typeof body?.name === "string" ? body.name.trim() : "";
      if (!name || name.length > 60) return errorResponse("請輸入 1 至 60 字的群組名稱。", 400);
      await db.update(collections).set({ name }).where(eq(collections.id, collectionId));
      return Response.json({ ok: true });
    }

    if (!subpath && request.method === "DELETE") {
      if (access.role !== "owner") return errorResponse("只有群組擁有人可以刪除群組。", 403);
      const body = await request.json().catch(() => null) as { name?: unknown } | null;
      const name = typeof body?.name === "string" ? body.name.trim() : "";
      const current = await db.select({ name: collections.name }).from(collections)
        .where(and(eq(collections.id, collectionId), eq(collections.ownerUserId, user.id))).get();
      if (!current) return errorResponse("找不到你擁有的群組。", 404);
      if (name !== current.name) return errorResponse("請輸入完整群組名稱以確認刪除。", 400);

      const storedPhotos = env.BUCKET ? await db.select({ objectKey: photos.objectKey, dataBase64: photos.dataBase64 }).from(photos)
        .innerJoin(reviews, eq(photos.reviewId, reviews.id)).where(eq(reviews.collectionId, collectionId)) : [];
      const guard = "EXISTS (SELECT 1 FROM collections WHERE id = ? AND owner_user_id = ? AND name = ?)";
      const guardValues = [collectionId, user.id, name];
      const statements = [
        env.DB!.prepare(`DELETE FROM photos WHERE review_id IN (SELECT id FROM reviews WHERE collection_id = ?) AND ${guard}`).bind(collectionId, ...guardValues),
        env.DB!.prepare(`DELETE FROM review_tags WHERE review_id IN (SELECT id FROM reviews WHERE collection_id = ?) AND ${guard}`).bind(collectionId, ...guardValues),
        env.DB!.prepare(`DELETE FROM reviews WHERE collection_id = ? AND ${guard}`).bind(collectionId, ...guardValues),
        env.DB!.prepare(`DELETE FROM tags WHERE collection_id = ? AND ${guard}`).bind(collectionId, ...guardValues),
        env.DB!.prepare(`DELETE FROM invites WHERE collection_id = ? AND ${guard}`).bind(collectionId, ...guardValues),
        env.DB!.prepare(`DELETE FROM ownership_transfers WHERE collection_id = ? AND ${guard}`).bind(collectionId, ...guardValues),
        env.DB!.prepare(`DELETE FROM memberships WHERE collection_id = ? AND ${guard}`).bind(collectionId, ...guardValues),
        env.DB!.prepare("DELETE FROM collections WHERE id = ? AND owner_user_id = ? AND name = ?").bind(collectionId, user.id, name),
      ];
      const result = await env.DB!.batch(statements);
      if (!result.at(-1)?.meta.changes) return errorResponse("群組資料已更改，請重新整理再試。", 409);
      if (env.BUCKET) {
        const cleanup = await Promise.allSettled(storedPhotos.filter((photo) => !photo.dataBase64).map((photo) => env.BUCKET!.delete(photo.objectKey)));
        if (cleanup.some((item) => item.status === "rejected")) console.error("Some deleted collection photos could not be removed from object storage");
      }
      return Response.json({ ok: true });
    }

    if (subpath === "members" && request.method === "GET") {
      if (access.role !== "owner") return errorResponse("只有群組擁有人可以查看成員資料。", 403);
      const owner = await db.select({ id: users.id, email: users.email, name: users.name }).from(collections)
        .innerJoin(users, eq(collections.ownerUserId, users.id)).where(eq(collections.id, collectionId)).get();
      const members = await db.select({ id: users.id, email: users.email, name: users.name, role: memberships.role }).from(memberships)
        .innerJoin(users, eq(memberships.userId, users.id)).where(eq(memberships.collectionId, collectionId));
      const pendingInvites = await db.select({ id: invites.id, email: invites.email, role: invites.role, expiresAt: invites.expiresAt }).from(invites)
        .where(and(eq(invites.collectionId, collectionId), gt(invites.expiresAt, Date.now()), isNull(invites.acceptedAt)));
      const transfer = await db.select({ toUserId: ownershipTransfers.toUserId, expiresAt: ownershipTransfers.expiresAt }).from(ownershipTransfers)
        .where(eq(ownershipTransfers.collectionId, collectionId)).get();
      return Response.json({ owner: owner ? { ...owner, role: "owner" } : null, members, invites: pendingInvites, transfer }, { headers: noStore });
    }

    if (subpath === "invites" && request.method === "POST") {
      if (access.role !== "owner") return errorResponse("只有群組擁有人可以邀請成員。", 403);
      const body = await request.json().catch(() => null) as { email?: unknown; role?: unknown } | null;
      const email = normalizedEmail(body?.email);
      if (!validEmail(email) || !validRole(body?.role)) return errorResponse("請填寫有效電郵並選擇權限。", 400);
      if (email === user.email.toLowerCase()) return errorResponse("你已經是群組擁有人。", 400);
      const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).get();
      if (existing) {
        const member = await db.select({ userId: memberships.userId }).from(memberships)
          .where(and(eq(memberships.collectionId, collectionId), eq(memberships.userId, existing.id))).get();
        if (member) return errorResponse("這位用戶已是群組成員。", 409);
      }
      const token = newInviteToken();
      const id = crypto.randomUUID();
      await db.insert(invites).values({ id, collectionId, email, role: body.role, tokenHash: await tokenHash(token), expiresAt: Date.now() + 7 * 86_400_000, createdAt: new Date().toISOString() });
      return Response.json({ id, link: `https://bunbun.space/closerice/?invite=${encodeURIComponent(token)}` }, { status: 201, headers: noStore });
    }

    const inviteMatch = /^invites\/([^/]+)$/.exec(subpath);
    if (inviteMatch && request.method === "DELETE") {
      if (access.role !== "owner") return errorResponse("只有群組擁有人可以撤銷邀請。", 403);
      await db.delete(invites).where(and(eq(invites.id, inviteMatch[1]), eq(invites.collectionId, collectionId)));
      return Response.json({ ok: true });
    }

    const memberMatch = /^members\/([^/]+)$/.exec(subpath);
    if (memberMatch && (request.method === "PATCH" || request.method === "DELETE")) {
      if (access.role !== "owner") return errorResponse("只有群組擁有人可以管理成員。", 403);
      if (request.method === "DELETE") {
        await db.delete(memberships).where(and(eq(memberships.collectionId, collectionId), eq(memberships.userId, memberMatch[1])));
        await db.delete(ownershipTransfers).where(and(eq(ownershipTransfers.collectionId, collectionId), eq(ownershipTransfers.toUserId, memberMatch[1])));
      } else {
        const body = await request.json().catch(() => null) as { role?: unknown } | null;
        if (!validRole(body?.role)) return errorResponse("請選擇可編輯或只可查看。", 400);
        const updated = await db.update(memberships).set({ role: body.role }).where(and(eq(memberships.collectionId, collectionId), eq(memberships.userId, memberMatch[1]))).returning({ userId: memberships.userId });
        if (!updated.length) return errorResponse("找不到成員。", 404);
      }
      return Response.json({ ok: true });
    }

    if (subpath === "transfer" && request.method === "POST") {
      if (access.role !== "owner") return errorResponse("只有群組擁有人可以轉讓擁有權。", 403);
      const body = await request.json().catch(() => null) as { userId?: unknown } | null;
      const toUserId = typeof body?.userId === "string" ? body.userId : "";
      const target = await db.select({ userId: memberships.userId }).from(memberships)
        .where(and(eq(memberships.collectionId, collectionId), eq(memberships.userId, toUserId))).get();
      if (!target) return errorResponse("請先邀請對方加入群組。", 400);
      await db.insert(ownershipTransfers).values({ collectionId, fromUserId: user.id, toUserId, expiresAt: Date.now() + 7 * 86_400_000 })
        .onConflictDoUpdate({ target: ownershipTransfers.collectionId, set: { fromUserId: user.id, toUserId, expiresAt: Date.now() + 7 * 86_400_000 } });
      return Response.json({ ok: true });
    }

    if (subpath === "transfer" && request.method === "DELETE") {
      if (access.role !== "owner") return errorResponse("只有群組擁有人可以取消轉讓。", 403);
      await db.delete(ownershipTransfers).where(eq(ownershipTransfers.collectionId, collectionId));
      return Response.json({ ok: true });
    }

    if (subpath === "transfer/accept" && request.method === "POST") {
      const transfer = await db.select().from(ownershipTransfers)
        .where(and(eq(ownershipTransfers.collectionId, collectionId), eq(ownershipTransfers.toUserId, user.id), gt(ownershipTransfers.expiresAt, Date.now()))).get();
      if (!transfer) return errorResponse("找不到待接受的擁有權轉讓。", 404);
      const result = await env.DB!.batch([
        env.DB!.prepare("UPDATE collections SET owner_user_id = ? WHERE id = ? AND owner_user_id = ? AND EXISTS (SELECT 1 FROM ownership_transfers WHERE collection_id = ? AND from_user_id = ? AND to_user_id = ? AND expires_at > ?)")
          .bind(user.id, collectionId, transfer.fromUserId, collectionId, transfer.fromUserId, user.id, Date.now()),
        env.DB!.prepare("INSERT INTO memberships (collection_id,user_id,role,created_at) SELECT ?,?,'editor',? WHERE EXISTS (SELECT 1 FROM collections WHERE id = ? AND owner_user_id = ?) ON CONFLICT(collection_id,user_id) DO UPDATE SET role = 'editor'")
          .bind(collectionId, transfer.fromUserId, new Date().toISOString(), collectionId, user.id),
        env.DB!.prepare("DELETE FROM memberships WHERE collection_id = ? AND user_id = ? AND EXISTS (SELECT 1 FROM collections WHERE id = ? AND owner_user_id = ?)")
          .bind(collectionId, user.id, collectionId, user.id),
        env.DB!.prepare("DELETE FROM ownership_transfers WHERE collection_id = ? AND from_user_id = ? AND to_user_id = ? AND EXISTS (SELECT 1 FROM collections WHERE id = ? AND owner_user_id = ?)")
          .bind(collectionId, transfer.fromUserId, user.id, collectionId, user.id),
      ]);
      if (!result[0].meta.changes) return errorResponse("轉讓已失效。", 409);
      return Response.json({ ok: true });
    }

    return errorResponse("找不到頁面。", 404);
  } catch (error) {
    return serverError(error);
  }
}

export async function handleTagsApi(request: Request, path: string): Promise<Response> {
  try {
    const access = await getCollectionAccess(request, request.method !== "GET");
    if (!access) return errorResponse("請登入並選擇有權限的群組。", 403);
    const db = getDb();
    if (path === "/api/tags" && request.method === "GET") {
      const rows = await db.select({ id: tags.id, name: tags.name, createdBy: tags.createdBy }).from(tags).where(eq(tags.collectionId, access.collectionId));
      return Response.json({ tags: rows }, { headers: noStore });
    }
    if (path === "/api/tags" && request.method === "POST") {
      const body = await request.json().catch(() => null) as { name?: unknown } | null;
      const name = typeof body?.name === "string" ? body.name.trim() : "";
      if (!name || name.length > 24) return errorResponse("標籤名稱需為 1 至 24 字。", 400);
      const count = await db.select({ id: tags.id }).from(tags).where(eq(tags.collectionId, access.collectionId));
      if (count.length >= 100) return errorResponse("每個群組最多可建立 100 個標籤。", 400);
      const id = crypto.randomUUID();
      try { await db.insert(tags).values({ id, collectionId: access.collectionId, name, createdBy: access.user.id, createdAt: new Date().toISOString() }); }
      catch { return errorResponse("這個標籤已存在。", 409); }
      return Response.json({ id, name }, { status: 201 });
    }
    const match = /^\/api\/tags\/([^/]+)$/.exec(path);
    if (match && request.method === "DELETE") {
      const tag = await db.select({ id: tags.id, createdBy: tags.createdBy }).from(tags)
        .where(and(eq(tags.id, match[1]), eq(tags.collectionId, access.collectionId))).get();
      if (!tag) return errorResponse("找不到標籤。", 404);
      if (access.role !== "owner" && tag.createdBy !== access.user.id) return errorResponse("只有標籤建立者或群組擁有人可以刪除。", 403);
      await db.delete(tags).where(eq(tags.id, tag.id));
      return Response.json({ ok: true });
    }
    return errorResponse("找不到頁面。", 404);
  } catch (error) {
    return serverError(error);
  }
}

export async function validTagIds(collectionId: string, candidate: unknown): Promise<string[] | null> {
  if (candidate === undefined) return [];
  if (!Array.isArray(candidate) || candidate.length > 10 || candidate.some((id) => typeof id !== "string" || id.length > 80)) return null;
  const ids = [...new Set(candidate as string[])];
  if (!ids.length) return [];
  const found = await getDb().select({ id: tags.id }).from(tags).where(and(eq(tags.collectionId, collectionId), inArray(tags.id, ids)));
  return found.length === ids.length ? ids : null;
}
