import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { reviewOpinions, reviews } from "../../../../../db/schema";
import { getCollectionAccess } from "../../../../../lib/auth";
import { errorResponse, opinionInput, serverError } from "../../../../../lib/reviews";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const { id: reviewId } = await context.params;
  const parsed = opinionInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("請填寫評語或選擇 1 至 5 星。", 400);
  try {
    const access = await getCollectionAccess(request, true);
    if (!access) return errorResponse("你沒有新增食評的權限。", 403);
    const db = getDb();
    const visit = await db.select({ id: reviews.id }).from(reviews).where(and(eq(reviews.id, reviewId), eq(reviews.collectionId, access.collectionId))).get();
    if (!visit) return errorResponse("找不到這次用餐。", 404);
    const existing = await db.select({ id: reviewOpinions.id }).from(reviewOpinions).where(and(eq(reviewOpinions.reviewId, reviewId), eq(reviewOpinions.authorId, access.user.id))).get();
    if (existing) return errorResponse("你已評價這次用餐，可以編輯自己的食評。", 409);
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    await db.insert(reviewOpinions).values({ id, reviewId, authorId: access.user.id, ...parsed.data, createdAt: now, updatedAt: now });
    return Response.json({ id }, { status: 201 });
  } catch (error) { return serverError(error); }
}
