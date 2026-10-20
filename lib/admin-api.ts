import { env } from "cloudflare:workers";
import { getSessionUser, isSiteAdmin, newInviteToken, tokenHash } from "./auth";
import { errorResponse, opinionInput, reviewInput, serverError } from "./reviews";

type Admin = { id: string; email: string };
type Row = Record<string, unknown>;
const store = { "Cache-Control": "private, no-store" };
const roles = ["editor", "viewer"];
const settingsKeys = ["registration_enabled", "new_groups_enabled"];

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: store });
}
function safeName(value: unknown, max = 60): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name && name.length <= max && !/[\u0000-\u001f\u007f]/.test(name) ? name : null;
}
function search(request: Request): { q: string; offset: number; collectionId: string } {
  const params = new URL(request.url).searchParams;
  return {
    q: (params.get("q") ?? "").trim().slice(0, 100),
    offset: Math.min(10000, Math.max(0, Number.parseInt(params.get("offset") ?? "0", 10) || 0)),
    collectionId: (params.get("collectionId") ?? "").slice(0, 80),
  };
}
function audit(admin: Admin, action: string, targetType: string, targetId: string, before: unknown, after: unknown) {
  return env.DB!.prepare("INSERT INTO admin_audit (id,actor_user_id,action,target_type,target_id,before_json,after_json,created_at) VALUES (?,?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), admin.id, action, targetType, targetId, before === null ? null : JSON.stringify(before), after === null ? null : JSON.stringify(after), new Date().toISOString());
}
async function one<T>(query: string, ...args: unknown[]): Promise<T | null> {
  return (await env.DB!.prepare(query).bind(...args).first<T>()) ?? null;
}
async function many<T>(query: string, ...args: unknown[]): Promise<T[]> {
  return (await env.DB!.prepare(query).bind(...args).all<T>()).results;
}
async function adminUser(request: Request): Promise<Admin | Response> {
  const user = await getSessionUser(request);
  if (!user) return errorResponse("請先登入。", 401);
  if (!await isSiteAdmin(user.id)) return errorResponse("只有網站管理員可以進入管理後台。", 403);
  return { id: user.id, email: user.email };
}
async function currentSettings() {
  const rows = await many<{ key: string; value: string }>("SELECT key,value FROM site_settings");
  const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return {
    registrationEnabled: values.registration_enabled !== "false",
    newGroupsEnabled: values.new_groups_enabled !== "false",
  };
}

export async function handleAdminApi(request: Request, path: string): Promise<Response> {
  try {
    const admin = await adminUser(request);
    if (admin instanceof Response) return admin;
    const db = env.DB!;

    if (path === "/api/admin/overview" && request.method === "GET") {
      const counts = await one<{ users: number; collections: number; reviews: number; opinions: number }>(
        "SELECT (SELECT count(*) FROM users) users,(SELECT count(*) FROM collections) collections,(SELECT count(*) FROM reviews) reviews,(SELECT count(*) FROM review_opinions) opinions"
      );
      const activity = await many<Row>("SELECT a.id,a.action,a.target_type targetType,a.target_id targetId,a.created_at createdAt,coalesce(nullif(u.display_name,''),u.name,u.email) actor FROM admin_audit a LEFT JOIN users u ON u.id=a.actor_user_id ORDER BY a.created_at DESC LIMIT 20");
      return json({ admin: { email: admin.email }, counts, activity, settings: await currentSettings() });
    }

    if (path === "/api/admin/settings") {
      if (request.method === "GET") return json({ settings: await currentSettings() });
      if (request.method === "PATCH") {
        const body = await request.json().catch(() => null) as { registrationEnabled?: unknown; newGroupsEnabled?: unknown } | null;
        if (!body || typeof body.registrationEnabled !== "boolean" || typeof body.newGroupsEnabled !== "boolean") return errorResponse("請選擇有效設定。", 400);
        const before = await currentSettings();
        const after = { registrationEnabled: body.registrationEnabled, newGroupsEnabled: body.newGroupsEnabled };
        await db.batch([
          db.prepare("UPDATE site_settings SET value=? WHERE key=?").bind(String(after.registrationEnabled), settingsKeys[0]),
          db.prepare("UPDATE site_settings SET value=? WHERE key=?").bind(String(after.newGroupsEnabled), settingsKeys[1]),
          audit(admin, "settings.update", "site", "closerice", before, after),
        ]);
        return json({ settings: after });
      }
    }

    if (path === "/api/admin/users" && request.method === "GET") {
      const { q, offset } = search(request);
      const like = "%" + q + "%";
      const rows = await many<Row>(
        "SELECT u.id,u.email,coalesce(nullif(u.display_name,''),u.name) name,u.display_name displayName,u.picture_url pictureUrl,u.disabled_at disabledAt,u.created_at createdAt," +
        "(SELECT count(*) FROM collections c WHERE c.owner_user_id=u.id)+(SELECT count(*) FROM memberships m WHERE m.user_id=u.id) groupCount," +
        "(SELECT count(*) FROM review_opinions o WHERE o.author_id=u.id) opinionCount," +
        "EXISTS(SELECT 1 FROM site_admins a WHERE a.user_id=u.id) isAdmin FROM users u " +
        "WHERE (?='' OR u.email LIKE ? OR u.name LIKE ? OR u.display_name LIKE ?) ORDER BY u.created_at DESC LIMIT 50 OFFSET ?",
        q, like, like, like, offset
      );
      return json({ users: rows, nextOffset: rows.length === 50 ? offset + 50 : null });
    }

    const user = /^\/api\/admin\/users\/([^/]+)(?:\/(sessions))?$/.exec(path);
    if (user) {
      const target = await one<{ id: string; email: string; name: string; display_name: string | null; disabled_at: number | null }>(
        "SELECT id,email,name,display_name,disabled_at FROM users WHERE id=?", user[1]
      );
      if (!target) return errorResponse("找不到用戶。", 404);
      if (user[2] === "sessions" && request.method === "DELETE") {
        await db.batch([
          db.prepare("DELETE FROM sessions WHERE user_id=?").bind(target.id),
          audit(admin, "user.sessions.revoke", "user", target.id, null, { email: target.email }),
        ]);
        return json({ ok: true });
      }
      if (!user[2] && request.method === "PATCH") {
        const body = await request.json().catch(() => null) as { displayName?: unknown; disabled?: unknown } | null;
        if (!body || (body.displayName === undefined && body.disabled === undefined)) return errorResponse("沒有需要更改的資料。", 400);
        if (body.displayName !== undefined && (typeof body.displayName !== "string" || body.displayName.trim().length > 60 || /[\u0000-\u001f\u007f]/.test(body.displayName))) return errorResponse("顯示名稱無效。", 400);
        if (body.disabled !== undefined && typeof body.disabled !== "boolean") return errorResponse("帳戶狀態無效。", 400);
        if (target.id === admin.id && body.disabled === true) return errorResponse("不能停用自己的管理員帳戶。", 400);
        const after = {
          displayName: body.displayName === undefined ? target.display_name : body.displayName.trim() || null,
          disabledAt: body.disabled === undefined ? target.disabled_at : body.disabled ? (target.disabled_at ?? Date.now()) : null,
        };
        const operations = [
          db.prepare("UPDATE users SET display_name=?,disabled_at=? WHERE id=?").bind(after.displayName, after.disabledAt, target.id),
          audit(admin, "user.update", "user", target.id, { displayName: target.display_name, disabledAt: target.disabled_at }, after),
        ];
        if (after.disabledAt) operations.push(db.prepare("DELETE FROM sessions WHERE user_id=?").bind(target.id));
        await db.batch(operations);
        return json({ ok: true });
      }
    }

    if (path === "/api/admin/collections" && request.method === "GET") {
      const { q, offset } = search(request);
      const like = "%" + q + "%";
      const rows = await many<Row>(
        "SELECT c.id,c.name,c.created_at createdAt,c.owner_user_id ownerUserId,coalesce(nullif(u.display_name,''),u.name,u.email) ownerName,u.email ownerEmail," +
        "(SELECT count(*) FROM memberships m WHERE m.collection_id=c.id)+1 memberCount,(SELECT count(*) FROM reviews r WHERE r.collection_id=c.id) reviewCount " +
        "FROM collections c LEFT JOIN users u ON u.id=c.owner_user_id WHERE (?='' OR c.name LIKE ? OR u.email LIKE ?) ORDER BY c.created_at DESC LIMIT 50 OFFSET ?",
        q, like, like, offset
      );
      return json({ collections: rows, nextOffset: rows.length === 50 ? offset + 50 : null });
    }

    const group = /^\/api\/admin\/collections\/([^/]+)(?:\/(members|invites|tags)(?:\/([^/]+))?)?$/.exec(path);
    if (group) {
      const id = group[1];
      const current = await one<{ id: string; name: string; owner_user_id: string | null }>("SELECT id,name,owner_user_id FROM collections WHERE id=?", id);
      if (!current) return errorResponse("找不到群組。", 404);
      const part = group[2] ?? "";
      const partId = group[3];
      if (!part && request.method === "GET") {
        const members = await many<Row>("SELECT m.user_id id,u.email,coalesce(nullif(u.display_name,''),u.name) name,u.picture_url pictureUrl,m.role,u.disabled_at disabledAt FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.collection_id=? ORDER BY u.email", id);
        const invites = await many<Row>("SELECT id,email,role,expires_at expiresAt FROM invites WHERE collection_id=? AND accepted_at IS NULL AND expires_at>? ORDER BY created_at DESC", id, Date.now());
        const tags = await many<Row>("SELECT id,name FROM tags WHERE collection_id=? ORDER BY name", id);
        return json({ collection: current, members, invites, tags });
      }
      if (!part && request.method === "PATCH") {
        const body = await request.json().catch(() => null) as { name?: unknown; ownerUserId?: unknown } | null;
        if (!body || (body.name === undefined && body.ownerUserId === undefined)) return errorResponse("沒有需要更改的資料。", 400);
        const name = body.name === undefined ? current.name : safeName(body.name);
        if (!name) return errorResponse("群組名稱需為 1 至 60 字。", 400);
        if (body.ownerUserId !== undefined && (typeof body.ownerUserId !== "string" || !body.ownerUserId)) return errorResponse("請選擇新擁有人。", 400);
        const ownerId = body.ownerUserId === undefined ? current.owner_user_id : body.ownerUserId;
        if (ownerId !== current.owner_user_id) {
          const member = await one<{ id: string }>("SELECT u.id FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.collection_id=? AND u.id=? AND u.disabled_at IS NULL", id, ownerId);
          if (!member) return errorResponse("新擁有人必須是啟用中的群組成員。", 400);
        }
        const operations = [db.prepare("UPDATE collections SET name=?,owner_user_id=? WHERE id=?").bind(name, ownerId, id)];
        if (ownerId !== current.owner_user_id) {
          if (current.owner_user_id) operations.push(db.prepare("INSERT INTO memberships (collection_id,user_id,role,created_at) VALUES (?,?,'editor',?) ON CONFLICT(collection_id,user_id) DO UPDATE SET role='editor'").bind(id, current.owner_user_id, new Date().toISOString()));
          operations.push(db.prepare("DELETE FROM memberships WHERE collection_id=? AND user_id=?").bind(id, ownerId));
          operations.push(db.prepare("DELETE FROM ownership_transfers WHERE collection_id=?").bind(id));
        }
        operations.push(audit(admin, "collection.update", "collection", id, { name: current.name, ownerUserId: current.owner_user_id }, { name, ownerUserId: ownerId }));
        await db.batch(operations);
        return json({ ok: true });
      }
      if (!part && request.method === "DELETE") {
        const body = await request.json().catch(() => null) as { name?: unknown } | null;
        if (body?.name !== current.name) return errorResponse("請輸入完整群組名稱以確認刪除。", 400);
        const photoRows = await many<{ object_key: string; data_base64: string | null }>(
          "SELECT p.object_key,p.data_base64 FROM photos p JOIN reviews r ON r.id=p.review_id WHERE r.collection_id=?", id
        );
        await db.batch([
          db.prepare("DELETE FROM photos WHERE review_id IN (SELECT id FROM reviews WHERE collection_id=?)").bind(id),
          db.prepare("DELETE FROM review_tags WHERE review_id IN (SELECT id FROM reviews WHERE collection_id=?)").bind(id),
          db.prepare("DELETE FROM review_opinions WHERE review_id IN (SELECT id FROM reviews WHERE collection_id=?)").bind(id),
          db.prepare("DELETE FROM reviews WHERE collection_id=?").bind(id),
          db.prepare("DELETE FROM tags WHERE collection_id=?").bind(id),
          db.prepare("DELETE FROM invites WHERE collection_id=?").bind(id),
          db.prepare("DELETE FROM ownership_transfers WHERE collection_id=?").bind(id),
          db.prepare("DELETE FROM memberships WHERE collection_id=?").bind(id),
          db.prepare("DELETE FROM collections WHERE id=? AND name=?").bind(id, current.name),
          audit(admin, "collection.delete", "collection", id, { name: current.name, ownerUserId: current.owner_user_id }, null),
        ]);
        if (env.BUCKET) await Promise.allSettled(photoRows.filter((row) => !row.data_base64).map((row) => env.BUCKET!.delete(row.object_key)));
        return json({ ok: true });
      }
      if (part === "members" && !partId && request.method === "POST") {
        const body = await request.json().catch(() => null) as { email?: unknown; role?: unknown } | null;
        const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
        if (!body || !email || !roles.includes(String(body.role))) return errorResponse("請選擇用戶及權限。", 400);
        const target = await one<{ id: string }>("SELECT id FROM users WHERE lower(email)=? AND disabled_at IS NULL", email);
        if (!target) return errorResponse("找不到可用的用戶。", 404);
        if (target.id === current.owner_user_id) return errorResponse("群組擁有人已有完整權限。", 400);
        const before = await one<{ role: string }>("SELECT role FROM memberships WHERE collection_id=? AND user_id=?", id, target.id);
        await db.batch([
          db.prepare("INSERT INTO memberships (collection_id,user_id,role,created_at) VALUES (?,?,?,?) ON CONFLICT(collection_id,user_id) DO UPDATE SET role=excluded.role").bind(id, target.id, body.role, new Date().toISOString()),
          audit(admin, "membership.upsert", "collection", id, before, { userId: target.id, role: body.role }),
        ]);
        return json({ ok: true });
      }
      if (part === "members" && partId && (request.method === "PATCH" || request.method === "DELETE")) {
        const before = await one<{ role: string }>("SELECT role FROM memberships WHERE collection_id=? AND user_id=?", id, partId);
        if (!before) return errorResponse("找不到成員。", 404);
        if (request.method === "DELETE") {
          await db.batch([
            db.prepare("DELETE FROM memberships WHERE collection_id=? AND user_id=?").bind(id, partId),
            db.prepare("DELETE FROM ownership_transfers WHERE collection_id=? AND to_user_id=?").bind(id, partId),
            audit(admin, "membership.remove", "collection", id, { userId: partId, role: before.role }, null),
          ]);
        } else {
          const body = await request.json().catch(() => null) as { role?: unknown } | null;
          if (!roles.includes(String(body?.role))) return errorResponse("請選擇可編輯或只可查看。", 400);
          await db.batch([
            db.prepare("UPDATE memberships SET role=? WHERE collection_id=? AND user_id=?").bind(body!.role, id, partId),
            audit(admin, "membership.update", "collection", id, { userId: partId, role: before.role }, { userId: partId, role: body!.role }),
          ]);
        }
        return json({ ok: true });
      }
      if (part === "invites" && !partId && request.method === "POST") {
        const body = await request.json().catch(() => null) as { email?: unknown; role?: unknown } | null;
        const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
        if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !roles.includes(String(body?.role))) return errorResponse("請填寫有效電郵及權限。", 400);
        const token = newInviteToken();
        const inviteId = crypto.randomUUID();
        await db.batch([
          db.prepare("INSERT INTO invites (id,collection_id,email,role,token_hash,expires_at,created_at) VALUES (?,?,?,?,?,?,?)").bind(inviteId, id, email, body!.role, await tokenHash(token), Date.now() + 7 * 86400000, new Date().toISOString()),
          audit(admin, "invite.create", "collection", id, null, { email, role: body!.role }),
        ]);
        return json({ id: inviteId, link: "https://bunbun.space/closerice/?invite=" + encodeURIComponent(token) }, 201);
      }
      if (part === "invites" && partId && request.method === "DELETE") {
        const before = await one<Row>("SELECT email,role FROM invites WHERE id=? AND collection_id=?", partId, id);
        if (!before) return errorResponse("找不到邀請。", 404);
        await db.batch([
          db.prepare("DELETE FROM invites WHERE id=? AND collection_id=?").bind(partId, id),
          audit(admin, "invite.revoke", "collection", id, before, null),
        ]);
        return json({ ok: true });
      }
      if (part === "tags" && !partId && request.method === "POST") {
        const body = await request.json().catch(() => null) as { name?: unknown } | null;
        const name = safeName(body?.name, 24);
        if (!name) return errorResponse("標籤名稱需為 1 至 24 字。", 400);
        const count = await one<{ count: number }>("SELECT count(*) count FROM tags WHERE collection_id=?", id);
        if ((count?.count ?? 0) >= 10) return errorResponse("每群組最多 10 個標籤。", 400);
        const tagId = crypto.randomUUID();
        await db.batch([
          db.prepare("INSERT INTO tags (id,collection_id,name,created_by,created_at) VALUES (?,?,?,?,?)").bind(tagId, id, name, admin.id, new Date().toISOString()),
          audit(admin, "tag.create", "collection", id, null, { tagId, name }),
        ]);
        return json({ id: tagId }, 201);
      }
      if (part === "tags" && partId && request.method === "DELETE") {
        const before = await one<Row>("SELECT name FROM tags WHERE id=? AND collection_id=?", partId, id);
        if (!before) return errorResponse("找不到標籤。", 404);
        await db.batch([
          db.prepare("DELETE FROM tags WHERE id=? AND collection_id=?").bind(partId, id),
          audit(admin, "tag.delete", "collection", id, before, null),
        ]);
        return json({ ok: true });
      }
    }

    if (path === "/api/admin/reviews" && request.method === "GET") {
      const { q, offset, collectionId } = search(request);
      const like = "%" + q + "%";
      const rows = await many<Row>(
        "SELECT r.id,r.collection_id collectionId,c.name collectionName,r.restaurant,r.food,r.dining_date diningDate,r.channel,r.status,r.amount_cents amountCents," +
        "r.order_number orderNumber,r.district,r.created_by createdBy,coalesce(nullif(u.display_name,''),u.name,u.email) creatorName," +
        "(SELECT count(*) FROM review_opinions o WHERE o.review_id=r.id) opinionCount," +
        "(SELECT round(avg(o.score),1) FROM review_opinions o WHERE o.review_id=r.id AND o.score IS NOT NULL) averageScore " +
        "FROM reviews r JOIN collections c ON c.id=r.collection_id LEFT JOIN users u ON u.id=r.created_by " +
        "WHERE (?='' OR r.collection_id=?) AND (?='' OR r.restaurant LIKE ? OR r.food LIKE ? OR r.order_number LIKE ?) " +
        "ORDER BY r.dining_date DESC,r.created_at DESC LIMIT 50 OFFSET ?",
        collectionId, collectionId, q, like, like, like, offset
      );
      return json({ reviews: rows, nextOffset: rows.length === 50 ? offset + 50 : null });
    }
    const review = /^\/api\/admin\/reviews\/([^/]+)$/.exec(path);
    if (review) {
      const id = review[1];
      const current = await one<Record<string, unknown>>(
        "SELECT id,collection_id collectionId,dining_date diningDate,restaurant,food,channel,status,order_number orderNumber,amount_cents amountCents,district,created_by createdBy,created_at createdAt,updated_at updatedAt FROM reviews WHERE id=?", id
      );
      if (!current) return errorResponse("找不到紀錄。", 404);
      if (request.method === "GET") {
        const opinions = await many<Row>(
          "SELECT o.id,o.author_id authorId,o.comment,o.score,o.created_at createdAt,o.updated_at updatedAt,coalesce(nullif(u.display_name,''),u.name,u.email) authorName,u.picture_url pictureUrl FROM review_opinions o LEFT JOIN users u ON u.id=o.author_id WHERE o.review_id=? ORDER BY o.created_at", id
        );
        const photos = await many<Row>("SELECT id,original_name name,content_type contentType FROM photos WHERE review_id=? ORDER BY created_at", id);
        const tags = await many<Row>("SELECT t.id,t.name FROM review_tags rt JOIN tags t ON t.id=rt.tag_id WHERE rt.review_id=?", id);
        const availableTags = await many<Row>("SELECT id,name FROM tags WHERE collection_id=? ORDER BY name", current.collectionId);
        return json({ review: current, opinions, photos, tags, availableTags });
      }
      if (request.method === "PATCH") {
        const body = await request.json().catch(() => null) as Record<string, unknown> | null;
        const parsed = reviewInput.safeParse(body);
        if (!parsed.success) return errorResponse("請檢查用餐資料。", 400);
        if (body?.tagIds !== undefined && (!Array.isArray(body.tagIds) || body.tagIds.length > 10 || body.tagIds.some((value) => typeof value !== "string"))) return errorResponse("標籤資料無效。", 400);
        const tagIds = body?.tagIds as string[] | undefined;
        if (tagIds) {
          const ids = [...new Set(tagIds)];
          if (ids.length) {
            const placeholders = ids.map(() => "?").join(",");
            const found = await one<{ count: number }>("SELECT count(*) count FROM tags WHERE collection_id=? AND id IN (" + placeholders + ")", current.collectionId, ...ids);
            if (found?.count !== ids.length) return errorResponse("標籤不屬於這個群組。", 400);
          }
        }
        const data = parsed.data;
        const operations = [
          db.prepare("UPDATE reviews SET dining_date=?,restaurant=?,food=?,channel=?,status=?,order_number=?,amount_cents=?,district=?,updated_at=? WHERE id=?")
            .bind(data.diningDate, data.restaurant, data.food, data.channel, data.status, data.orderNumber, data.amountCents, data.district, new Date().toISOString(), id),
        ];
        if (tagIds) {
          operations.push(db.prepare("DELETE FROM review_tags WHERE review_id=?").bind(id));
          for (const tagId of [...new Set(tagIds)]) operations.push(db.prepare("INSERT INTO review_tags (review_id,tag_id) VALUES (?,?)").bind(id, tagId));
        }
        operations.push(audit(admin, "review.update", "review", id, current, { ...data, tagIds }));
        await db.batch(operations);
        return json({ ok: true });
      }
      if (request.method === "DELETE") {
        const photos = await many<{ object_key: string; data_base64: string | null }>("SELECT object_key,data_base64 FROM photos WHERE review_id=?", id);
        await db.batch([
          db.prepare("DELETE FROM photos WHERE review_id=?").bind(id),
          db.prepare("DELETE FROM review_tags WHERE review_id=?").bind(id),
          db.prepare("DELETE FROM review_opinions WHERE review_id=?").bind(id),
          db.prepare("DELETE FROM reviews WHERE id=?").bind(id),
          audit(admin, "review.delete", "review", id, current, null),
        ]);
        if (env.BUCKET) await Promise.allSettled(photos.filter((photo) => !photo.data_base64).map((photo) => env.BUCKET!.delete(photo.object_key)));
        return json({ ok: true });
      }
    }
    const opinion = /^\/api\/admin\/opinions\/([^/]+)$/.exec(path);
    if (opinion && (request.method === "PATCH" || request.method === "DELETE")) {
      const current = await one<{ id: string; review_id: string; author_id: string | null; comment: string; score: number | null }>(
        "SELECT id,review_id,author_id,comment,score FROM review_opinions WHERE id=?", opinion[1]
      );
      if (!current) return errorResponse("找不到評語。", 404);
      if (request.method === "DELETE") {
        await db.batch([
          db.prepare("DELETE FROM review_opinions WHERE id=?").bind(current.id),
          audit(admin, "opinion.delete", "opinion", current.id, current, null),
        ]);
      } else {
        const parsed = opinionInput.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return errorResponse("請填寫評語或選擇分數。", 400);
        await db.batch([
          db.prepare("UPDATE review_opinions SET comment=?,score=?,updated_at=? WHERE id=?").bind(parsed.data.comment, parsed.data.score, new Date().toISOString(), current.id),
          audit(admin, "opinion.update", "opinion", current.id, { comment: current.comment, score: current.score }, parsed.data),
        ]);
      }
      return json({ ok: true });
    }
    const photo = /^\/api\/admin\/photos\/([^/]+)$/.exec(path);
    if (photo && (request.method === "GET" || request.method === "DELETE")) {
      const current = await one<{ id: string; review_id: string; object_key: string; data_base64: string | null; content_type: string; original_name: string }>(
        "SELECT id,review_id,object_key,data_base64,content_type,original_name FROM photos WHERE id=?", photo[1]
      );
      if (!current) return errorResponse("找不到相片。", 404);
      if (request.method === "DELETE") {
        await db.batch([
          db.prepare("DELETE FROM photos WHERE id=?").bind(current.id),
          audit(admin, "photo.delete", "photo", current.id, { reviewId: current.review_id, name: current.original_name }, null),
        ]);
        if (!current.data_base64) await env.BUCKET?.delete(current.object_key);
        return json({ ok: true });
      }
      if (current.data_base64) {
        const binary = atob(current.data_base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new Response(bytes, { headers: { "Content-Type": current.content_type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
      }
      const object = await env.BUCKET?.get(current.object_key);
      return object ? new Response(object.body, { headers: { "Content-Type": current.content_type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } }) : errorResponse("相片暫時無法讀取。", 404);
    }

    return errorResponse("找不到頁面。", 404);
  } catch (error) {
    return serverError(error);
  }
}
