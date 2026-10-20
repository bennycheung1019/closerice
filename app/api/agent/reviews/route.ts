import { getDb } from "../../../../db";
import { reviewOpinions, reviews } from "../../../../db/schema";
import { errorResponse, reviewCreateInput, serverError } from "../../../../lib/reviews";
import { getCollectionAccess } from "../../../../lib/auth";
import { env } from "cloudflare:workers";
import { writePersonalLabels } from "../../../../lib/personal-labels";
import { and, eq } from "drizzle-orm";
import { personalTags } from "../../../../db/schema";
import { ensureDefaultPersonalTags } from "../../../../lib/collection-api";
import { selectedFoodsForOrder } from "../../../../lib/food-items";

export async function POST(request: Request) {
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
    const reader = request.body?.getReader();
    if (reader) {
      let bytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 8 * 1024 * 1024) {
          await reader.cancel();
          break;
        }
      }
    }
    return errorResponse("請使用 JSON 提交食評；訂單截圖不會儲存。", 415);
  }

  const parsed = reviewCreateInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("請檢查日期、餐廳、食物、地區、用餐方式、金額和分數。", 400);

  try {
    const access = await getCollectionAccess(request, true);
    if (!access) return errorResponse("請先登入並選擇可編輯的群組。", 403);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const { comment, score, status, selectedFoods: requestedFoods, ...visit } = parsed.data;
    const selectedFoods = selectedFoodsForOrder(visit.food, requestedFoods);
    if (selectedFoods === undefined) return errorResponse("請從訂單食物中選擇至少一款。", 400);
    await getDb().batch([getDb().insert(reviews).values({
      id,
      ownerId: access.user.id,
      collectionId: access.collectionId,
      createdBy: access.user.id,
      ...visit,
      comment: "",
      score: null,
      createdAt: now,
      updatedAt: now,
    }), getDb().insert(reviewOpinions).values({ id: crypto.randomUUID(), reviewId: id, authorId: access.user.id, comment, score, selectedFoods: selectedFoods ? JSON.stringify(selectedFoods) : null, createdAt: now, updatedAt: now })]);
    if (status !== "none") {
      await ensureDefaultPersonalTags(access.collectionId, access.user.id);
      const name = status === "favorite" ? "☆ 最愛" : "⊘ 黑名單";
      const tag = await getDb().select({ id: personalTags.id }).from(personalTags).where(and(eq(personalTags.collectionId, access.collectionId), eq(personalTags.userId, access.user.id), eq(personalTags.name, name))).get();
      if (tag) await writePersonalLabels(id, access.user.id, "none", [tag.id]);
    }
    return Response.json({ id, url: env.PUBLIC_SITE_URL ?? new URL("/", request.url).toString() }, { status: 201 });
  } catch (error) {
    return serverError(error);
  }
}
