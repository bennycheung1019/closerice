import { z } from "zod";
import { publicHttpsUrl, providerImagery } from "./restaurant-profile";

const optionalUrl = z.string().trim().max(2000).refine(publicHttpsUrl, "請使用公開 HTTPS 網址。").default("");
export const restaurantDetailsInput = z.object({
  expectedVersion: z.number().int().min(1),
  address: z.string().trim().max(500).default(""),
  region: z.string().trim().min(1).max(80).default("香港"),
  sourceUrl: optionalUrl,
  coverPhotoUrl: optionalUrl,
  coverSourceUrl: optionalUrl,
  coverAttribution: z.string().trim().max(500).default(""),
  coverLicense: z.string().trim().max(300).default(""),
  coverUsage: z.enum(["missing", "owned", "licensed", "link_only", "restricted"]).default("missing"),
  reviewState: z.enum(["pending", "verified", "uncertain"]).default("pending"),
  reviewNotes: z.string().trim().max(1000).default(""),
}).strict().superRefine((value, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  if (value.reviewState === "verified" && !value.address) issue("確認分店前請填寫地址。");
  if (value.coverPhotoUrl && (!['owned', 'licensed'].includes(value.coverUsage) || !value.coverSourceUrl || !value.coverAttribution || !value.coverLicense)) issue("顯示封面前，請提供圖片來源、署名及使用授權。");
  if (value.coverPhotoUrl && (providerImagery(value.coverPhotoUrl) || providerImagery(value.coverSourceUrl))) issue("Google Maps、Street View 和 OpenRice 圖片請保留在原網站查看，不能作封面。");
});
