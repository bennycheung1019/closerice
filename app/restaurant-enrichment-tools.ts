"use client";

import { useEffect } from "react";
import { collectionFetch } from "../lib/client-api";
import { districtValues } from "../lib/districts";

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
        description: "管理員專用：分頁讀取有用餐紀錄、尚未有餐廳分店連結的餐廳。略過已排除、成員手動確認及最近7天已檢查的餐廳。優先核對OpenRice餐廳主頁連結；亦可保存使用者指定的Foodpanda後備網頁連結，平台獨立標示，不搜尋或補充地址、地圖或相片。不讀取私人評語、訂單或成員資料。回傳nextCursor供續查。空清單代表暫無工作。",
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
        name: "list_linked_closerice_restaurants",
        description: "管理員專用：分頁讀取已有 OpenRice 連結的餐廳分店及其現有地區，供每週核對。包含手動保護標記；核對時不可把網址路徑、搜尋摘要或不能讀取的頁面當作地區證據。略過已排除的測試餐廳，不讀取私人食評。",
        inputSchema: { type: "object", properties: { cursor: string(80), limit: { type: "integer", minimum: 1, maximum: 50 } }, additionalProperties: false },
        annotations: { readOnlyHint: true },
        execute: async (input) => call(`/api/enrichment/restaurants/linked?limit=${Math.max(1, Math.min(50, Number(input.limit) || 25))}&cursor=${encodeURIComponent(String(input.cursor ?? "").slice(0, 80))}`),
      },
      {
        name: "update_closerice_restaurant_profile",
        description: "只在用戶授權餐廳分店連結補充時使用。管理員專用：用剛讀取的expectedVersion儲存已核對的OpenRice餐廳主頁連結或使用者指定的Foodpanda後備餐廳網頁連結、確認狀態與備註。只接受無追蹤參數的餐廳主頁，不可猜測網址或分店。找不到確實分店就留空及標示uncertain。不得搜尋或寫入地址、地圖、相片。不能覆寫既有連結或成員手動資料；409時停止並核對。回傳實際儲存結果，失敗不可報成功。",
        inputSchema: { type: "object", properties: { id: idSchema, expectedVersion: { type: "integer", minimum: 1 }, openriceUrl: string(2000), foodpandaUrl: string(2000), reviewState: { type: "string", enum: ["pending", "verified", "uncertain"] }, reviewNotes: string(1000) }, required: ["id", "expectedVersion", "openriceUrl", "foodpandaUrl", "reviewState", "reviewNotes"], additionalProperties: false },
        annotations: { readOnlyHint: false, destructiveHint: false },
        execute: async (input) => { const { id, ...body } = input; return call(`/api/enrichment/restaurants/${encodeURIComponent(String(id))}`, body); },
      },
      {
        name: "correct_closerice_restaurant_district",
        description: "只在已讀取並核實該分店 OpenRice 頁面明確寫出的地區時使用；網址路徑、搜尋摘要、歷史快取或不能讀取的頁面不足以更改地區。管理員專用，必須提供剛讀取的 expectedVersion、已儲存且完全相同的 OpenRice 分店網址，以及具體核對備註。原子地更改分店與其已有用餐紀錄的地區並記錄審計；手動保護、同名目標地區分店或版本衝突時停止，不可猜測或覆寫。不得修改私人評語或相片。",
        inputSchema: { type: "object", properties: { id: idSchema, expectedVersion: { type: "integer", minimum: 1 }, district: { type: "string", enum: districtValues }, openriceUrl: string(2000), evidenceNote: string(300) }, required: ["id", "expectedVersion", "district", "openriceUrl", "evidenceNote"], additionalProperties: false },
        annotations: { readOnlyHint: false, destructiveHint: false },
        execute: async (input) => { const { id, ...body } = input; return call(`/api/enrichment/restaurants/${encodeURIComponent(String(id))}/district`, body); },
      },
    ];
    for (const tool of tools) void context.registerTool(tool).catch(() => {});
    return () => { for (const tool of tools) context.unregisterTool?.(tool.name); };
  }, [adminVerified]);
}
