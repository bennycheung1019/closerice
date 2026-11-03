# Restaurant branch profiles and future weekly enrichment

This release prepares the app. It does not schedule a task, search live restaurants, create a credential, enable Google billing, or download provider imagery.

## Data and migration

Apply `0009_restaurant_branch_profiles.sql` after the existing migrations and before deploying the Worker. Back up D1 first. The migration adds `restaurant_branches` and nullable `reviews.restaurant_id`, then links exact trimmed restaurant-name + district matches within each collection. It does not use fuzzy matching or combine different collections. Existing review, opinion, and photo IDs/contents stay intact; food photos remain attached to their original reviews. Legacy reviews with no collection are retained without a branch. Cross-collection branch assignments are blocked by database triggers.

The profile stores region, address, address source URL, cover URL and source page, attribution, license/usage basis, usage state, last checked time, pending/verified/uncertain state and notes, manual protection, and a revision number. Each group's profile is independent. New manual/agent reviews and changes through the member or admin API attach to the correct exact branch automatically. Old restaurant/district fields remain for compatibility and meal history.

Group owners/editors can edit profile details; viewers can read them. A manual save protects the profile from future automatic updates. Updates require the current `expectedVersion`; conflicting edits receive 409 rather than overwriting a newer change. Successful changes and their actor are audited atomically.

## Restricted workflow

All endpoints are under `https://bunbun.space/closerice/api/` and return no-store responses.

- `GET /enrichment/restaurants?limit=25&cursor=...`: up to 50 profiles with a meal reference, unlocked and incomplete/uncertain, never checked or last checked over 7 days ago. Follow `nextCursor`; an empty page is a normal no-op.
- `GET /enrichment/restaurants/{id}`: read that branch's details/revision.
- `PATCH /enrichment/restaurants/{id}`: submit the full editable details plus `expectedVersion`. No review, opinion, user, membership, or collection administration is exposed by these endpoints. Names, identity, collection, check timestamps and version cannot be supplied as editable fields.
- `GET/PATCH /restaurants/{id}`: member-facing equivalent, requires a session and `X-Collection-Id`; PATCH requires owner/editor access and the site Origin.

The enrichment endpoints accept an existing signed-in site administrator. Cookie-authenticated writes require `Origin: https://bunbun.space` to prevent CSRF. Never copy a browser login cookie into an AI chat or a scheduled prompt. A future connected tool can use a dedicated bearer credential instead, but service access is **disabled by default**: both `RESTAURANT_ENRICHMENT_TOKEN_HASH` (base64url SHA-256 of a high-entropy token) and `RESTAURANT_ENRICHMENT_COLLECTION_IDS` (explicit comma-separated IDs) must be configured privately. This release does not configure them. Without both, bearer requests are denied. Tokens are scoped only to these endpoints and the configured groups; sending a group header cannot widen that scope. Rotate/revoke by replacing/removing the secret. A raw token must never enter frontend code, GitHub, logs, docs, or task prompts.

Example PATCH body (values below are placeholders):

```json
{
  "expectedVersion": 1,
  "address": "Verified branch address",
  "region": "香港",
  "sourceUrl": "https://restaurant.example/address",
  "coverPhotoUrl": "",
  "coverSourceUrl": "",
  "coverAttribution": "",
  "coverLicense": "",
  "coverUsage": "missing",
  "reviewState": "verified",
  "reviewNotes": "No reusable cover photo found"
}
```

Each field is optional except `expectedVersion`, with empty/default values if omitted; clients should read the profile and send a full details payload to retain existing fields. Automation requires a source URL when supplying an address and cannot change an existing address. If a different branch may be involved, retain the current address and set `reviewState: uncertain` with `reviewNotes`. Do not guess the branch. Do not overwrite manual corrections or retry a 409 using a guessed version. A future workflow should notify on unresolved matches or failures, and remain quiet on an empty scan.

## Photos and Google Maps

The Worker never fetches image URLs or source pages. Only HTTPS references are accepted. A cover is displayed only with owned/licensed usage status, a source page, attribution, and a usage basis/license; missing, link-only, restricted, or failed images show a storefront placeholder. Attribution links stay beside the image. Existing food photos are never chosen as a restaurant cover automatically. This is not an upload interface: members can currently supply an authorized image reference.

Do not scrape Google Maps, its photo sections, Street View or OpenRice, download their imagery, hotlink their image hosts as covers, remove attribution, or treat the app owner's permission as a license from the provider. Google/OpenRice imagery hosts and source pages are rejected for cover display. A source URL or public search result is not evidence of reuse rights. Only use an actual reusable license/permission for a cover; otherwise retain a source link and mark link-only/restricted/missing.

The page uses Google's supported Maps search URL (`https://www.google.com/maps/search/?api=1&query=...`), built from branch name and known address/district. It requires no API key and opens Google Maps, where users can access available photos and Street View. No embedded map or Street View image is enabled/configured. If embeds are added later, use the official supported embed workflow and retain attribution. The Maps Embed API currently requires a valid key and billing setup even though Embed usage is listed as no-charge; this release does not create either. Street View Static API is not used.

Official references checked 2026-11-03:
- https://developers.google.com/maps/documentation/urls/get-started
- https://developers.google.com/maps/documentation/streetview/policies
- https://developers.google.com/maps/documentation/embed/quickstart
- https://www.openrice.com/info/tnc/OR-terms-en.html

## Verification

```sh
python3 tests/restaurant-profile-migration.py
npx tsc --noEmit
VITE_API_BASE_URL=https://bunbun.space/closerice npm run build:pages
node node_modules/wrangler/bin/wrangler.js deploy --dry-run --outdir /private/tmp/closerice-restaurant-test-bundle --config worker/wrangler.toml
node tests/restaurant-api.mjs
```

The API test runs the bundled Worker against a temporary Miniflare database with disposable fixture sessions. It does not access or change production. It checks authentication, group scopes, private-data isolation, image validation, version conflicts, manual protection, audit entries, create/edit/agent branch assignment, and disabled service access.

## Handoff for the requested Monday 13:00 Hong Kong check

The requested cadence is every Monday at 13:00 Asia/Hong_Kong, with a report of additions/changes. No schedule is created in this release.

Before scheduling:
1. Get explicit approval before creating any persistent credential. Configure a high-entropy bearer token privately in the authorized agent's secret environment, its SHA-256 hash in the Worker secret, and an explicit allowlist of group IDs. No bearer access works until these are configured; this release has verified the route with disposable local test credentials only.
2. Read-only preflight: authenticated `GET https://bunbun.space/closerice/api/enrichment/restaurants?limit=1`. Expect HTTP 200, `restaurants` and `nextCursor`, no review comments or user records. An empty list means no current work. HTTP 403 means stop and repair the authorized connection; do not fall back to direct unrestricted database writes.
3. Fetch remaining pending profiles using the paginated GET. Only send restaurant name, branch/district/region to web search, never private comments, order details or member information. Confirm branch identity and photo reuse rights from accessible sources.
4. Update using authenticated `PATCH https://bunbun.space/closerice/api/enrichment/restaurants/{id}` with the full details JSON shown above and the just-read `expectedVersion`. Existing admin sessions can also use the endpoint through a signed-in browser with same-site Origin, but a cookie is not a durable unattended connection and must not be exported into task prompts.
5. On 409, reload and report the conflict; do not guess a new version or overwrite manual entries. Unknown branches remain `uncertain`; unavailable/unlicensed imagery stays empty or link-only. Failed requests are reported, never counted as successful changes.

Report format: run timestamp and timezone; profiles checked; profiles updated; no-change count; uncertain/failed count; then one row per changed profile with restaurant/branch, changed fields, before → after, source URL, image license/usage status, and resulting checked date. Separate unresolved matches with the reason and required input. Do not include private reviews or member data. Branch IDs plus expectedVersion protect against duplicate/stale writes; the database stores each successful mutation and its actor atomically with an audit entry. The weekly queue excludes manual locks, checks only profiles with actual meal references, and skips profiles checked in the past 7 days.

For a desktop project task, Benny's Mac must remain on and the desktop app running. The API can be called from a cloud agent once an authorized cloud connection is configured, but no cloud-agent credential or MCP connection is established by this release; unattended cloud operation has not been verified. A Cloudflare timer alone cannot perform the agent's web research without an additional execution/search service. Do not imply that deploying the Worker has scheduled or funded that research.

### Existing-session browser tools (no new credential)

Opening `/closerice/admin/` as the existing site administrator registers three WebMCP tools after the server confirms admin access: `list_pending_closerice_restaurants`, `get_closerice_restaurant_profile`, and `update_closerice_restaurant_profile`. Fetch the tab's current tools before use; browser-exposed names may include a suffix. The update tool sends a same-origin PATCH using the existing HttpOnly session; it never reveals/export cookies or gains user/membership administration. The server checks the administrator on every call, so expired/revoked sessions fail. This path preserves automatic rather than manual-lock semantics. A scheduled desktop browser agent may use this existing connection when the Mac/app/browser are available and signed in; successful preflight at setup cannot guarantee the session remains valid on every future run. On 403 stop and report that login is required. This does not establish an unattended cloud connection.
