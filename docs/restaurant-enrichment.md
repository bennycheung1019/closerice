# Restaurant links

## Current presentation

Show one small actual app icon: OpenRice first, otherwise Foodpanda. Icons are unmodified official App Store artwork, displayed at 32px inside a 44px tap target. The source is identified through alt text, an accessible action label and a tooltip. Links use the saved ordinary HTTPS restaurant webpage URL in a new tab. There is no custom app scheme, forced app launch, automatic redirect, Keeta button, restaurant address, Maps action, cover photo or fake illustration. Existing food-photo thumbnails remain.

Current source assignments: eight OpenRice URLs and the user-selected Foodpanda vendor pu6a for 亞星. Exact test profile ec91e69545613b352957ef589e072b77 remains excluded. Six links came from earlier public evidence; three were user supplied. Page/crawl/check dates are not evidence of current operation. 香港站’s supplied URL slug says 太子, while its original district remains 旺角; keep this discrepancy flagged. The possible 亞星 delivery-kitchen/address context is user-provided only.

The restaurant detail page uses a compact summary with a standalone top-left Back button. It omits the global branding/group bar and introduction only in this view; returning to the restaurant list restores them. The rating and visit metadata share a row, with the source icon and repeat action below, and the link editor at the upper right. This layout change has no data migration.

## Migrations

0010 adds openrice_url. 0011 removes exactly eight unused address/cover-enrichment columns (region, address, source_url, cover_photo_url, cover_source_url, cover_attribution, cover_license, cover_usage). 0012 adds optional foodpanda_url. The unpublished Keeta experiment and migration 0013 were archived under ignored .backups/keeta-experiment-before-simple-links-2026-11-03, not applied to production.

IDs, groups, restaurant names, original districts, verification state/notes, checked/created/updated timestamps, manual protection and versions remain. Reviews, opinions and food-photo tables remain unchanged. Historical audit JSON and verification notes remain as history. A scoped backup of ten restaurant profiles and a tested restore fixture were created before local cleanup; they are not a substitute for a fresh full D1 backup before production changes. Never publish or purge these backups.

## Restricted endpoints

All routes are under https://bunbun.space/closerice/api/ and return private no-store responses. GET /enrichment/restaurants returns eligible profiles with meal references, both source URLs absent, no manual protection or exact exclusion, and no check in the past seven days. Follow nextCursor; an empty queue is a normal no-op. GET /enrichment/restaurants/{id} reads a current profile/version without private review comments. PATCH accepts only expectedVersion, openriceUrl, foodpandaUrl, reviewState and reviewNotes. Missing editable fields retain saved values. Explicit verified state requires a source link. Existing nonempty links and member-protected entries cannot be overwritten by enrichment; stop on 409 and review current data.

Member GET/PATCH /restaurants/{id} requires session/group access; PATCH needs owner/editor rights and the site Origin. Manual updates protect the profile. Writes are version guarded and audited atomically. Only clean OpenRice main-page and Foodpanda vendor URLs are accepted, with strict provider hosts and no tracking queries/fragments or credentials. URL shape does not prove branch identity. The server never fetches pages/images. The UI uses OpenRice when both links exist.

The signed-in administrator page exposes list_pending_closerice_restaurants, get_closerice_restaurant_profile, update_closerice_restaurant_profile via WebMCP. Fetch current tools each turn. Existing cookies remain in the browser; never export them. Writes require the same-site Origin. On 403, stop and request sign-in through the app; never bypass the restricted API with direct database writes.

Bearer access remains disabled without both RESTAURANT_ENRICHMENT_TOKEN_HASH and an explicit RESTAURANT_ENRICHMENT_COLLECTION_IDS allowlist. No credential was created. RESTAURANT_ENRICHMENT_EXCLUDED_IDS excludes exact IDs from pending and direct enrichment access while preserving normal members’ access/reviews. Retain the existing single test ID on future deployments and skip it in saved retry lists.

## Future weekly work

Only identify the correct OpenRice main page or retain the user-specified Foodpanda fallback. Send only restaurant name and district to search, never private comments, orders or member data. Do not resume earlier address/Maps/photo or Keeta share-link scraping tasks. Do not guess branches, scrape/copy photos or bypass access checks. Save only reviewed source links using fresh versions. Remain quiet on no work, and report changes, unresolved matches or failures. The coordinating chat owns the future schedule; none was created here. A desktop run needs the Mac/app and valid session; no unattended cloud connection exists.

### District correction

The existing link-update endpoint cannot change districts. The
`list_linked_closerice_restaurants` admin tool pages through branches with a
saved OpenRice link, including already linked branches on every weekly run. It
returns only branch identity, district, link, verification state, timestamps,
manual protection and version. The test ID is excluded. The existing pending
tool still finds new branches without links.

For a possible correction, open and read the exact saved OpenRice branch page.
Its visible branch details must explicitly support the new district; a URL
slug, search snippet, inaccessible page, old cached result or user-supplied
link alone is insufficient. If the page cannot be verified, leave the
district and linked meal records unchanged and report the discrepancy. Never
derive a district from the restaurant brand.

After a fresh `get_closerice_restaurant_profile` read, the
`correct_closerice_restaurant_district` tool accepts the current
`expectedVersion`, a valid district code, the identical saved OpenRice URL
and a specific evidence note. The admin-only
`PATCH /enrichment/restaurants/{id}/district` checks group scope, manual
protection, exact source URL, version and same-name target-district collisions.
It atomically updates the branch and only its linked meal records, records the
before/after and evidence in the audit log, and returns the number of meals
updated. A stale or colliding change returns 409; stop and re-read rather than
guessing. A no-op district returns unchanged without an audit write.

The weekly report should give each corrected branch's old/new district,
OpenRice page, visible evidence, check time and affected meal count. This
workflow needs a signed-in admin session on the Mac for the WebMCP tools. It does
not change the nine existing links or the currently disputed 香港站 district.

## Release procedure

For an approved release: obtain a fresh complete D1 backup and test its restore; apply 0010, 0011 and 0012; coordinate the matching Worker and GitHub Pages frontend publication while retaining exact exclusion; then re-read profiles and save reviewed source-link proposals with their current versions. Older profile-edit requests use an intentionally removed address/cover shape, so coordinate that rollout. The release is published only after these checks pass. The earlier three FEHD source changes and exact test exclusion were approved/saved/deployed before the later hold.

Checks passed: TypeScript, URL/provider validation, disposable API checks, migrations/foreign keys and review-photo preservation, scoped backup restore, Worker dry-run, frontend build, and both icon/link views at 390px with no horizontal overflow. Official icon provenance: public/platforms/SOURCES.json.
