import { env } from "cloudflare:workers";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { restaurantBranches } from "../db/schema";
import { getCollectionAccess, getSessionUser, isSiteAdmin, tokenHash } from "./auth";
import type { RestaurantProfile } from "./restaurant-profile";
import { restaurantDetailsInput } from "./restaurant-profile-input";
import { errorResponse, serverError } from "./reviews";

export async function ensureRestaurantBranch(collectionId: string, name: string, district: string | null): Promise<string> {
  const db = getDb();
  const now = new Date().toISOString();
  await db.insert(restaurantBranches).values({ id: crypto.randomUUID(), collectionId, name: name.trim(), district: district ?? "", createdAt: now, updatedAt: now }).onConflictDoNothing();
  const branch = await db.select({ id: restaurantBranches.id }).from(restaurantBranches).where(and(eq(restaurantBranches.collectionId, collectionId), eq(restaurantBranches.name, name.trim()), eq(restaurantBranches.district, district ?? ""))).get();
  if (!branch) throw new Error("Could not identify restaurant branch");
  return branch.id;
}

const noStore = { "Cache-Control": "private, no-store" };
function json(value: unknown) { return Response.json(value, { headers: noStore }); }
async function readBody(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.includes("application/json")) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.length;
    if (size > 16000) { await reader.cancel(); return null; }
    chunks.push(chunk.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { return null; }
}

type EnrichmentAccess = { actorId: string | null; collections: string[] | null };
async function enrichmentAccess(request: Request): Promise<EnrichmentAccess | null> {
  const bearer = request.headers.get("Authorization");
  if (bearer) {
    // No service credential is created by this release. Fail closed until explicitly configured.
    const expected = env.RESTAURANT_ENRICHMENT_TOKEN_HASH;
    const allowed = (env.RESTAURANT_ENRICHMENT_COLLECTION_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean);
    if (!expected || !allowed.length || !bearer.startsWith("Bearer ") || bearer.length > 200) return null;
    if (await tokenHash(bearer.slice(7)) !== expected) return null;
    return { actorId: null, collections: allowed };
  }
  const user = await getSessionUser(request);
  if (!user || !await isSiteAdmin(user.id)) return null;
  if (request.method !== "GET" && request.headers.get("Origin") !== "https://bunbun.space") return null;
  return { actorId: user.id, collections: null };
}

export async function handleRestaurantApi(request: Request, path: string): Promise<Response> {
  try {
    const enrichment = path.startsWith("/api/enrichment/");
    const access = enrichment ? await enrichmentAccess(request) : await getCollectionAccess(request, request.method !== "GET");
    if (!access) return errorResponse("請先登入並確認餐廳資料權限。", 403);
    const db = getDb();
    const service = enrichment ? access as EnrichmentAccess : null;
    const collectionId = !enrichment ? (access as { collectionId: string }).collectionId : null;
    // Exact profile IDs only: excluding a test branch must not hide similarly named real restaurants.
    const excludedIds = enrichment ? (env.RESTAURANT_ENRICHMENT_EXCLUDED_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean) : [];
    if (path === "/api/enrichment/restaurants" && request.method === "GET") {
      const params = new URL(request.url).searchParams;
      const cursor = (params.get("cursor") ?? "").slice(0, 80);
      const limit = Math.min(50, Math.max(1, Number.parseInt(params.get("limit") ?? "25", 10) || 25));
      const before = new Date(Date.now() - 7 * 86400000).toISOString();
      const rows = await db.select().from(restaurantBranches).where(and(
        sql`${restaurantBranches.id} > ${cursor}`,
        eq(restaurantBranches.manualLock, false),
        excludedIds.length ? sql`${restaurantBranches.id} NOT IN (${sql.join(excludedIds.map((id) => sql`${id}`), sql`, `)})` : undefined,
        eq(restaurantBranches.openriceUrl, ""),
        eq(restaurantBranches.foodpandaUrl, ""),
        sql`(${restaurantBranches.checkedAt} IS NULL OR ${restaurantBranches.checkedAt} < ${before})`,
        sql`EXISTS (SELECT 1 FROM reviews r WHERE r.restaurant_id = ${restaurantBranches.id} AND r.collection_id = ${restaurantBranches.collectionId})`,
        service?.collections ? sql`${restaurantBranches.collectionId} IN (${sql.join(service.collections.map((id) => sql`${id}`), sql`, `)})` : undefined,
      )).orderBy(restaurantBranches.id).limit(limit + 1);
      return json({ restaurants: rows.slice(0, limit), nextCursor: rows.length > limit ? rows[limit - 1].id : null });
    }
    const match = /^\/api\/(?:enrichment\/)?restaurants\/([^/]+)$/.exec(path);
    if (!match) return errorResponse("找不到頁面。", 404);
    if (enrichment && excludedIds.includes(match[1])) return errorResponse("此餐廳已排除自動資料補充。", 404);
    const current = await db.select().from(restaurantBranches).where(eq(restaurantBranches.id, match[1])).get() as RestaurantProfile | undefined;
    if (!current || (collectionId && current.collectionId !== collectionId) || (service?.collections && !service.collections.includes(current.collectionId))) return errorResponse("找不到餐廳。", 404);
    if (request.method === "GET") return json({ restaurant: current });
    if (request.method !== "PATCH") return errorResponse("不支援此操作。", 405);
    const parsed = restaurantDetailsInput.safeParse(await readBody(request));
    if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "請檢查餐廳資料。", 400);
    if (enrichment && current.manualLock) return errorResponse("餐廳資料已由成員確認，不能自動覆寫。", 409);
    const { expectedVersion, ...inputDetails } = parsed.data;
    const details = { openriceUrl: inputDetails.openriceUrl ?? current.openriceUrl, foodpandaUrl: inputDetails.foodpandaUrl ?? current.foodpandaUrl, reviewState: inputDetails.reviewState ?? current.reviewState, reviewNotes: inputDetails.reviewNotes ?? current.reviewNotes };
    if (inputDetails.reviewState === "verified" && !details.openriceUrl && !details.foodpandaUrl) return errorResponse("確認分店前請提供已核對的餐廳連結。", 400);
    if (enrichment && current.openriceUrl && details.openriceUrl !== current.openriceUrl) return errorResponse("已有 OpenRice 連結不能自動覆寫；請由成員確認。", 409);
    if (enrichment && current.foodpandaUrl && details.foodpandaUrl !== current.foodpandaUrl) return errorResponse("已有 Foodpanda 連結不能自動覆寫；請由成員確認。", 409);
    const now = new Date().toISOString();
    const actor = enrichment ? service!.actorId : (access as { user: { id: string } }).user.id;
    const after = { ...current, ...details, checkedAt: now, updatedAt: now, manualLock: !enrichment, version: expectedVersion + 1 };
    // The guarded audit and update commit together; stale writers create neither.
    const result = await env.DB!.batch([
      env.DB!.prepare("INSERT INTO admin_audit (id,actor_user_id,action,target_type,target_id,before_json,after_json,created_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM restaurant_branches WHERE id=? AND version=?)")
        .bind(crypto.randomUUID(), actor, enrichment ? "restaurant.enrich" : "restaurant.update", "restaurant", current.id, JSON.stringify(current), JSON.stringify(after), now, current.id, expectedVersion),
      env.DB!.prepare("UPDATE restaurant_branches SET openrice_url=?,foodpanda_url=?,review_state=?,review_notes=?,checked_at=?,updated_at=?,manual_lock=?,version=version+1 WHERE id=? AND version=?")
        .bind(details.openriceUrl, details.foodpandaUrl, details.reviewState, details.reviewNotes, now, now, enrichment ? 0 : 1, current.id, expectedVersion),
    ]);
    if (!result[1].meta.changes) return errorResponse("資料已被其他人更新，請重新讀取後再試。", 409);
    return json({ restaurant: after });
  } catch (error) { return serverError(error); }
}
