import { z } from "zod";

export const reviewInput = z.object({
  diningDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  restaurant: z.string().trim().min(1).max(120),
  food: z.string().trim().min(1).max(1000),
  comment: z.string().trim().max(3000).default(""),
  score: z.number().int().min(1).max(5).nullable().default(null),
  channel: z.enum(["keeta", "foodpanda", "takeaway", "dine_in"]),
  status: z.enum(["none", "favorite", "blacklist"]).default("none"),
  orderNumber: z.string().trim().max(80).default(""),
  amountCents: z.number().int().min(0).max(10_000_000).nullable().default(null),
});

export type ReviewInput = z.infer<typeof reviewInput>;

export function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export function serverError(error: unknown) {
  console.error("Closerice request failed", error);
  return errorResponse("暫時無法完成操作，請稍後再試。", 500);
}
