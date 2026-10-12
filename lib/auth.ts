import { env } from "cloudflare:workers";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "../db";
import { collections, memberships, sessions, users } from "../db/schema";

export type CollectionRole = "owner" | "editor" | "viewer";
export type SessionUser = { id: string; email: string; name: string };
export type CollectionAccess = { user: SessionUser; collectionId: string; role: CollectionRole };

const sessionCookie = "__Secure-closerice_session";
const oauthCookie = "__Secure-closerice_oauth";
// Browsers cap persistent cookies (Chrome uses 400 days), so renew on each visit.
const sessionSeconds = 400 * 24 * 60 * 60;
const siteUrl = "https://bunbun.space/closerice/";
const callbackUrl = "https://bunbun.space/closerice/api/auth/google/callback";
let googleKeys: { keys: Array<JsonWebKey & { kid?: string }>; expiresAt: number } | null = null;

function cookie(request: Request, name: string): string | null {
  return request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? null;
}

function randomToken(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function sha256(value: string): Promise<string> {
  return base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}

export async function tokenHash(value: string): Promise<string> {
  return sha256(value);
}

export function newInviteToken(): string {
  return randomToken();
}

function sessionSetCookie(token: string): string {
  return `${sessionCookie}=${token}; Path=/closerice; Max-Age=${sessionSeconds}; HttpOnly; Secure; SameSite=Lax`;
}

function clearCookie(name: string, path: string): string {
  return `${name}=; Path=${path}; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

export async function getSessionUser(request: Request): Promise<SessionUser | null> {
  const token = cookie(request, sessionCookie);
  if (!token || token.length > 128) return null;
  const hash = await sha256(token);
  const db = getDb();
  const row = await db.select({ id: users.id, email: users.email, name: users.name }).from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, hash), gt(sessions.expiresAt, Date.now()))).get();
  return row ?? null;
}

export async function refreshSession(request: Request, userId: string): Promise<string | null> {
  const token = cookie(request, sessionCookie);
  if (!token || token.length > 128) return null;
  const now = Date.now();
  const renewed = await getDb().update(sessions).set({ expiresAt: now + sessionSeconds * 1000 })
    .where(and(eq(sessions.tokenHash, await sha256(token)), eq(sessions.userId, userId), gt(sessions.expiresAt, now)))
    .returning({ tokenHash: sessions.tokenHash });
  return renewed.length ? sessionSetCookie(token) : null;
}

export async function getCollectionAccess(request: Request, write = false, requestedCollectionId?: string): Promise<CollectionAccess | null> {
  const user = await getSessionUser(request);
  const collectionId = requestedCollectionId ?? request.headers.get("X-Collection-Id");
  if (!user || !collectionId || collectionId.length > 80) return null;
  const db = getDb();
  const collection = await db.select({ ownerUserId: collections.ownerUserId }).from(collections)
    .where(eq(collections.id, collectionId)).get();
  if (!collection) return null;
  if (collection.ownerUserId === user.id) return { user, collectionId, role: "owner" };
  const membership = await db.select({ role: memberships.role }).from(memberships)
    .where(and(eq(memberships.collectionId, collectionId), eq(memberships.userId, user.id))).get();
  if (membership?.role !== "editor" && membership?.role !== "viewer") return null;
  if (write && membership.role !== "editor") return null;
  return { user, collectionId, role: membership.role };
}

export async function getOwnerAccess(request: Request): Promise<CollectionAccess | null> {
  const access = await getCollectionAccess(request);
  return access?.role === "owner" ? access : null;
}

async function verifyGoogleIdToken(value: string, nonce: string): Promise<{ sub: string; email: string; name: string }> {
  if (value.length > 12_000) throw new Error("Google ID token too large");
  const [encodedHeader, encodedPayload, encodedSignature, extra] = value.split(".");
  if (!encodedHeader || !encodedPayload || !encodedSignature || extra) throw new Error("Malformed Google ID token");
  const header = JSON.parse(new TextDecoder().decode(decodeBase64Url(encodedHeader))) as { alg?: string; kid?: string };
  const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(encodedPayload))) as {
    iss?: string; aud?: string; exp?: number; nonce?: string; sub?: string; email?: string; email_verified?: boolean; name?: string;
  };
  if (header.alg !== "RS256" || !header.kid || !payload.sub || !payload.email || payload.email_verified !== true ||
    payload.aud !== env.GOOGLE_CLIENT_ID || !["https://accounts.google.com", "accounts.google.com"].includes(payload.iss ?? "") ||
    !payload.exp || payload.exp <= Math.floor(Date.now() / 1000) || payload.nonce !== nonce) throw new Error("Invalid Google ID token claims");
  if (!googleKeys || googleKeys.expiresAt < Date.now() || !googleKeys.keys.some((key) => key.kid === header.kid)) {
    const response = await fetch("https://www.googleapis.com/oauth2/v3/certs");
    if (!response.ok) throw new Error("Google signing keys unavailable");
    const data = await response.json() as { keys: Array<JsonWebKey & { kid?: string }> };
    googleKeys = { keys: data.keys, expiresAt: Date.now() + 60 * 60 * 1000 };
  }
  const jwk = googleKeys.keys.find((key) => key.kid === header.kid);
  if (!jwk) throw new Error("Google signing key not found");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, decodeBase64Url(encodedSignature), new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`));
  if (!valid) throw new Error("Invalid Google ID token signature");
  return { sub: payload.sub, email: payload.email.toLowerCase(), name: payload.name?.slice(0, 120) ?? "" };
}

export async function startGoogleLogin(): Promise<Response> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return Response.json({ error: "Google 登入暫時未設定。" }, { status: 503 });
  const state = randomToken();
  const verifier = randomToken();
  const nonce = randomToken();
  const challenge = await sha256(verifier);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  for (const [key, value] of Object.entries({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: callbackUrl, response_type: "code", scope: "openid email profile", state, nonce, code_challenge: challenge, code_challenge_method: "S256" })) {
    url.searchParams.set(key, value);
  }
  const oauthState = base64Url(new TextEncoder().encode(JSON.stringify({ state, verifier, nonce, createdAt: Date.now() })));
  return new Response(null, { status: 302, headers: { Location: url.toString(), "Set-Cookie": `${oauthCookie}=${oauthState}; Path=/closerice/api/auth; Max-Age=600; HttpOnly; Secure; SameSite=Lax`, "Cache-Control": "no-store" } });
}

export async function finishGoogleLogin(request: Request): Promise<Response> {
  const failed = () => Response.redirect(`${siteUrl}?authError=login`, 302);
  const raw = cookie(request, oauthCookie);
  if (!raw || raw.length > 2048) return failed();
  let data: { state: string; verifier: string; nonce: string; createdAt: number };
  try { data = JSON.parse(new TextDecoder().decode(decodeBase64Url(raw))); }
  catch { return failed(); }
  const url = new URL(request.url);
  if (!data.state || data.state !== url.searchParams.get("state") || Date.now() - data.createdAt > 600_000 || !url.searchParams.get("code")) return failed();
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code: url.searchParams.get("code")!, client_id: env.GOOGLE_CLIENT_ID!, client_secret: env.GOOGLE_CLIENT_SECRET!, redirect_uri: callbackUrl, grant_type: "authorization_code", code_verifier: data.verifier }),
    });
    if (!response.ok) throw new Error("Google token exchange failed");
    const tokens = await response.json() as { id_token?: string };
    if (!tokens.id_token) throw new Error("Google ID token absent");
    const identity = await verifyGoogleIdToken(tokens.id_token, data.nonce);
    const db = getDb();
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.googleSubject, identity.sub)).get();
    const userId = existing?.id ?? crypto.randomUUID();
    if (existing) await db.update(users).set({ email: identity.email, name: identity.name }).where(eq(users.id, userId));
    else await db.insert(users).values({ id: userId, googleSubject: identity.sub, email: identity.email, name: identity.name, createdAt: new Date().toISOString() });
    if (env.INITIAL_OWNER_EMAIL?.toLowerCase() === identity.email) {
      const claimed = await db.update(collections).set({ ownerUserId: userId }).where(and(eq(collections.id, "legacy-home"), isNull(collections.ownerUserId))).returning({ id: collections.id });
      if (claimed.length) console.log("Initial Home collection owner claimed");
    }
    const token = randomToken();
    await db.insert(sessions).values({ tokenHash: await sha256(token), userId, expiresAt: Date.now() + sessionSeconds * 1000 });
    const headers = new Headers({ Location: siteUrl, "Cache-Control": "no-store" });
    headers.append("Set-Cookie", sessionSetCookie(token));
    headers.append("Set-Cookie", clearCookie(oauthCookie, "/closerice/api/auth"));
    return new Response(null, { status: 302, headers });
  } catch (error) {
    console.error("Google login failed", error instanceof Error ? error.message : "unknown");
    return failed();
  }
}

export async function logout(request: Request): Promise<Response> {
  const token = cookie(request, sessionCookie);
  if (token) await getDb().delete(sessions).where(eq(sessions.tokenHash, await sha256(token)));
  return new Response(null, { status: 204, headers: { "Set-Cookie": clearCookie(sessionCookie, "/closerice"), "Cache-Control": "no-store" } });
}
