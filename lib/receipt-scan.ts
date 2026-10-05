import { z } from "zod";

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

export function parseReceiptScan(content: string) {
  const parsed = kimiReceipt.safeParse(JSON.parse(content));
  if (!parsed.success) throw new Error("Invalid receipt analysis");
  const data = parsed.data;
  const locationText = clean(data.locationText, 160);
  const restaurant = clean(data.restaurant, 120);
  const branchText = `${locationText} ${restaurant.match(/(?:旺角|mong\s*kok|尖沙咀|tsim\s*sha\s*tsui|TST)\s*(?:店|分店|branch)/i)?.[0] ?? ""}`;
  const mongKok = /旺角|mong\s*kok/i.test(branchText);
  const tsimShaTsui = /尖沙咀|tsim\s*sha\s*tsui|\bTST\b/i.test(branchText);
  const amount = typeof data.amountHKD === "number" ? data.amountHKD : Number(clean(data.amountHKD, 30).replace(/^(?:HK\$|HKD|\$)\s*/i, ""));

  return {
    restaurant,
    food: clean(data.food, 1000),
    diningDate: validDate(clean(data.diningDate, 10)),
    channel: ["keeta", "foodpanda", "takeaway", "dine_in"].includes(data.channel ?? "") ? data.channel : null,
    orderNumber: clean(data.orderNumber, 80),
    amountCents: data.amountHKD != null && Number.isFinite(amount) && amount >= 0 && amount <= 100_000 ? Math.round(amount * 100) : null,
    district: mongKok !== tsimShaTsui ? (mongKok ? "mong_kok" : "tsim_sha_tsui") : null,
    locationText,
  } as const;
}
