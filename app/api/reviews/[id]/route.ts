import { and, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { getDb } from "../../../../db";
import { photos, reviews } from "../../../../db/schema";
import { errorResponse, reviewInput, serverError } from "../../../../lib/reviews";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const user = await getChatGPTUser();
  if (!user) return errorResponse("請先登入。", 401);
  const { id } = await context.params;
  const parsed = reviewInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("請檢查必填欄位和分數。", 400);
  try {
    const db = getDb();
    const result = await db.update(reviews).set({ ...parsed.data, updatedAt: new Date().toISOString() })
      .where(and(eq(reviews.id, id), eq(reviews.ownerId, user.userId))).returning({ id: reviews.id });
    if (!result.length) return errorResponse("找不到紀錄。", 404);
    return Response.json({ id });
  } catch (error) {
    return serverError(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  const user = await getChatGPTUser();
  if (!user) return errorResponse("請先登入。", 401);
  const { id } = await context.params;
  try {
    const db = getDb();
    const row = await db.select({ id: reviews.id }).from(reviews)
      .where(and(eq(reviews.id, id), eq(reviews.ownerId, user.userId))).get();
    if (!row) return errorResponse("找不到紀錄。", 404);
    const images = await db.select().from(photos).where(and(eq(photos.reviewId, id), eq(photos.ownerId, user.userId)));
    if (env.BUCKET) await Promise.all(images.map((image) => env.BUCKET!.delete(image.objectKey)));
    await db.delete(reviews).where(and(eq(reviews.id, id), eq(reviews.ownerId, user.userId)));
    return Response.json({ ok: true });
  } catch (error) {
    return serverError(error);
  }
}
