declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    MOONSHOT_API_KEY?: string;
    PUBLIC_SITE_URL?: string;
    ALLOWED_ORIGIN?: string;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    INITIAL_OWNER_EMAIL?: string;
    RESTAURANT_ENRICHMENT_TOKEN_HASH?: string;
    RESTAURANT_ENRICHMENT_COLLECTION_IDS?: string;
    RESTAURANT_ENRICHMENT_EXCLUDED_IDS?: string;
  }
}
