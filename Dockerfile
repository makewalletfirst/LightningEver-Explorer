# LightningEver Explorer — minimal multi-stage build.
# All runtime config is supplied via env (PORT, ECLAIR_URL, ECLAIR_PASSWORD, …).
ARG BASE_DISTRO="node:22-alpine"

FROM ${BASE_DISTRO} AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY . .

FROM ${BASE_DISTRO} AS runner
RUN apk add --no-cache tini
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/config.js ./config.js
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/public ./public

ENV NODE_ENV=production \
    PORT=3009 \
    HOST=0.0.0.0 \
    CACHE_TTL_MS=20000

EXPOSE 3009
ENTRYPOINT ["/sbin/tini", "-g", "--"]
CMD ["node", "server.js"]
