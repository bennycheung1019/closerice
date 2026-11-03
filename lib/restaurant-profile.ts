export type RestaurantProfile = {
  id: string; collectionId: string; name: string; district: string; openriceUrl: string; foodpandaUrl: string;
  reviewState: "pending" | "verified" | "uncertain"; reviewNotes: string; checkedAt: string | null;
  manualLock: boolean; version: number; createdAt: string; updatedAt: string;
};

// External page reference only: the server never downloads OpenRice pages or imagery.
export function openRiceRestaurantUrl(value: string): boolean {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "www.openrice.com" &&
      !url.username && !url.password && (!url.port || url.port === "443") && !url.search && !url.hash &&
      /^\/(?:zh|zh-cn|en)\/hongkong\/r-[^/?#]+-r\d+\/?$/.test(url.pathname);
  } catch { return false; }
}
export function foodpandaRestaurantUrl(value: string): boolean {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "www.foodpanda.hk" &&
      !url.username && !url.password && (!url.port || url.port === "443") && !url.search && !url.hash &&
      /^\/(?:zh\/|en\/)?restaurant\/[a-z0-9]{4}\/[a-z0-9-]+\/?$/.test(url.pathname);
  } catch { return false; }
}
type ReferenceFields = Pick<RestaurantProfile, "openriceUrl" | "foodpandaUrl">;
export function restaurantReference(profile: ReferenceFields | null) {
  if (profile?.openriceUrl && openRiceRestaurantUrl(profile.openriceUrl)) return { url: profile.openriceUrl, provider: "OpenRice" as const, label: "OpenRice 餐廳資料" };
  if (profile?.foodpandaUrl && foodpandaRestaurantUrl(profile.foodpandaUrl)) return { url: profile.foodpandaUrl, provider: "Foodpanda" as const, label: "Foodpanda 餐廳網頁" };
  return null;
}
