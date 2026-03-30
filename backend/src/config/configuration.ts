export default () => ({
  app: {
    port: Number(process.env.PORT ?? 4000),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    frontendOrigin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5500',
  },
  auth: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret-change-me',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret-change-me',
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
  },
  scan: {
    allowedDomains: (process.env.ALLOWED_SCAN_DOMAINS ?? '')
      .split(',')
      .map((domain) => domain.trim().toLowerCase())
      .filter(Boolean),
    maxCrawlPages: Number(process.env.MAX_CRAWL_PAGES ?? 25),
  },
  network: {
    outboundProxyUrl: process.env.OUTBOUND_PROXY_URL ?? '',
  },
});
