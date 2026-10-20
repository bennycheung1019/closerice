import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { reviews } from "../../../../../db/schema";
import { getCollectionAccess } from "../../../../../lib/auth";
import { validTagIds } from "../../../../../lib/collection-api";
import { isPersonalStatus, writePersonalLabels } from "../../../../../lib/personal-labels";
import { errorResponse, serverError } from "../../../../../lib/reviews";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const access = await getCollectionAccess(request);
    if (!access) return errorResponse("你無權查看這個群組。", 403);
    const row = await getDb().select({ id: reviews.id }).from(reviews)
      .where(and(eq(reviews.id, id), eq(reviews.collectionId, access.collectionId))).get();
    if (!row) return errorResponse("找不到紀錄。", 404);
    const body = await request.json().catch(() => null) as { status?: unknown; tagIds?: unknown } | null;
    if (body?.status !== undefined && !isPersonalStatus(body.status)) return errorResponse("請選擇有效的標記。", 400);
    const tagIds = await validTagIds(access.collectionId, access.user.id, body?.tagIds);
    if (!tagIds) return errorResponse("請選擇自己的有效標籤（最多 10 個）。", 400);
    await writePersonalLabels(id, access.user.id, isPersonalStatus(body?.status) ? body.status : "none", tagIds);
    return Response.json({ ok: true });
  } catch (error) {
    return serverError(error);
  }
}
