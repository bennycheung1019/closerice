import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { reviewOpinions, reviews } from "../../../../../db/schema";
import { getCollectionAccess } from "../../../../../lib/auth";
import { validTagIds } from "../../../../../lib/collection-api";
import { isPersonalStatus, personalLabelStatements } from "../../../../../lib/personal-labels";
import { errorResponse, opinionInput, serverError } from "../../../../../lib/reviews";
import { selectedFoodsForOrder } from "../../../../../lib/food-items";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const { id: reviewId } = await context.params;
  const body = await request.json().catch(() => null) as { status?: unknown; tagIds?: unknown } | null;
  const parsed = opinionInput.safeParse(body);
  if (!parsed.success) return errorResponse("請填寫評語或選擇 1 至 5 星。", 400);
  try {
    const access = await getCollectionAccess(request, true);
    if (!access) return errorResponse("你沒有新增食評的權限。", 403);
    const db = getDb();
    const visit = await db.select({ id: reviews.id, food: reviews.food }).from(reviews).where(and(eq(reviews.id, reviewId), eq(reviews.collectionId, access.collectionId))).get();
    if (!visit) return errorResponse("找不到這次用餐。", 404);
    const selectedFoods = selectedFoodsForOrder(visit.food, parsed.data.selectedFoods);
    if (selectedFoods === undefined) return errorResponse("請從訂單食物中選擇至少一款。", 400);
    const existing = await db.select({ id: reviewOpinions.id }).from(reviewOpinions).where(and(eq(reviewOpinions.reviewId, reviewId), eq(reviewOpinions.authorId, access.user.id))).get();
    if (existing) return errorResponse("你已評價這次用餐，可以編輯自己的食評。", 409);
    const hasLabels = body && (body.status !== undefined || body.tagIds !== undefined);
    if (hasLabels && body.status !== undefined && !isPersonalStatus(body.status)) return errorResponse("請選擇有效的標記。", 400);
    const tagIds = hasLabels ? await validTagIds(access.collectionId, access.user.id, body.tagIds) : [];
    if (!tagIds) return errorResponse("請選擇自己的有效標籤（最多 10 個）。", 400);
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    if (hasLabels) {
      await env.DB!.batch([
        env.DB!.prepare("INSERT INTO review_opinions (id,review_id,author_id,comment,score,selected_foods,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)")
          .bind(id, reviewId, access.user.id, parsed.data.comment, parsed.data.score, selectedFoods ? JSON.stringify(selectedFoods) : null, now, now),
        ...personalLabelStatements(reviewId, access.user.id, isPersonalStatus(body.status) ? body.status : "none", tagIds),
      ]);
    } else {
      await db.insert(reviewOpinions).values({ id, reviewId, authorId: access.user.id, comment: parsed.data.comment, score: parsed.data.score, selectedFoods: selectedFoods ? JSON.stringify(selectedFoods) : null, createdAt: now, updatedAt: now });
    }
    return Response.json({ id }, { status: 201 });
  } catch (error) { return serverError(error); }
}
