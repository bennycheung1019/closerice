export const districtGroups = [
  { label: "常用地點", options: [
    { value: "mong_kok", label: "旺角" },
    { value: "tsim_sha_tsui", label: "尖沙咀" },
  ] },
  { label: "香港島", options: [
    { value: "central_western", label: "中西區" },
    { value: "eastern", label: "東區" },
    { value: "southern", label: "南區" },
    { value: "wan_chai", label: "灣仔區" },
  ] },
  { label: "九龍", options: [
    { value: "kowloon_city", label: "九龍城區" },
    { value: "kwun_tong", label: "觀塘區" },
    { value: "sham_shui_po", label: "深水埗區" },
    { value: "wong_tai_sin", label: "黃大仙區" },
    { value: "yau_tsim_mong", label: "油尖旺區" },
  ] },
  { label: "新界及離島", options: [
    { value: "islands", label: "離島區" },
    { value: "kwai_tsing", label: "葵青區" },
    { value: "north", label: "北區" },
    { value: "sai_kung", label: "西貢區" },
    { value: "sha_tin", label: "沙田區" },
    { value: "tai_po", label: "大埔區" },
    { value: "tsuen_wan", label: "荃灣區" },
    { value: "tuen_mun", label: "屯門區" },
    { value: "yuen_long", label: "元朗區" },
  ] },
] as const;

export const districtValues = [
  "mong_kok", "tsim_sha_tsui", "central_western", "eastern", "southern", "wan_chai",
  "kowloon_city", "kwun_tong", "sham_shui_po", "wong_tai_sin", "yau_tsim_mong",
  "islands", "kwai_tsing", "north", "sai_kung", "sha_tin", "tai_po", "tsuen_wan",
  "tuen_mun", "yuen_long",
] as const;

export type District = typeof districtValues[number];

export const districtNames: Record<District, string> = Object.fromEntries(
  districtGroups.flatMap((group) => group.options.map((option) => [option.value, option.label])),
) as Record<District, string>;

export function isDistrict(value: unknown): value is District {
  return typeof value === "string" && Object.hasOwn(districtNames, value);
}
