import { env } from "cloudflare:workers";

export type PersonalStatus = "none" | "favorite" | "blacklist";

export function isPersonalStatus(value: unknown): value is PersonalStatus {
  return value === "none" || value === "favorite" || value === "blacklist";
}

export function personalLabelStatements(reviewId: string, userId: string, status: PersonalStatus, tagIds: string[]) {
  const db = env.DB!;
  return [
    status === "none"
      ? db.prepare("DELETE FROM personal_review_status WHERE review_id=? AND user_id=?").bind(reviewId, userId)
      : db.prepare("INSERT INTO personal_review_status (review_id,user_id,status) VALUES (?,?,?) ON CONFLICT(review_id,user_id) DO UPDATE SET status=excluded.status").bind(reviewId, userId, status),
    db.prepare("DELETE FROM personal_review_tags WHERE review_id=? AND user_id=?").bind(reviewId, userId),
    ...tagIds.map((tagId) => db.prepare("INSERT INTO personal_review_tags (review_id,user_id,tag_id) VALUES (?,?,?)").bind(reviewId, userId, tagId)),
  ];
}

export async function writePersonalLabels(reviewId: string, userId: string, status: PersonalStatus, tagIds: string[]): Promise<void> {
  await env.DB!.batch(personalLabelStatements(reviewId, userId, status, tagIds));
}
