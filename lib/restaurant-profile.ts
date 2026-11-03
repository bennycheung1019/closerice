export type RestaurantProfile = {
  id: string; collectionId: string; name: string; district: string; region: string;
  address: string; sourceUrl: string; coverPhotoUrl: string; coverSourceUrl: string;
  coverAttribution: string; coverLicense: string; coverUsage: "missing" | "owned" | "licensed" | "link_only" | "restricted";
  reviewState: "pending" | "verified" | "uncertain"; reviewNotes: string; checkedAt: string | null;
  manualLock: boolean; version: number; createdAt: string; updatedAt: string;
};

// URLs are references only: the server never downloads remote pages or imagery.
export function publicHttpsUrl(value: string): boolean {
  if (!value) return true;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    return url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443") &&
      host.includes(".") && !host.includes(":") && !/^[\d.]+$/.test(host) &&
      !/(^|\.)(localhost|local|internal|test|invalid)$/.test(host);
  } catch { return false; }
}
export function providerImagery(value: string): boolean {
  if (!value) return false;
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/\.$/, "");
    return /(^|\.)(google\.[a-z.]+|googleapis\.com|gstatic\.com|googleusercontent\.com|ggpht\.com|goo\.gl|openrice\.[a-z.]+|orstatic\.com)$/.test(host);
  } catch { return true; }
}
export function googleMapsUrl(name: string, district: string, address: string, region = "香港"): string {
  const url = new URL("https://www.google.com/maps/search/");
  url.searchParams.set("api", "1");
  url.searchParams.set("query", [name, address || district, region].filter(Boolean).join(" "));
  return url.toString();
}
export function usableCover(profile: RestaurantProfile): boolean {
  return Boolean(profile.coverPhotoUrl && publicHttpsUrl(profile.coverPhotoUrl) && !providerImagery(profile.coverPhotoUrl) &&
    !providerImagery(profile.coverSourceUrl) && profile.coverSourceUrl && profile.coverAttribution && profile.coverLicense &&
    (profile.coverUsage === "owned" || profile.coverUsage === "licensed"));
}
