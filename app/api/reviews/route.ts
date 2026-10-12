import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../db";
import { photos, reviewTags, reviews } from "../../../db/schema";
import { errorResponse, reviewCreateInput, serverError } from "../../../lib/reviews";
import { getCollectionAccess } from "../../../lib/auth";
import { validTagIds } from "../../../lib/collection-api";

export async function GET(request: Request) {
  try {
    const access = await getCollectionAccess(request);
    if (!access) return errorResponse("請登入並選擇群組。", 403);
    const db = getDb();
    const rows = await db.select().from(reviews)
      .where(eq(reviews.collectionId, access.collectionId))
      .orderBy(desc(reviews.diningDate), desc(reviews.createdAt)).limit(300);
    const imageRows = rows.length
      ? await db.select({ id: photos.id, reviewId: photos.reviewId, originalName: photos.originalName }).from(photos).where(and(eq(photos.collectionId, access.collectionId), inArray(photos.reviewId, rows.map((row) => row.id))))
      : [];
    const tagRows = rows.length ? await db.select({ reviewId: reviewTags.reviewId, tagId: reviewTags.tagId }).from(reviewTags)
      .where(inArray(reviewTags.reviewId, rows.map((row) => row.id))) : [];
    return Response.json({ reviews: rows.map((row) => ({
      ...row,
      tagIds: tagRows.filter((tag) => tag.reviewId === row.id).map((tag) => tag.tagId),
      photos: imageRows.filter((photo) => photo.reviewId === row.id).map((photo) => ({
        id: photo.id, url: `/api/photos/${photo.id}`, name: photo.originalName,
      })),
    })) });
  } catch (error) {
    return serverError(error);
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = reviewCreateInput.safeParse(body);
  if (!parsed.success) return errorResponse("請檢查必填欄位、地區和分數。", 400);
  try {
    const access = await getCollectionAccess(request, true);
    if (!access) return errorResponse("你沒有新增食評的權限。", 403);
    const tagIds = await validTagIds(access.collectionId, (body as { tagIds?: unknown })?.tagIds);
    if (!tagIds) return errorResponse("請選擇這個群組的有效標籤（最多 10 個）。", 400);
    const db = getDb();
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    await db.insert(reviews).values({ id, ownerId: access.user.id, collectionId: access.collectionId, createdBy: access.user.id, ...parsed.data, createdAt: now, updatedAt: now });
    if (tagIds.length) await db.insert(reviewTags).values(tagIds.map((tagId) => ({ reviewId: id, tagId })));
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return serverError(error);
  }
}
