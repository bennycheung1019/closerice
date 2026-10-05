import { env } from "cloudflare:workers";
import { errorResponse } from "../../../lib/reviews";
import { parseReceiptScan } from "../../../lib/receipt-scan";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxBytes = 8 * 1024 * 1024;

async function rateLimit(request: Request, apiKey: string): Promise<boolean> {
  if (!env.DB) throw new Error("D1 unavailable");
  const hour = Math.floor(Date.now() / 3_600_000);
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(apiKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${hour}:${ip}`));
  const fingerprint = Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const expiresAt = (hour + 1) * 3_600_000;
  await env.DB.prepare("DELETE FROM scan_usage WHERE expires_at < ?").bind(Date.now() - 86_400_000).run();
  const usage = await env.DB.prepare("INSERT INTO scan_usage (key, count, expires_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count")
    .bind(fingerprint, expiresAt).first<{ count: number }>();
  if ((usage?.count ?? 21) > 20) return false;
  const day = Math.floor(Date.now() / 86_400_000);
  const daily = await env.DB.prepare("INSERT INTO scan_usage (key, count, expires_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count")
    .bind(`daily:${day}`, (day + 1) * 86_400_000).first<{ count: number }>();
  return (daily?.count ?? 101) <= 100;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

export async function POST(request: Request) {
  const apiKey = env.MOONSHOT_API_KEY?.trim();
  if (!apiKey) return errorResponse("AI 掃描暫時未設定，請先手動填寫。", 503);
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes + 100_000) return errorResponse("圖片需小於 8 MB。", 413);

  let image: File;
  try {
    const data = await request.formData();
    const candidate = data.get("image");
    if (!(candidate instanceof File)) return errorResponse("請選擇圖片。", 400);
    image = candidate;
  } catch {
    return errorResponse("無法讀取圖片，請重試。", 400);
  }
  if (!allowedTypes.has(image.type)) return errorResponse("請使用 JPEG、PNG 或 WebP 圖片。", 415);
  if (image.size === 0 || image.size > maxBytes) return errorResponse("圖片需小於 8 MB。", 413);

  try {
    if (!(await rateLimit(request, apiKey))) return errorResponse("掃描次數已達上限，請稍後再試或手動填寫。", 429);
    const imageUrl = `data:${image.type};base64,${toBase64(new Uint8Array(await image.arrayBuffer()))}`;
    const response = await fetch("https://api.moonshot.ai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "kimi-k2.6",
        thinking: { type: "disabled" },
        response_format: { type: "json_object" },
        max_tokens: 1200,
        messages: [
          { role: "system", content: "Read only visible text in this food order screenshot or receipt. Return one JSON object with keys restaurant, food, diningDate, channel, orderNumber, amountHKD, locationText. Use null for any unknown field. restaurant is the displayed merchant name, including branch. food is purchased dishes, not vouchers or fees. diningDate must be YYYY-MM-DD only when the complete date is visible; never infer it from the clock or current date. channel is keeta, foodpanda, takeaway, dine_in, or null, only if explicit. amountHKD is the paid total as a number, not item subtotal or tip. locationText is the exact visible branch or address text proving the restaurant's district; do not infer a district from a brand or nearby landmark. Do not invent a review, score, or comment." },
          { role: "user", content: [
            { type: "text", text: "Extract the receipt details as JSON. Read Chinese and English. If a field is unclear, use null." },
            { type: "image_url", image_url: { url: imageUrl } },
          ] },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      console.error("Kimi scan failed", response.status);
      return errorResponse("AI 暫時無法掃描，請稍後再試或手動填寫。", 502);
    }
    const result = await response.json() as { choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }> };
    const first = result.choices?.[0];
    if (first?.finish_reason !== "stop" || !first.message?.content) return errorResponse("圖片未能完整辨認，請重試或手動填寫。", 502);
    const scan = parseReceiptScan(first.message.content);
    return Response.json({ scan }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Receipt scan failed", error instanceof Error ? error.name : "unknown");
    return errorResponse("AI 暫時無法掃描，請稍後再試或手動填寫。", 502);
  }
}
