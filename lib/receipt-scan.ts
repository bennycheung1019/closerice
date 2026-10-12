import { z } from "zod";
import type { District } from "./districts";

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

const locationPatterns: Array<[District, RegExp]> = [
  ["mong_kok", /旺角|mong\s*kok/i],
  ["tsim_sha_tsui", /尖沙咀|tsim\s*sha\s*tsui|\bTST\b/i],
  ["central_western", /中西區|中環|上環|西營盤|堅尼地城|石塘咀|central(?:\s+and\s+western)?|sheung\s*wan|sai\s*ying\s*pun|kennedy\s*town/i],
  ["eastern", /東區|北角|鰂魚涌|太古|西灣河|筲箕灣|柴灣|小西灣|eastern\s*district|north\s*point|quarry\s*bay|tai\s*koo|sai\s*wan\s*ho|shau\s*kei\s*wan|chai\s*wan/i],
  ["southern", /南區|香港仔|鴨脷洲|薄扶林|赤柱|淺水灣|黃竹坑|southern\s*district|aberdeen|ap\s*lei\s*chau|pok\s*fu\s*lam|stanley|repulse\s*bay|wong\s*chuk\s*hang/i],
  ["wan_chai", /灣仔|銅鑼灣|天后|跑馬地|大坑|wan\s*chai|causeway\s*bay|tin\s*hau|happy\s*valley|tai\s*hang/i],
  ["kowloon_city", /九龍城|土瓜灣|紅磡|何文田|啟德|kowloon\s*city|to\s*kwa\s*wan|hung\s*hom|ho\s*man\s*tin|kai\s*tak/i],
  ["kwun_tong", /觀塘|牛頭角|九龍灣|藍田|油塘|秀茂坪|kwun\s*tong|ngau\s*tau\s*kok|kowloon\s*bay|lam\s*tin|yau\s*tong/i],
  ["sham_shui_po", /深水埗|荔枝角|長沙灣|美孚|石硤尾|sham\s*shui\s*po|lai\s*chi\s*kok|cheung\s*sha\s*wan|mei\s*foo|shek\s*kip\s*mei/i],
  ["wong_tai_sin", /黃大仙|慈雲山|鑽石山|樂富|新蒲崗|wong\s*tai\s*sin|tsz\s*wan\s*shan|diamond\s*hill|lok\s*fu|san\s*po\s*kong/i],
  ["yau_tsim_mong", /油尖旺|油麻地|佐敦|大角咀|太子|yau\s*tsim\s*mong|yau\s*ma\s*tei|jordan|tai\s*kok\s*tsui|prince\s*edward/i],
  ["islands", /離島|東涌|愉景灣|大澳|梅窩|長洲|南丫島|坪洲|islands\s*district|tung\s*chung|discovery\s*bay|tai\s*o\b|mui\s*wo|cheung\s*chau|lamma\s*island|peng\s*chau/i],
  ["kwai_tsing", /葵青|葵涌|葵芳|葵興|青衣|kwai\s*tsing|kwai\s*chung|kwai\s*fong|kwai\s*hing|tsing\s*yi/i],
  ["north", /北區|上水|粉嶺|沙頭角|打鼓嶺|north\s*district|sheung\s*shui|fanling|sha\s*tau\s*kok|ta\s*kwu\s*ling/i],
  ["sai_kung", /西貢|將軍澳|坑口|寶琳|調景嶺|sai\s*kung|tseung\s*kwan\s*o|hang\s*hau|po\s*lam|tiu\s*keng\s*leng/i],
  ["sha_tin", /沙田|大圍|馬鞍山|火炭|石門|sha\s*tin|tai\s*wai|ma\s*on\s*shan|fo\s*tan|shek\s*mun/i],
  ["tai_po", /大埔|白石角|tai\s*po|pak\s*shek\s*kok/i],
  ["tsuen_wan", /荃灣|深井|汀九|tsuen\s*wan|sham\s*tseng|ting\s*kau/i],
  ["tuen_mun", /屯門|掃管笏|tuen\s*mun|so\s*kwun\s*wat/i],
  ["yuen_long", /元朗|天水圍|洪水橋|錦田|yuen\s*long|tin\s*shui\s*wai|hung\s*shui\s*kiu|kam\s*tin/i],
];

function districtFromLocation(locationText: string, restaurant: string): District | null {
  // Merchant names can contain place names; only use the name when it identifies a branch.
  const evidence = locationText || (/(?:店|分店|\bbranch\b)/i.test(restaurant) ? restaurant : "");
  const matches = locationPatterns.filter(([, pattern]) => pattern.test(evidence)).map(([district]) => district);
  if (matches.includes("yau_tsim_mong") && (matches.includes("mong_kok") || matches.includes("tsim_sha_tsui"))) {
    matches.splice(matches.indexOf("yau_tsim_mong"), 1);
  }
  return matches.length === 1 ? matches[0] : null;
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
