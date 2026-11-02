export const config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? '127.0.0.1',
  /** Shared secret Claude sends on every request (Authorization: Bearer <key> or X-API-Key). */
  apiKey: process.env.MCP_API_KEY ?? '',
  dbPath: process.env.DB_PATH ?? 'data/fitness.db',
  /** The built dashboard (`npm run build`). */
  webDir: process.env.WEB_DIR ?? 'web/dist',
  /** Public hostnames this server answers to, e.g. "fitness-coach.fly.dev". */
  allowedHosts: (process.env.ALLOWED_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean),
  /** USDA FoodData Central, for label data. DEMO_KEY works but allows only ~10 lookups an hour. */
  fdcApiKey: process.env.FDC_API_KEY || 'DEMO_KEY',
  fdcBaseUrl: process.env.FDC_BASE_URL ?? 'https://api.nal.usda.gov/fdc/v1',
  /** Open Food Facts, the fallback for barcodes. */
  offBaseUrl: process.env.OFF_BASE_URL ?? 'https://world.openfoodfacts.org',
  /** Used until a timezone is saved with update_profile. The server itself usually runs in UTC. */
  defaultTimezone: process.env.USER_TIMEZONE ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
};

export const isLoopback = (host: string) => ['127.0.0.1', 'localhost', '::1'].includes(host);
