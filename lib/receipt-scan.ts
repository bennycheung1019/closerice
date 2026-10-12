import { z } from "zod";
import { districtFallbacks, districtGroups, type District } from "./districts";

const kimiReceipt = z.object({
  restaurant: z.string().nullable().optional(),
  food: z.string().nullable().optional(),
  diningDate: z.string().nullable().optional(),
  channel: z.string().nullable().optional(),
  orderNumber: z.string().nullable().optional(),
  amountHKD: z.union([z.number(), z.string()]).nullable().optional(),
  locationText: z.string().nullable().optional(),
});

const clean = (value: string | null | undefined, limit: number) =>
  typeof value === "string" ? value.trim().slice(0, limit) : "";

function validDate(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? value : null;
}

const englishAliases: Partial<Record<District, string[]>> = {
  mong_kok: ["mongkok"], tsim_sha_tsui: ["tst"], east_tsim_sha_tsui: ["east tsim sha tsui", "tsim sha tsui east"],
  yau_tsim_mong: ["yau tsim mong district"], central_western: ["central and western district"],
  eastern: ["eastern district"], southern: ["southern district"], wan_chai: ["wan chai district"],
  kowloon_city: ["kowloon city district"], kwun_tong: ["kwun tong district"],
  sham_shui_po: ["sham shui po district"], wong_tai_sin: ["wong tai sin district"],
  islands: ["islands district"], kwai_tsing: ["kwai tsing district"], north: ["north district"],
  sai_kung: ["sai kung district"], sha_tin: ["sha tin district"], tai_po: ["tai po district"],
  tsuen_wan: ["tsuen wan district"], tuen_mun: ["tuen mun district"], yuen_long: ["yuen long district"],
  airport: ["hong kong international airport", "chek lap kok"], city_one: ["city one sha tin"],
  lohas_park: ["lohas park"], whampoa: ["whampoa garden"], the_peak: ["victoria peak"],
};
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

type PlaceMatch = { value: District; start: number; end: number };
function districtFromLocation(locationText: string, restaurant: string): District | null {
  // Merchant names can contain place names; only use the name when it identifies a branch.
  const evidence = (locationText || (/(?:店|分店|\bbranch\b)/i.test(restaurant) ? restaurant : "")).normalize("NFKC");
  if (!evidence) return null;
  const matches: PlaceMatch[] = [];
  for (const group of districtGroups) for (const option of group.options) {
    const terms = [option.label, option.value.replace(/_(?:area|town)$/, "").replace(/_/g, " "), ...(englishAliases[option.value] ?? [])];
    for (const term of terms) {
      if (!term) continue;
      const isEnglish = /^[a-z ]+$/i.test(term);
      const pattern = new RegExp(isEnglish ? `(?<![a-z])${escapeRegex(term)}(?![a-z])` : escapeRegex(term), "gi");
      for (const found of evidence.matchAll(pattern)) {
        matches.push({ value: option.value, start: found.index, end: found.index + found[0].length });
      }
    }
  }
  // A longer place name wins over its embedded prefix, e.g. 沙田區 over 沙田.
  const precise = matches.filter((match) => !matches.some((other) => other !== match && other.start <= match.start && other.end >= match.end && other.end - other.start > match.end - match.start));
  const neighborhoods = [...new Set(precise.filter((match) => !districtFallbacks.has(match.value)).map((match) => match.value))];
  if (neighborhoods.length === 1) return neighborhoods[0];
  if (neighborhoods.length > 1) return null;
  const districts = [...new Set(precise.map((match) => match.value))];
  return districts.length === 1 ? districts[0] : null;
}

export function parseReceiptScan(content: string) {
  const parsed = kimiReceipt.safeParse(JSON.parse(content));
  if (!parsed.success) throw new Error("Invalid receipt analysis");
  const data = parsed.data;
  const locationText = clean(data.locationText, 160);
  const restaurant = clean(data.restaurant, 120);
  const amount = typeof data.amountHKD === "number" ? data.amountHKD : Number(clean(data.amountHKD, 30).replace(/^(?:HK\$|HKD|\$)\s*/i, ""));

  return {
    restaurant,
    food: clean(data.food, 1000),
    diningDate: validDate(clean(data.diningDate, 10)),
    channel: ["keeta", "foodpanda", "takeaway", "dine_in"].includes(data.channel ?? "") ? data.channel : null,
    orderNumber: clean(data.orderNumber, 80),
    amountCents: data.amountHKD != null && Number.isFinite(amount) && amount >= 0 && amount <= 100_000 ? Math.round(amount * 100) : null,
    district: districtFromLocation(locationText, restaurant),
    locationText,
  } as const;
}
