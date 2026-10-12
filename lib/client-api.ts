import { apiUrl } from "./client-urls";

export function collectionFetch(path: string, collectionId?: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (collectionId) headers.set("X-Collection-Id", collectionId);
  return fetch(apiUrl(path), { ...init, headers, credentials: "include", cache: "no-store" });
}

export async function responseJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "請稍後再試。");
  return data;
}
