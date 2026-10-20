import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../db";
import { photos, reviewOpinions, reviewTags, reviews, users } from "../../../db/schema";
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
      .orderBy(desc(reviews.diningDate), desc(reviews.createdAt));
    const ids = rows.map((row) => row.id);
    const idBatches = Array.from({ length: Math.ceil(ids.length / 300) }, (_, index) => ids.slice(index * 300, (index + 1) * 300));
    const imageRows = (await Promise.all(idBatches.map((batch) => db.select({ id: photos.id, reviewId: photos.reviewId, originalName: photos.originalName }).from(photos).where(and(eq(photos.collectionId, access.collectionId), inArray(photos.reviewId, batch)))))).flat();
    const tagRows = (await Promise.all(idBatches.map((batch) => db.select({ reviewId: reviewTags.reviewId, tagId: reviewTags.tagId }).from(reviewTags)
      .where(inArray(reviewTags.reviewId, batch))))).flat();
    const opinionRows = (await Promise.all(idBatches.map((batch) => db.select({ id: reviewOpinions.id, reviewId: reviewOpinions.reviewId,
      authorId: reviewOpinions.authorId, comment: reviewOpinions.comment, score: reviewOpinions.score,
      createdAt: reviewOpinions.createdAt, updatedAt: reviewOpinions.updatedAt,
      authorName: users.name, authorPictureUrl: users.pictureUrl }).from(reviewOpinions)
      .leftJoin(users, eq(reviewOpinions.authorId, users.id))
      .where(inArray(reviewOpinions.reviewId, batch))))).flat();
    return Response.json({ reviews: rows.map((row) => ({
      ...row,
      opinions: opinionRows.filter((opinion) => opinion.reviewId === row.id),
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
    const { comment, score, ...visit } = parsed.data;
    await db.batch([
      db.insert(reviews).values({ id, ownerId: access.user.id, collectionId: access.collectionId, createdBy: access.user.id, ...visit, comment: "", score: null, createdAt: now, updatedAt: now }),
      db.insert(reviewOpinions).values({ id: crypto.randomUUID(), reviewId: id, authorId: access.user.id, comment, score, createdAt: now, updatedAt: now }),
    ]);
    if (tagIds.length) await db.insert(reviewTags).values(tagIds.map((tagId) => ({ reviewId: id, tagId })));
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return serverError(error);
  }
}
