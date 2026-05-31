/*
 * LightningEver Explorer — public read-only HTTP frontend for the
 * BitEver Lightning LSP. Proxies safe eclair API endpoints with
 * an in-memory cache so the LSP itself never sees the user load.
 */

const express = require('express');
const path = require('path');
const config = require('./config');

const app = express();

// ── eclair API helper ───────────────────────────────────────────────────────
const ECLAIR_AUTH = 'Basic ' + Buffer.from(':' + config.eclair.password).toString('base64');

async function eclair(endpoint, formBody = '') {
  const res = await fetch(`${config.eclair.url}/${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: ECLAIR_AUTH,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formBody,
  });
  if (!res.ok) throw new Error(`eclair ${endpoint} HTTP ${res.status}`);
  return res.json();
}

// ── channel normalizer ──────────────────────────────────────────────────────
// Pulls the fields that callers actually care about out of eclair's deeply-
// nested channel JSON. Also derives the funding txid from channelId + the
// output_index encoded in the real SCID (BOLT 2: channelId equals
// funding_txid with the lower 16 bits XORed against funding_output_index).

/** "BBBxTTTxOOO" → output index, or 0 if SCID isn't in that form. */
function outputIndexFromScid(scid) {
  if (typeof scid === 'string' && /^\d+x\d+x\d+$/.test(scid)) {
    return parseInt(scid.split('x')[2], 10) || 0;
  }
  return 0;
}

/** Recover funding txid from channelId and the funding output index. */
function fundingTxIdFromChannelId(channelIdHex, outputIndex) {
  if (typeof channelIdHex !== 'string' || channelIdHex.length !== 64) return null;
  const last2 = parseInt(channelIdHex.slice(-4), 16) ^ (outputIndex & 0xffff);
  return channelIdHex.slice(0, -4) + last2.toString(16).padStart(4, '0');
}

function normalizeChannel(c) {
  const active0     = c.data?.commitments?.active?.[0] ?? {};
  const spec        = active0.localCommit?.spec ?? {};
  const localMsat   = BigInt(spec.toLocal  ?? 0);
  const remoteMsat  = BigInt(spec.toRemote ?? 0);
  const realScid    = active0.localFunding?.shortChannelId ?? null;
  const localAlias  = c.data?.aliases?.localAlias  ?? null;
  const remoteAlias = c.data?.aliases?.remoteAlias ?? null;
  const outIdx      = outputIndexFromScid(realScid);

  return {
    channelId:   c.channelId,
    nodeId:      c.nodeId,                              // peer
    state:       c.state,
    capacitySat: Number((localMsat + remoteMsat) / 1000n),
    localSat:    Number(localMsat  / 1000n),
    remoteSat:   Number(remoteMsat / 1000n),
    scid: { real: realScid, localAlias, remoteAlias },
    fundingTxId: fundingTxIdFromChannelId(c.channelId, outIdx),
  };
}

// ── in-memory cache ─────────────────────────────────────────────────────────
const cache = new Map();
async function cached(key, ttl, fn) {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.t < ttl) return hit.v;
  const v = await fn();
  cache.set(key, { v, t: now });
  return v;
}

// ── safe read-only endpoints ───────────────────────────────────────────────
app.get('/api/info', async (_req, res) => {
  try {
    const data = await cached('info', config.cacheTtl, () => eclair('getinfo'));
    res.json(data);
  } catch (e) { res.status(502).json({ error: e.message }); }
});

app.get('/api/channels', async (_req, res) => {
  try {
    const data = await cached('channels', config.cacheTtl, async () => {
      const raw = await eclair('channels');
      return raw.map(normalizeChannel);
    });
    res.json(data);
  } catch (e) { res.status(502).json({ error: e.message }); }
});

/** 채널 통계 — 활성 채널 수, 총 capacity (sat), local/remote 잔액 합 */
app.get('/api/stats/channels', async (_req, res) => {
  try {
    const data = await cached('stats:channels', config.cacheTtl, async () => {
      const channels = await eclair('channels');
      const active = channels.filter(c => c.state === 'NORMAL');
      let capacityMsat = 0n, localMsat = 0n, remoteMsat = 0n;
      for (const c of channels) {
        const data = c.data?.commitments?.params?.localParams?.maxHtlcValueInFlightMsat ?? 0;
        const localCommit = c.data?.commitments?.active?.[0]?.localCommit?.spec;
        if (localCommit) {
          const tl = BigInt(localCommit.toLocal ?? 0);
          const tr = BigInt(localCommit.toRemote ?? 0);
          localMsat += tl;
          remoteMsat += tr;
          capacityMsat += tl + tr;
        }
      }
      return {
        total: channels.length,
        active: active.length,
        states: channels.reduce((m, c) => (m[c.state] = (m[c.state] || 0) + 1, m), {}),
        capacitySat: Number(capacityMsat / 1000n),
        localSat: Number(localMsat / 1000n),
        remoteSat: Number(remoteMsat / 1000n),
      };
    });
    res.json(data);
  } catch (e) { res.status(502).json({ error: e.message }); }
});

/** 24h 결제 통계 — sent / received / relayed */
app.get('/api/stats/payments24h', async (_req, res) => {
  try {
    const data = await cached('stats:payments24h', config.cacheTtl, async () => {
      const since = Date.now() - 24 * 3600 * 1000;
      const body = `from=${since}&to=${Date.now()}`;
      const [sent, received, relayed] = await Promise.all([
        eclair('audit', body).then(r => r.sent ?? []).catch(() => []),
        eclair('audit', body).then(r => r.received ?? []).catch(() => []),
        eclair('audit', body).then(r => r.relayed ?? []).catch(() => []),
      ]);
      const sumAmount = arr => arr.reduce((s, x) => s + (x.amount ?? x.recipientAmount ?? 0), 0);
      const sumFees   = arr => arr.reduce((s, x) => s + (x.feesPaid ?? x.feesMsat ?? 0), 0);
      return {
        sentCount:     sent.length,
        sentMsat:      sumAmount(sent),
        receivedCount: received.length,
        receivedMsat:  sumAmount(received),
        relayedCount:  relayed.length,
        relayedFeesMsat: sumFees(relayed),
      };
    });
    res.json(data);
  } catch (e) { res.status(502).json({ error: e.message }); }
});

/** 채널별 mempool/on-chain 액티비티 — recent close/swap-in tx */
app.get('/api/recent/activity', async (_req, res) => {
  try {
    const data = await cached('recent:activity', config.cacheTtl, async () => {
      const channels = await eclair('channels');
      const items = channels
        .filter(c => ['CLOSING', 'CLOSED', 'NEGOTIATING'].includes(c.state))
        .map(normalizeChannel);
      return { closing: items.slice(0, 20) };
    });
    res.json(data);
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// ── static frontend ────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '5m',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  },
}));

// SPA-style fallback (single index.html)
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(config.port, config.bindHost, () => {
  console.log(`[lightningever-explorer] listening on http://${config.bindHost}:${config.port}`);
  console.log(`[lightningever-explorer] eclair API → ${config.eclair.url}`);
  console.log(`[lightningever-explorer] public URL → ${config.publicUrl}`);
});
