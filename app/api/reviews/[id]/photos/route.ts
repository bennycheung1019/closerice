import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { photos, reviews } from "../../../../../db/schema";
import { errorResponse, serverError } from "../../../../../lib/reviews";
import { sharedOwnerId } from "../../../../../lib/shared-collection";

type Context = { params: Promise<{ id: string }> };
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request, context: Context) {
  const { id: reviewId } = await context.params;
  try {
    const ownerId = sharedOwnerId();
    const db = getDb();
    const row = await db.select({ id: reviews.id }).from(reviews)
      .where(and(eq(reviews.id, reviewId), eq(reviews.ownerId, ownerId))).get();
    if (!row) return errorResponse("找不到紀錄。", 404);
    const existing = await db.select({ id: photos.id }).from(photos)
      .where(and(eq(photos.reviewId, reviewId), eq(photos.ownerId, ownerId)));
    if (existing.length >= 5) return errorResponse("每筆紀錄最多可放 5 張相片。", 400);
    const form = await request.formData();
    const file = form.get("photo");
    if (!(file instanceof File) || !allowedTypes.has(file.type) || file.size > 1024 * 1024 || file.size === 0) {
      return errorResponse("相片壓縮後須少於 1 MB，請換一張再試。", 400);
    }
    const photoId = crypto.randomUUID();
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 8192) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    }
    await db.insert(photos).values({ id: photoId, reviewId, ownerId, objectKey: `d1:${photoId}`, dataBase64: btoa(binary), contentType: file.type, originalName: file.name.slice(0, 160), createdAt: new Date().toISOString() });
    return Response.json({ id: photoId, url: `/api/photos/${photoId}` }, { status: 201 });
  } catch (error) {
    return serverError(error);
  }
}
