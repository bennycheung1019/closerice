import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { reviewOpinions, reviews } from "../../../../db/schema";
import { getCollectionAccess } from "../../../../lib/auth";
import { validTagIds } from "../../../../lib/collection-api";
import { isPersonalStatus, personalLabelStatements } from "../../../../lib/personal-labels";
import { errorResponse, opinionInput, serverError } from "../../../../lib/reviews";
import { selectedFoodsForOrder } from "../../../../lib/food-items";

type Context = { params: Promise<{ id: string }> };

async function getOwnOpinion(id: string, collectionId: string, userId: string) {
  return getDb().select({ id: reviewOpinions.id, reviewId: reviewOpinions.reviewId, food: reviews.food }).from(reviewOpinions)
    .innerJoin(reviews, eq(reviewOpinions.reviewId, reviews.id))
    .where(and(eq(reviewOpinions.id, id), eq(reviewOpinions.authorId, userId), eq(reviews.collectionId, collectionId))).get();
}

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as { status?: unknown; tagIds?: unknown } | null;
  const parsed = opinionInput.safeParse(body);
  if (!parsed.success) return errorResponse("請填寫評語或選擇 1 至 5 星。", 400);
  try {
    const access = await getCollectionAccess(request, true);
    if (!access) return errorResponse("你沒有編輯食評的權限。", 403);
    const ownOpinion = await getOwnOpinion(id, access.collectionId, access.user.id);
    if (!ownOpinion) return errorResponse("只能編輯自己的食評。", 403);
    const selectedFoods = selectedFoodsForOrder(ownOpinion.food, parsed.data.selectedFoods);
    if (selectedFoods === undefined) return errorResponse("請從訂單食物中選擇至少一款。", 400);
    const hasLabels = body && (body.status !== undefined || body.tagIds !== undefined);
    if (hasLabels && body.status !== undefined && !isPersonalStatus(body.status)) return errorResponse("請選擇有效的標記。", 400);
    const tagIds = hasLabels ? await validTagIds(access.collectionId, access.user.id, body.tagIds) : [];
    if (!tagIds) return errorResponse("請選擇自己的有效標籤（最多 10 個）。", 400);
    const updatedAt = new Date().toISOString();
    if (hasLabels) {
      await env.DB!.batch([
        env.DB!.prepare("UPDATE review_opinions SET comment=?,score=?,selected_foods=?,updated_at=? WHERE id=? AND author_id=?")
          .bind(parsed.data.comment, parsed.data.score, selectedFoods ? JSON.stringify(selectedFoods) : null, updatedAt, id, access.user.id),
        ...personalLabelStatements(ownOpinion.reviewId, access.user.id, isPersonalStatus(body.status) ? body.status : "none", tagIds),
      ]);
    } else {
      await getDb().update(reviewOpinions).set({ comment: parsed.data.comment, score: parsed.data.score, selectedFoods: selectedFoods ? JSON.stringify(selectedFoods) : null, updatedAt }).where(and(eq(reviewOpinions.id, id), eq(reviewOpinions.authorId, access.user.id)));
    }
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
