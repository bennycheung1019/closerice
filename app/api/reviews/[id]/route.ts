import { and, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../../db";
import { photos, reviewTags, reviews } from "../../../../db/schema";
import { errorResponse, reviewInput, serverError } from "../../../../lib/reviews";
import { getCollectionAccess } from "../../../../lib/auth";
import { validTagIds } from "../../../../lib/collection-api";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = reviewInput.safeParse(body);
  if (!parsed.success) return errorResponse("請檢查必填欄位和分數。", 400);
  try {
    const access = await getCollectionAccess(request, true);
    if (!access) return errorResponse("你沒有編輯食評的權限。", 403);
    const submittedTagIds = (body as { tagIds?: unknown })?.tagIds;
    const tagIds = submittedTagIds === undefined ? undefined : await validTagIds(access.collectionId, submittedTagIds);
    if (tagIds === null) return errorResponse("請選擇這個群組的有效標籤（最多 10 個）。", 400);
    const db = getDb();
    const result = await db.update(reviews).set({ ...parsed.data, updatedAt: new Date().toISOString() })
      .where(and(eq(reviews.id, id), eq(reviews.collectionId, access.collectionId))).returning({ id: reviews.id });
    if (!result.length) return errorResponse("找不到紀錄。", 404);
    if (tagIds) {
      await db.delete(reviewTags).where(eq(reviewTags.reviewId, id));
      if (tagIds.length) await db.insert(reviewTags).values(tagIds.map((tagId) => ({ reviewId: id, tagId })));
    }
    return Response.json({ id });
  } catch (error) {
    return serverError(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const access = await getCollectionAccess(request, true);
    if (!access) return errorResponse("你沒有刪除食評的權限。", 403);
    const db = getDb();
    const row = await db.select({ id: reviews.id }).from(reviews)
      .where(and(eq(reviews.id, id), eq(reviews.collectionId, access.collectionId))).get();
    if (!row) return errorResponse("找不到紀錄。", 404);
    if (env.BUCKET) {
      const images = await db.select({ objectKey: photos.objectKey, dataBase64: photos.dataBase64 }).from(photos).where(and(eq(photos.reviewId, id), eq(photos.collectionId, access.collectionId)));
      await Promise.all(images.filter((image) => !image.dataBase64).map((image) => env.BUCKET!.delete(image.objectKey)));
    }
    await db.delete(reviews).where(and(eq(reviews.id, id), eq(reviews.collectionId, access.collectionId)));
    return Response.json({ ok: true });
  } catch (error) {
    return serverError(error);
  }
}
