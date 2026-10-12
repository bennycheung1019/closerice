import { and, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "../../../../db";
import { photos } from "../../../../db/schema";
import { errorResponse, serverError } from "../../../../lib/reviews";
import { getCollectionAccess } from "../../../../lib/auth";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const db = getDb();
    const photo = await db.select().from(photos)
      .where(eq(photos.id, id)).get();
    if (!photo) return errorResponse("找不到相片。", 404);
    const access = photo.collectionId ? await getCollectionAccess(request, false, photo.collectionId) : null;
    if (!access) return errorResponse("你無權查看相片。", 403);
    if (photo.dataBase64) {
      const binary = atob(photo.dataBase64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
      return new Response(bytes, { headers: { "Content-Type": photo.contentType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
    }
    const object = await env.BUCKET?.get(photo.objectKey);
    if (!object) return errorResponse("相片暫時無法讀取。", 404);
    return new Response(object.body, { headers: { "Content-Type": photo.contentType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    return serverError(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const access = await getCollectionAccess(request, true);
    if (!access) return errorResponse("你沒有移除相片的權限。", 403);
    const db = getDb();
    const photo = await db.select().from(photos)
      .where(and(eq(photos.id, id), eq(photos.collectionId, access.collectionId))).get();
    if (!photo) return errorResponse("找不到相片。", 404);
    if (!photo.dataBase64) await env.BUCKET?.delete(photo.objectKey);
    await db.delete(photos).where(and(eq(photos.id, id), eq(photos.collectionId, access.collectionId)));
    return Response.json({ ok: true });
  } catch (error) {
    return serverError(error);
  }
}
