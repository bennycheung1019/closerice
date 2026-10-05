import { getDb } from "../../../../db";
import { reviews } from "../../../../db/schema";
import { errorResponse, reviewCreateInput, serverError } from "../../../../lib/reviews";
import { sharedOwnerId } from "../../../../lib/shared-collection";
import { env } from "cloudflare:workers";

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
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await getDb().insert(reviews).values({
      id,
      ownerId: sharedOwnerId(),
      ...parsed.data,
      createdAt: now,
      updatedAt: now,
    });
    return Response.json({ id, url: env.PUBLIC_SITE_URL ?? new URL("/", request.url).toString() }, { status: 201 });
  } catch (error) {
    return serverError(error);
  }
}
