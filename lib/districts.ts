// Keep the original 18 district values for existing reviews. New values name smaller places.
const areas = [
  { label: "中西區", fallback: "central_western", options: [
    ["central", "中環"], ["admiralty", "金鐘"], ["sheung_wan", "上環"], ["sai_ying_pun", "西營盤"], ["shek_tong_tsui", "石塘咀"], ["kennedy_town", "堅尼地城"], ["the_peak", "山頂"], ["central_western", "中西區"],
  ] },
  { label: "灣仔區", fallback: "wan_chai", options: [
    ["wan_chai_area", "灣仔"], ["causeway_bay", "銅鑼灣"], ["tin_hau", "天后"], ["tai_hang", "大坑"], ["happy_valley", "跑馬地"], ["jardines_lookout", "渣甸山"], ["wan_chai", "灣仔區"],
  ] },
  { label: "東區", fallback: "eastern", options: [
    ["fortress_hill", "炮台山"], ["north_point", "北角"], ["quarry_bay", "鰂魚涌"], ["tai_koo", "太古"], ["sai_wan_ho", "西灣河"], ["shau_kei_wan", "筲箕灣"], ["heng_fa_chuen", "杏花邨"], ["chai_wan", "柴灣"], ["siu_sai_wan", "小西灣"], ["eastern", "東區"],
  ] },
  { label: "南區", fallback: "southern", options: [
    ["pok_fu_lam", "薄扶林"], ["aberdeen", "香港仔"], ["tin_wan", "田灣"], ["wah_fu", "華富"], ["wong_chuk_hang", "黃竹坑"], ["ap_lei_chau", "鴨脷洲"], ["deep_water_bay", "深水灣"], ["repulse_bay", "淺水灣"], ["stanley", "赤柱"], ["shek_o", "石澳"], ["southern", "南區"],
  ] },
  { label: "油尖旺區", fallback: "yau_tsim_mong", options: [
    ["prince_edward", "太子"], ["mong_kok", "旺角"], ["yau_ma_tei", "油麻地"], ["jordan", "佐敦"], ["austin", "柯士甸"], ["tsim_sha_tsui", "尖沙咀"], ["east_tsim_sha_tsui", "尖東"], ["kowloon_station", "九龍站"], ["olympic", "奧運"], ["tai_kok_tsui", "大角咀"], ["west_kowloon", "西九龍"], ["yau_tsim_mong", "油尖旺區"],
  ] },
  { label: "深水埗區", fallback: "sham_shui_po", options: [
    ["sham_shui_po_area", "深水埗"], ["shek_kip_mei", "石硤尾"], ["cheung_sha_wan", "長沙灣"], ["lai_chi_kok", "荔枝角"], ["mei_foo", "美孚"], ["nam_cheong", "南昌"], ["yau_yat_chuen", "又一村"], ["sham_shui_po", "深水埗區"],
  ] },
  { label: "九龍城區", fallback: "kowloon_city", options: [
    ["kowloon_city_area", "九龍城"], ["kowloon_tong", "九龍塘"], ["ho_man_tin", "何文田"], ["to_kwa_wan", "土瓜灣"], ["ma_tau_wai", "馬頭圍"], ["hung_hom", "紅磡"], ["whampoa", "黃埔"], ["kai_tak", "啟德"], ["kowloon_city", "九龍城區"],
  ] },
  { label: "黃大仙區", fallback: "wong_tai_sin", options: [
    ["wong_tai_sin_area", "黃大仙"], ["lok_fu", "樂富"], ["tsz_wan_shan", "慈雲山"], ["san_po_kong", "新蒲崗"], ["diamond_hill", "鑽石山"], ["ngau_chi_wan", "牛池灣"], ["choi_hung", "彩虹"], ["wong_tai_sin", "黃大仙區"],
  ] },
  { label: "觀塘區", fallback: "kwun_tong", options: [
    ["kwun_tong_area", "觀塘"], ["ngau_tau_kok", "牛頭角"], ["kowloon_bay", "九龍灣"], ["lam_tin", "藍田"], ["yau_tong", "油塘"], ["sau_mau_ping", "秀茂坪"], ["cha_kwo_ling", "茶果嶺"], ["kwun_tong", "觀塘區"],
  ] },
  { label: "葵青區", fallback: "kwai_tsing", options: [
    ["kwai_chung", "葵涌"], ["kwai_fong", "葵芳"], ["kwai_hing", "葵興"], ["tsing_yi", "青衣"], ["kwai_tsing", "葵青區"],
  ] },
  { label: "荃灣區", fallback: "tsuen_wan", options: [
    ["tsuen_wan_area", "荃灣"], ["tsuen_wan_west", "荃灣西"], ["belvedere_garden", "麗城"], ["sham_tseng", "深井"], ["ting_kau", "汀九"], ["ma_wan", "馬灣"], ["tsuen_wan", "荃灣區"],
  ] },
  { label: "屯門區", fallback: "tuen_mun", options: [
    ["tuen_mun_area", "屯門"], ["siu_hong", "兆康"], ["tuen_mun_pier", "屯門碼頭"], ["so_kwun_wat", "掃管笏"], ["gold_coast", "黃金海岸"], ["lam_tei", "藍地"], ["tuen_mun", "屯門區"],
  ] },
  { label: "元朗區", fallback: "yuen_long", options: [
    ["yuen_long_area", "元朗"], ["long_ping", "朗屏"], ["tin_shui_wai", "天水圍"], ["hung_shui_kiu", "洪水橋"], ["kam_tin", "錦田"], ["pat_heung", "八鄉"], ["san_tin", "新田"], ["lau_fau_shan", "流浮山"], ["ha_tsuen", "廈村"], ["yuen_long", "元朗區"],
  ] },
  { label: "北區", fallback: "north", options: [
    ["sheung_shui", "上水"], ["fanling", "粉嶺"], ["luen_wo_hui", "聯和墟"], ["kwu_tung", "古洞"], ["sha_tau_kok", "沙頭角"], ["ta_kwu_ling", "打鼓嶺"], ["luk_keng", "鹿頸"], ["north", "北區"],
  ] },
  { label: "大埔區", fallback: "tai_po", options: [
    ["tai_po_area", "大埔"], ["tai_po_market", "大埔墟"], ["tai_wo", "太和"], ["pak_shek_kok", "白石角"], ["lam_tsuen", "林村"], ["shuen_wan", "船灣"], ["tai_po", "大埔區"],
  ] },
  { label: "沙田區", fallback: "sha_tin", options: [
    ["sha_tin_area", "沙田"], ["sha_tin_wai", "沙田圍"], ["shek_mun", "石門"], ["city_one", "第一城"], ["fo_tan", "火炭"], ["tai_wai", "大圍"], ["hin_keng", "顯徑"], ["ma_on_shan", "馬鞍山"], ["wu_kai_sha", "烏溪沙"], ["sha_tin", "沙田區"],
  ] },
  { label: "西貢區", fallback: "sai_kung", options: [
    ["tseung_kwan_o", "將軍澳"], ["tiu_keng_leng", "調景嶺"], ["po_lam", "寶琳"], ["hang_hau", "坑口"], ["lohas_park", "康城"], ["sai_kung_town", "西貢"], ["clear_water_bay", "清水灣"], ["sai_kung", "西貢區"],
  ] },
  { label: "離島區", fallback: "islands", options: [
    ["tung_chung", "東涌"], ["airport", "機場"], ["discovery_bay", "愉景灣"], ["mui_wo", "梅窩"], ["tai_o", "大澳"], ["ngong_ping", "昂坪"], ["cheung_chau", "長洲"], ["peng_chau", "坪洲"], ["lamma_island", "南丫島"], ["islands", "離島區"],
  ] },
] as const;

export type District = (typeof areas)[number]["options"][number][0];
export const districtGroups = areas.map((group) => ({ label: group.label, options: group.options.map(([value, label]) => ({ value, label })) }));
export const districtValues = areas.flatMap((group) => group.options.map(([value]) => value)) as [District, ...District[]];
export const districtNames = Object.fromEntries(areas.flatMap((group) => group.options.map(([value, label]) => [value, label]))) as Record<District, string>;
export const districtFallbacks = new Set<District>(areas.map((group) => group.fallback));

export function isDistrict(value: unknown): value is District {
  return typeof value === "string" && Object.hasOwn(districtNames, value);
}
