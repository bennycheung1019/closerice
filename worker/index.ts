import { GET as listReviews, POST as createReview } from "../app/api/reviews/route";
import { PATCH as updateReview, DELETE as deleteReview } from "../app/api/reviews/[id]/route";
import { POST as createAgentReview } from "../app/api/agent/reviews/route";
import { POST as uploadPhoto } from "../app/api/reviews/[id]/photos/route";
import { GET as getPhoto, DELETE as deletePhoto } from "../app/api/photos/[id]/route";
import { POST as scanReceipt } from "../app/api/scan/route";

function corsHeaders(origin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export default {
  async fetch(request: Request, env: Cloudflare.Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    if (url.hostname === "bunbun.space") {
      if (path === "/closerice") {
        return Response.redirect(`https://bunbun.space/closerice/${url.search}`, 308);
      }
      if (!path.startsWith("/closerice/")) return new Response(null, { status: 404 });
      if (request.method !== "GET" && request.method !== "HEAD") return new Response(null, { status: 405 });
      const upstream = new URL(path + url.search, "https://bennycheung1019.github.io");
      const headers = new Headers();
      for (const name of ["Accept", "Range", "If-None-Match", "If-Modified-Since"]) {
        const value = request.headers.get(name);
        if (value) headers.set(name, value);
      }
      const response = await fetch(upstream, { method: request.method, headers, redirect: "follow" });
      const resultHeaders = new Headers(response.headers);
      resultHeaders.delete("set-cookie");
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers: resultHeaders });
    }
    const origin = request.headers.get("Origin");
    const allowedOrigins = (env.ALLOWED_ORIGIN ?? "https://bennycheung1019.github.io,https://bunbun.space").split(",").map((value) => value.trim());
    if (origin && !allowedOrigins.includes(origin)) return new Response("Origin not allowed", { status: 403 });
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: origin ? corsHeaders(origin) : undefined });
    }

    let response: Response;
    if (path === "/api/reviews" && request.method === "GET") response = await listReviews();
    else if (path === "/api/reviews" && request.method === "POST") response = await createReview(request);
    else if (path === "/api/agent/reviews" && request.method === "POST") response = await createAgentReview(request);
    else if (path === "/api/scan" && request.method === "POST") response = await scanReceipt(request);
    else {
      const review = /^\/api\/reviews\/([^/]+)$/.exec(path);
      const reviewPhoto = /^\/api\/reviews\/([^/]+)\/photos$/.exec(path);
      const photo = /^\/api\/photos\/([^/]+)$/.exec(path);
      if (review && request.method === "PATCH") response = await updateReview(request, { params: Promise.resolve({ id: review[1] }) });
      else if (review && request.method === "DELETE") response = await deleteReview(request, { params: Promise.resolve({ id: review[1] }) });
      else if (reviewPhoto && request.method === "POST") response = await uploadPhoto(request, { params: Promise.resolve({ id: reviewPhoto[1] }) });
      else if (photo && request.method === "GET") response = await getPhoto(request, { params: Promise.resolve({ id: photo[1] }) });
      else if (photo && request.method === "DELETE") response = await deletePhoto(request, { params: Promise.resolve({ id: photo[1] }) });
      else response = Response.json({ error: "找不到頁面。" }, { status: 404 });
    }

    if (!origin) return response;
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders(origin))) headers.set(key, value);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
};
