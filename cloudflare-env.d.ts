declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    MOONSHOT_API_KEY?: string;
    PUBLIC_SITE_URL?: string;
    ALLOWED_ORIGIN?: string;
  }
}
