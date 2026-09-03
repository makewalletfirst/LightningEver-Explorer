# LightningEver Explorer

A public, read-only web explorer for the **LightningEver LSP** — the Lightning
Network service provider that runs on top of the **BitEver** L1 chain.

It exposes a mempool.space-toned dashboard with live data about the LSP node,
its channels, recent 24-hour payment volume, and any on-chain channel activity.
The eclair admin API is **never** exposed to the public: this app proxies a
small set of read-only endpoints behind an in-memory cache so the LSP itself
never sees user traffic.

- Live deployment: **<https://lightningever.ever-chain.xyz>**
- LSP repo (fork of ACINQ/eclair, modified for BitEver L1):
  <https://github.com/makewalletfirst/LightningEver-eclair>
- LSP operator UI (RTL fork): <https://github.com/makewalletfirst/LightningEver-RTL>

---

## What it shows

| # | Section | Source endpoint |
|---|---|---|
| A | LSP node hero card — nodeId, alias, block height, eclair version, color | `eclair /getinfo` |
| B | Channel stats — active count, total capacity, LSP / user side balances | `eclair /channels` |
| C | Last 24 h payments — sent + received + relayed counts, total amount, relayed fees | `eclair /audit` |
| D | Channel list table — state pill, peer nodeId, channelId, capacity, balance bar | `eclair /channels` |
| E | Recent on-chain activity — channels in CLOSING / NEGOTIATING / CLOSED with funding tx | `eclair /channels` |

The page auto-refreshes every 20 s. Units follow BitEver convention: **BEC**
(8-decimal main unit) and **ever** (the satoshi-equivalent base unit).

---

## Architecture

```
                ┌────────────────────────────────────────────────┐
  Public ──▶ Cloudflare/nginx ──▶ this Node/Express app (3009) ──┤
                                          │                      │
                                          ▼                      │
                                  in-memory 20 s cache           │
                                          │                      │
                                          ▼                      │
                            eclair JSON-RPC (HTTP basic auth) ◀──┘
                                  http://<lsp-host>:8085
```

- Stack: Node ≥ 18, Express 4, vanilla HTML/CSS/JS frontend (no framework).
- The frontend is a single page; backend serves `public/` statically and
  proxies `/api/*`. No database, no write endpoints, no admin surface.
- A 20-second TTL cache absorbs all public traffic; eclair sees at most one
  request per endpoint per cache window regardless of visitor count.

### File layout

```
LN_explorer/
├── server.js              Express app — proxies eclair, serves static
├── config.js              runtime config (env-driven, committable)
├── ecosystem.example.js   PM2 template — copy to ecosystem.config.js
├── Dockerfile             multi-stage node:22-alpine build
├── .env.example           env-var template
├── public/
│   ├── index.html         single-page UI (Korean labels, OG meta, favicons)
│   ├── style.css          mempool.space-toned dark theme
│   ├── script.js          fetches /api/*, renders, 20 s loop
│   ├── og-image.png       link-preview thumbnail (KakaoTalk / Instagram / …)
│   ├── favicon.ico
│   └── assets/icons/      favicon-{16,32,180,192,512}.png
└── README.md
```

---

## Configuration (all via environment)

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3009` | TCP port to listen on |
| `HOST` | `0.0.0.0` | bind address |
| `ECLAIR_URL` | `http://127.0.0.1:8085` | eclair JSON-RPC base URL |
| `ECLAIR_PASSWORD` | _empty_ | eclair `api.password` (HTTP basic; user is empty) |
| `PUBLIC_URL` | `https://lightningever.ever-chain.xyz` | canonical / OG URL |
| `CACHE_TTL_MS` | `20000` | in-memory cache TTL for every API endpoint |

`config.js` reads only from env; the defaults are safe placeholders. **No
secrets are stored in this repository.** Production secrets live in
`ecosystem.config.js` (PM2) or in `docker run -e …` flags — both gitignored.

---

## Local build & run

```bash
git clone -b 260530 https://github.com/makewalletfirst/LightningEver-Explorer.git
cd LightningEver-Explorer
npm ci --omit=dev

# either one of these:
PORT=3009 ECLAIR_URL=http://10.8.0.6:8085 ECLAIR_PASSWORD=… node server.js
# or, with PM2:
cp ecosystem.example.js ecosystem.config.js
$EDITOR ecosystem.config.js           # fill in ECLAIR_PASSWORD etc.
pm2 start ecosystem.config.js
pm2 save
```

Smoke test:

```bash
curl -sI  http://127.0.0.1:3009/                 # → 200 OK, text/html
curl -s   http://127.0.0.1:3009/api/info | jq .  # → nodeId, alias, blockHeight
```

---

## Docker

A multi-stage Dockerfile is included. Image: `silverruler/lightningever-explorer`.

```bash
# build locally
docker build -t lightningever-explorer .

# pull from Docker Hub
docker pull silverruler/lightningever-explorer:260530

# run
docker run -d --name lightningever-explorer \
  --restart unless-stopped \
  -p 3009:3009 \
  -e ECLAIR_URL=http://<lsp-host>:8085 \
  -e ECLAIR_PASSWORD=<eclair-api-password> \
  -e PUBLIC_URL=https://<your-domain> \
  silverruler/lightningever-explorer:260530
```

The container runs as a single Node process under `tini`. Stateless — restart-
safe with no volume needed.

---

## Reverse-proxy example (nginx)

```nginx
server {
  listen 443 ssl http2;
  server_name lightningever.ever-chain.xyz;
  # … SSL config …

  location / {
    proxy_pass         http://10.8.0.6:3009;      # or wherever this app runs
    proxy_set_header   Host              $host;
    proxy_set_header   X-Forwarded-For   $remote_addr;
    proxy_set_header   X-Forwarded-Proto $scheme;
  }
}
```

---

## API surface

All endpoints are GET, return JSON, and are cached for `CACHE_TTL_MS`.

| Route | Purpose |
|---|---|
| `GET /api/info` | LSP node info (nodeId, alias, block height, version, color) |
| `GET /api/channels` | full eclair channels payload |
| `GET /api/stats/channels` | aggregated counts + capacity + LSP/user balance totals (sat) |
| `GET /api/stats/payments24h` | rolling 24 h sent / received / relayed counts + amounts (msat) |
| `GET /api/recent/activity` | channels in CLOSING / CLOSED / NEGOTIATING (up to 20) |

There are **no write endpoints**. The frontend never sees the eclair
password — it lives only in the server process's environment.

---

## Open Graph / link preview

`public/index.html` ships full OG and Twitter card metadata pointing at
`/og-image.png` (a BitEver-themed 1580×1752 image). When the public URL is
shared on KakaoTalk / Instagram / Twitter, the link preview renders that
image with the title **"LightningEver Explorer"**.

Replace `public/og-image.png` to change the preview thumbnail.

---

## Theme

Dark theme tuned to mempool.space / BitEver:

| Token | Value |
|---|---|
| `--bg` | `#11141d` |
| `--bg-elev` | `#1d1f31` |
| `--cyan` | `#1bd8f4` |
| `--purple` | `#9339f4` |
| `--green` (NORMAL state) | `#2ecc71` |
| `--yellow` (NEGOTIATING) | `#ffc107` |
| `--orange` (CLOSING) | `#fd7e14` |

Channel-state pills inherit from these tokens; see `public/style.css`.

---

## License

MIT.
