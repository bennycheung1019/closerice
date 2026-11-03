import { z } from "zod";
import { openRiceRestaurantUrl, foodpandaRestaurantUrl } from "./restaurant-profile";
import { districtValues } from "./districts";

export const restaurantDetailsInput = z.object({
  expectedVersion: z.number().int().min(1),
  // Omitted fields retain their saved values; an empty URL explicitly removes the link.
  openriceUrl: z.string().trim().max(2000).refine(openRiceRestaurantUrl, "請使用 OpenRice 香港餐廳主頁網址，不含搜尋參數或相片下載連結。").optional(),
  foodpandaUrl: z.string().trim().max(2000).refine(foodpandaRestaurantUrl, "請使用 Foodpanda 香港餐廳主頁網址，不含追蹤參數。").optional(),
  reviewState: z.enum(["pending", "verified", "uncertain"]).optional(),
  reviewNotes: z.string().trim().max(1000).optional(),
}).strict();

// District changes are a separate admin operation so ordinary link edits cannot
// silently move a branch and its existing reviews to another district.
export const restaurantDistrictInput = z.object({
  expectedVersion: z.number().int().min(1),
  district: z.enum(districtValues),
  openriceUrl: z.string().trim().min(1).max(2000)
    .refine(openRiceRestaurantUrl, "請提供已儲存的 OpenRice 香港餐廳主頁網址。"),
  evidenceNote: z.string().trim().min(8).max(300),
}).strict();
