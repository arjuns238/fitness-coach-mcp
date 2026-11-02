export const config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? '127.0.0.1',
  /** Shared secret Claude sends on every request (Authorization: Bearer <key> or X-API-Key). */
  apiKey: process.env.MCP_API_KEY ?? '',
  dbPath: process.env.DB_PATH ?? 'data/fitness.db',
  /** Public hostnames this server answers to, e.g. "fitness-coach.fly.dev". */
  allowedHosts: (process.env.ALLOWED_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean),
  /** Used until a timezone is saved with update_profile. The server itself usually runs in UTC. */
  defaultTimezone: process.env.USER_TIMEZONE ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
};

export const isLoopback = (host: string) => ['127.0.0.1', 'localhost', '::1'].includes(host);
