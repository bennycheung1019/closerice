import { and, desc, eq, inArray } from "drizzle-orm";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { photos, reviews } from "../../../db/schema";
import { errorResponse, reviewInput, serverError } from "../../../lib/reviews";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return errorResponse("請先登入。", 401);
  try {
    const db = getDb();
    const rows = await db.select().from(reviews)
      .where(eq(reviews.ownerId, user.userId))
      .orderBy(desc(reviews.diningDate), desc(reviews.createdAt)).limit(300);
    const imageRows = rows.length
      ? await db.select().from(photos).where(and(eq(photos.ownerId, user.userId), inArray(photos.reviewId, rows.map((row) => row.id))))
      : [];
    return Response.json({ reviews: rows.map((row) => ({
      ...row,
      photos: imageRows.filter((photo) => photo.reviewId === row.id).map((photo) => ({
        id: photo.id, url: `/api/photos/${photo.id}`, name: photo.originalName,
      })),
    })) });
  } catch (error) {
    return serverError(error);
  }
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return errorResponse("請先登入。", 401);
  const parsed = reviewInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("請檢查必填欄位和分數。", 400);
  try {
    const db = getDb();
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    await db.insert(reviews).values({ id, ownerId: user.userId, ...parsed.data, createdAt: now, updatedAt: now });
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return serverError(error);
  }
}
