"use client";

import { useEffect } from "react";
import { collectionFetch } from "../lib/client-api";

type Tool = { name: string; description: string; inputSchema: object; annotations: object; execute: (input: Record<string, unknown>) => Promise<object> };
type Context = { registerTool: (tool: Tool) => Promise<unknown>; unregisterTool?: (name: string) => void };

export function useRestaurantEnrichmentTools(adminVerified: boolean) {
  useEffect(() => {
    const context = (document as Document & { modelContext?: Context }).modelContext;
    if (!adminVerified || !context?.registerTool) return;
    const idSchema = { type: "string", pattern: "^[A-Za-z0-9_-]{1,80}$" };
    const string = (maxLength: number) => ({ type: "string", maxLength });
    async function call(path: string, body?: object): Promise<object> {
      try {
        const response = await collectionFetch(path, undefined, body ? { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {});
        const data = await response.json() as Record<string, unknown>;
        return { ok: response.ok, status: response.status, ...data };
      } catch { return { ok: false, error: "餐廳資料連線失敗，請稍後重試。" }; }
    }
    const tools: Tool[] = [
      {
        name: "list_pending_closerice_restaurants",
        description: "管理員專用：分頁讀取有用餐紀錄、尚未完成或分店不確定的餐廳資料。略過成員手動確認的資料及最近7天已檢查的餐廳。不讀取私人評語、訂單或成員資料。回傳nextCursor供續查。空清單代表暫無工作。",
        inputSchema: { type: "object", properties: { cursor: string(80), limit: { type: "integer", minimum: 1, maximum: 50 } }, additionalProperties: false },
        annotations: { readOnlyHint: true },
        execute: async (input) => call(`/api/enrichment/restaurants?limit=${Math.max(1, Math.min(50, Number(input.limit) || 25))}&cursor=${encodeURIComponent(String(input.cursor ?? "").slice(0, 80))}`),
      },
      {
        name: "get_closerice_restaurant_profile",
        description: "管理員專用：讀取單一餐廳分店的資料、來源、保護狀態與版本。更新前先讀取，不會讀取私人食評。",
        inputSchema: { type: "object", properties: { id: idSchema }, required: ["id"], additionalProperties: false },
        annotations: { readOnlyHint: true },
        execute: async (input) => call(`/api/enrichment/restaurants/${encodeURIComponent(String(input.id))}`),
      },
      {
        name: "update_closerice_restaurant_profile",
        description: "只在用戶授權餐廳資料補充時使用。管理員專用：以剛讀取的expectedVersion儲存分店地址、地區及圖片來源。送出完整欄位保留原資料。不可猜測分店，不能覆寫成員手動資料或既有地址；409時停止並重新核對。地址必須附來源。相片只可使用確有授權的圖片參照，保留署名及授權依據；禁止抓取或複製Google Maps、Street View、OpenRice圖片。無可重用相片就留空並標示missing/link_only/restricted，不可編造。分店不確定用uncertain及reviewNotes。回傳實際儲存結果，失敗不能報稱成功。",
        inputSchema: { type: "object", properties: { id: idSchema, expectedVersion: { type: "integer", minimum: 1 }, address: string(500), region: string(80), sourceUrl: string(2000), coverPhotoUrl: string(2000), coverSourceUrl: string(2000), coverAttribution: string(500), coverLicense: string(300), coverUsage: { type: "string", enum: ["missing", "owned", "licensed", "link_only", "restricted"] }, reviewState: { type: "string", enum: ["pending", "verified", "uncertain"] }, reviewNotes: string(1000) }, required: ["id", "expectedVersion", "address", "region", "sourceUrl", "coverPhotoUrl", "coverSourceUrl", "coverAttribution", "coverLicense", "coverUsage", "reviewState", "reviewNotes"], additionalProperties: false },
        annotations: { readOnlyHint: false, destructiveHint: false },
        execute: async (input) => { const { id, ...body } = input; return call(`/api/enrichment/restaurants/${encodeURIComponent(String(id))}`, body); },
      },
    ];
    for (const tool of tools) void context.registerTool(tool).catch(() => {});
    return () => { for (const tool of tools) context.unregisterTool?.(tool.name); };
  }, [adminVerified]);
}
