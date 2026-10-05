import { and, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { getDb } from "../../../../db";
import { photos } from "../../../../db/schema";
import { errorResponse, serverError } from "../../../../lib/reviews";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const user = await getChatGPTUser();
  if (!user) return errorResponse("請先登入。", 401);
  const { id } = await context.params;
  try {
    const db = getDb();
    const photo = await db.select().from(photos)
      .where(and(eq(photos.id, id), eq(photos.ownerId, user.userId))).get();
    if (!photo) return errorResponse("找不到相片。", 404);
    const object = await env.BUCKET?.get(photo.objectKey);
    if (!object) return errorResponse("相片暫時無法讀取。", 404);
    return new Response(object.body, { headers: { "Content-Type": photo.contentType, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } });
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
    const photo = await db.select().from(photos)
      .where(and(eq(photos.id, id), eq(photos.ownerId, user.userId))).get();
    if (!photo) return errorResponse("找不到相片。", 404);
    await env.BUCKET?.delete(photo.objectKey);
    await db.delete(photos).where(and(eq(photos.id, id), eq(photos.ownerId, user.userId)));
    return Response.json({ ok: true });
  } catch (error) {
    return serverError(error);
  }
}
