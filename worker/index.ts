import { GET as listReviews, POST as createReview } from "../app/api/reviews/route";
import { PATCH as updateReview, DELETE as deleteReview } from "../app/api/reviews/[id]/route";
import { POST as createOpinion } from "../app/api/reviews/[id]/opinions/route";
import { PATCH as updateOpinion, DELETE as deleteOpinion } from "../app/api/opinions/[id]/route";
import { POST as createAgentReview } from "../app/api/agent/reviews/route";
import { POST as uploadPhoto } from "../app/api/reviews/[id]/photos/route";
import { GET as getPhoto, DELETE as deletePhoto } from "../app/api/photos/[id]/route";
import { POST as scanReceipt } from "../app/api/scan/route";
import { finishGoogleLogin, logout, startGoogleLogin } from "../lib/auth";
import { handleCollectionApi, handleTagsApi } from "../lib/collection-api";
import { handleAdminApi } from "../lib/admin-api";

async function api(request: Request, path: string): Promise<Response> {
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && request.headers.get("Origin") !== "https://bunbun.space") {
    return Response.json({ error: "請從 Closerice 網站提交請求。" }, { status: 403 });
  }
  if (path === "/api/auth/google/start" && request.method === "GET") return startGoogleLogin();
  if (path === "/api/auth/google/callback" && request.method === "GET") return finishGoogleLogin(request);
  if (path === "/api/auth/logout" && request.method === "POST") return logout(request);
  if (path.startsWith("/api/admin/")) return handleAdminApi(request, path);
  if (path === "/api/me" || path === "/api/collections" || path.startsWith("/api/collections/") || path === "/api/invites/accept") return handleCollectionApi(request, path);
  if (path === "/api/tags" || path.startsWith("/api/tags/")) return handleTagsApi(request, path);
  if (path === "/api/reviews" && request.method === "GET") return listReviews(request);
  if (path === "/api/reviews" && request.method === "POST") return createReview(request);
  if (path === "/api/agent/reviews" && request.method === "POST") return createAgentReview(request);
  if (path === "/api/scan" && request.method === "POST") return scanReceipt(request);
  const review = /^\/api\/reviews\/([^/]+)$/.exec(path);
  const visitOpinions = /^\/api\/reviews\/([^/]+)\/opinions$/.exec(path);
  const opinion = /^\/api\/opinions\/([^/]+)$/.exec(path);
  const reviewPhoto = /^\/api\/reviews\/([^/]+)\/photos$/.exec(path);
  const photo = /^\/api\/photos\/([^/]+)$/.exec(path);
  if (review && request.method === "PATCH") return updateReview(request, { params: Promise.resolve({ id: review[1] }) });
  if (review && request.method === "DELETE") return deleteReview(request, { params: Promise.resolve({ id: review[1] }) });
  if (visitOpinions && request.method === "POST") return createOpinion(request, { params: Promise.resolve({ id: visitOpinions[1] }) });
  if (opinion && request.method === "PATCH") return updateOpinion(request, { params: Promise.resolve({ id: opinion[1] }) });
  if (opinion && request.method === "DELETE") return deleteOpinion(request, { params: Promise.resolve({ id: opinion[1] }) });
  if (reviewPhoto && request.method === "POST") return uploadPhoto(request, { params: Promise.resolve({ id: reviewPhoto[1] }) });
  if (photo && request.method === "GET") return getPhoto(request, { params: Promise.resolve({ id: photo[1] }) });
  if (photo && request.method === "DELETE") return deletePhoto(request, { params: Promise.resolve({ id: photo[1] }) });
  return Response.json({ error: "找不到頁面。" }, { status: 404 });
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.hostname !== "bunbun.space") return new Response(null, { status: 404 });
    if (url.pathname === "/closerice") return Response.redirect(`https://bunbun.space/closerice/${url.search}`, 308);
    if (!url.pathname.startsWith("/closerice/")) return new Response(null, { status: 404 });
    if (url.pathname.startsWith("/closerice/api/")) {
      const response = await api(request, url.pathname.slice("/closerice".length));
      const headers = new Headers(response.headers);
      headers.set("Cache-Control", "no-store");
      headers.set("X-Content-Type-Options", "nosniff");
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    }
    if (request.method !== "GET" && request.method !== "HEAD") return new Response(null, { status: 405 });
    const upstream = new URL(url.pathname + url.search, "https://bennycheung1019.github.io");
    const headers = new Headers();
    for (const name of ["Accept", "Range", "If-None-Match", "If-Modified-Since"]) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    const response = await fetch(upstream, { method: request.method, headers, redirect: "follow" });
    const resultHeaders = new Headers(response.headers);
    resultHeaders.delete("set-cookie");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers: resultHeaders });
  },
};
