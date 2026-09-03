/*
 * LightningEver Explorer — runtime configuration.
 *
 * All secrets MUST come from environment variables. The defaults below are
 * safe placeholders so this file is committable to a public repository.
 *
 * In production we supply env via PM2 ecosystem.config.js (gitignored) or
 * `docker run -e ECLAIR_PASSWORD=… -e ECLAIR_URL=…`.
 */
module.exports = {
  port: Number(process.env.PORT) || 3009,
  bindHost: process.env.HOST || '0.0.0.0',

  // eclair LSP API
  eclair: {
    url: process.env.ECLAIR_URL || 'http://127.0.0.1:8085',
    password: process.env.ECLAIR_PASSWORD || '',
  },

  // canonical public origin (OG / <link rel="canonical">)
  publicUrl: process.env.PUBLIC_URL || 'https://lightningever.ever-chain.xyz',

  // in-memory cache TTL (ms) — protects the LSP from public traffic
  cacheTtl: Number(process.env.CACHE_TTL_MS) || 20_000,
};
