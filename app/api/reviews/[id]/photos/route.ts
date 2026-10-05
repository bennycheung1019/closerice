import { and, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../../../chatgpt-auth";
import { getDb } from "../../../../../db";
import { photos, reviews } from "../../../../../db/schema";
import { errorResponse, serverError } from "../../../../../lib/reviews";

type Context = { params: Promise<{ id: string }> };
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request, context: Context) {
  const user = await getChatGPTUser();
  if (!user) return errorResponse("請先登入。", 401);
  const { id: reviewId } = await context.params;
  try {
    const db = getDb();
    const row = await db.select({ id: reviews.id }).from(reviews)
      .where(and(eq(reviews.id, reviewId), eq(reviews.ownerId, user.userId))).get();
    if (!row) return errorResponse("找不到紀錄。", 404);
    const existing = await db.select({ id: photos.id }).from(photos)
      .where(and(eq(photos.reviewId, reviewId), eq(photos.ownerId, user.userId)));
    if (existing.length >= 5) return errorResponse("每筆紀錄最多可放 5 張相片。", 400);
    const form = await request.formData();
    const file = form.get("photo");
    if (!(file instanceof File) || !allowedTypes.has(file.type) || file.size > 8 * 1024 * 1024 || file.size === 0) {
      return errorResponse("請選擇 8 MB 以下的 JPG、PNG 或 WebP 相片。", 400);
    }
    if (!env.BUCKET) return errorResponse("相片儲存暫時未啟用。", 503);
    const photoId = crypto.randomUUID();
    const objectKey = `${user.userId}/${reviewId}/${photoId}`;
    await env.BUCKET.put(objectKey, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
    try {
      await db.insert(photos).values({ id: photoId, reviewId, ownerId: user.userId, objectKey, contentType: file.type, originalName: file.name.slice(0, 160), createdAt: new Date().toISOString() });
    } catch (error) {
      await env.BUCKET.delete(objectKey);
      throw error;
    }
    return Response.json({ id: photoId, url: `/api/photos/${photoId}` }, { status: 201 });
  } catch (error) {
    return serverError(error);
  }
}
