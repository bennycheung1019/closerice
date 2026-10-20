import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { reviewOpinions, reviews } from "../../../../db/schema";
import { getCollectionAccess } from "../../../../lib/auth";
import { errorResponse, opinionInput, serverError } from "../../../../lib/reviews";

type Context = { params: Promise<{ id: string }> };

async function getOwnOpinion(id: string, collectionId: string, userId: string) {
  return getDb().select({ id: reviewOpinions.id }).from(reviewOpinions)
    .innerJoin(reviews, eq(reviewOpinions.reviewId, reviews.id))
    .where(and(eq(reviewOpinions.id, id), eq(reviewOpinions.authorId, userId), eq(reviews.collectionId, collectionId))).get();
}

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  const parsed = opinionInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("請填寫評語或選擇 1 至 5 星。", 400);
  try {
    const access = await getCollectionAccess(request, true);
    if (!access) return errorResponse("你沒有編輯食評的權限。", 403);
    if (!await getOwnOpinion(id, access.collectionId, access.user.id)) return errorResponse("只能編輯自己的食評。", 403);
    await getDb().update(reviewOpinions).set({ ...parsed.data, updatedAt: new Date().toISOString() }).where(and(eq(reviewOpinions.id, id), eq(reviewOpinions.authorId, access.user.id)));
    return Response.json({ id });
  } catch (error) { return serverError(error); }
}

export async function DELETE(request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const access = await getCollectionAccess(request, true);
    if (!access) return errorResponse("你沒有刪除食評的權限。", 403);
    if (!await getOwnOpinion(id, access.collectionId, access.user.id)) return errorResponse("只能刪除自己的食評。", 403);
    await getDb().delete(reviewOpinions).where(and(eq(reviewOpinions.id, id), eq(reviewOpinions.authorId, access.user.id)));
    return Response.json({ ok: true });
  } catch (error) { return serverError(error); }
}
