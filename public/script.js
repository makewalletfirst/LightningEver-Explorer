/* LightningEver Explorer — frontend logic. Fetches /api/* every 20s. */

const REFRESH_MS = 20_000;

// ── helpers ──────────────────────────────────────────────────────────────
const $ = s => document.querySelector(s);
const fmtBec = (sat) => (sat / 1e8).toLocaleString('en-US', { maximumFractionDigits: 8 });
const fmtEver = (n) => n.toLocaleString('en-US');
const msatToSat = (msat) => Math.floor(Number(msat ?? 0) / 1000);
const msatToBec = (msat) => msatToSat(msat) / 1e8;
const shortHex = (h, head = 8, tail = 6) =>
  !h ? '—' : h.length <= head + tail + 3 ? h : `${h.slice(0, head)}…${h.slice(-tail)}`;
const esc = (s) => (s == null ? '' : String(s)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;'));

/** Small inline clipboard svg + a sibling check svg used for the "copied"
 *  flash. The `data-copy` attribute holds the full string to write to the
 *  clipboard when the button is clicked (see the document-level handler). */
function copyBtn(value, label) {
  if (!value) return '';
  return `<button class="copy-btn" type="button" data-copy="${esc(value)}" title="${esc(label || '복사')}" aria-label="copy">
    <svg class="ic-copy" viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true">
      <path d="M5 1.5A1.5 1.5 0 0 1 6.5 0h5A1.5 1.5 0 0 1 13 1.5v9A1.5 1.5 0 0 1 11.5 12h-5A1.5 1.5 0 0 1 5 10.5v-9zm1 0v9a.5.5 0 0 0 .5.5h5a.5.5 0 0 0 .5-.5v-9a.5.5 0 0 0-.5-.5h-5a.5.5 0 0 0-.5.5z"/>
      <path d="M3 4a1.5 1.5 0 0 0-1.5 1.5v9A1.5 1.5 0 0 0 3 16h5a1.5 1.5 0 0 0 1.5-1.5V14h-1v.5a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5h.5V4H3z"/>
    </svg>
    <svg class="ic-ok" viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true">
      <path d="M13.485 1.929a1 1 0 0 1 1.414 1.414L6.414 11.83a1 1 0 0 1-1.414 0L1.1 7.929A1 1 0 1 1 2.515 6.514l3.192 3.192z"/>
    </svg>
  </button>`;
}

/** Hex value + short display + copy button — used for nodeId / channelId. */
function hexCell(value, head = 8, tail = 6) {
  if (!value) return '<span class="hex-short">—</span>';
  return `<span class="hex-short" title="${esc(value)}">${esc(shortHex(value, head, tail))}</span>${copyBtn(value)}`;
}

/** SCID cell — prefers real ("BBBxTTTxOOO"), falls back to alias hex.
 *  Marks the source (real / local / remote) with a small tag. */
function scidCell(scid) {
  scid = scid || {};
  let value, kind;
  if (scid.real)             { value = scid.real;        kind = 'real';   }
  else if (scid.localAlias)  { value = scid.localAlias;  kind = 'alias';  }
  else if (scid.remoteAlias) { value = scid.remoteAlias; kind = 'remote'; }
  if (!value) return '<span class="hex-short">—</span>';
  // tooltip: show every known form of the SCID
  const tip = [
    scid.real        ? `real ${scid.real}`             : null,
    scid.localAlias  ? `localAlias ${scid.localAlias}` : null,
    scid.remoteAlias ? `remoteAlias ${scid.remoteAlias}` : null,
  ].filter(Boolean).join('\n');
  return `<span class="hex-short scid-${kind}" title="${esc(tip)}">${esc(value)}</span>${copyBtn(value, `SCID 복사 (${kind})`)}`;
}

function setStatus(ok) {
  const dot = $('#connectionStatus .dot');
  const txt = $('#connectionStatus span:last-child');
  if (ok) { dot.className = 'dot dot-on';  txt.textContent = '연결됨'; }
  else    { dot.className = 'dot dot-off'; txt.textContent = '연결 끊김'; }
}

async function fetchJson(url) {
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`${url} HTTP ${r.status}`);
  return r.json();
}

// ── A. node info ─────────────────────────────────────────────────────────
async function loadNode() {
  try {
    const d = await fetchJson('/api/info');
    // node hero: full id + a copy button so the operator can grab it
    const nidEl = $('#nodeIdLine');
    nidEl.innerHTML = d.nodeId
      ? `${esc(d.nodeId)} ${copyBtn(d.nodeId, 'nodeId 복사')}`
      : '—';
    $('#nodeAlias').textContent   = d.alias || '—';
    $('#blockHeight').textContent = d.blockHeight?.toLocaleString('en-US') ?? '—';
    $('#eclairVersion').textContent = d.version?.split('-')[0] || '—';
    const color = d.color || '#49daaa';
    const sw = $('#nodeColor .swatch');
    if (sw) sw.style.background = color;
    $('#nodeColor').childNodes[1].nodeValue = ' ' + color;
    setStatus(true);
  } catch (e) {
    setStatus(false);
    throw e;
  }
}

// ── B. channel stats ─────────────────────────────────────────────────────
async function loadChannelStats() {
  try {
    const s = await fetchJson('/api/stats/channels');
    $('#channelsActive').textContent = s.active;
    $('#channelsTotal').textContent  = `전체 ${s.total} 개`;
    $('#capacityValue').textContent     = fmtBec(s.capacitySat);
    $('#capacityValueSat').textContent  = `${fmtEver(s.capacitySat)} ever`;
    $('#localValue').textContent  = fmtBec(s.localSat);
    $('#remoteValue').textContent = `${fmtBec(s.remoteSat)} BEC`;
  } catch { /* graceful */ }
}

// ── C. 24h payment stats ────────────────────────────────────────────────
async function loadPayments24h() {
  try {
    const p = await fetchJson('/api/stats/payments24h');
    const totalCount = p.sentCount + p.receivedCount + p.relayedCount;
    const totalMsat  = p.sentMsat + p.receivedMsat;
    $('#payments24Count').textContent  = totalCount;
    $('#payments24Amount').textContent = `${fmtBec(msatToSat(totalMsat))} BEC`;
    $('#payments24Fees').textContent   = `${fmtEver(msatToSat(p.relayedFeesMsat))} ever`;
  } catch { /* graceful */ }
}

// ── D. channel list ─────────────────────────────────────────────────────
async function loadChannels() {
  try {
    const list = await fetchJson('/api/channels');
    const rows = list.map(c => {
      const localSat  = c.localSat  ?? 0;
      const remoteSat = c.remoteSat ?? 0;
      const capSat = c.capacitySat ?? (localSat + remoteSat);
      const ratio = capSat ? Math.round((localSat / capSat) * 100) : 0;
      return `
        <tr>
          <td><span class="state state-${esc(c.state)}">${esc(c.state)}</span></td>
          <td>${hexCell(c.nodeId, 10, 6)}</td>
          <td>${hexCell(c.channelId, 8, 6)}</td>
          <td>${scidCell(c.scid)}</td>
          <td class="num">${fmtBec(capSat)} BEC</td>
          <td>
            <div class="bbar">
              <div class="bbar-track"><div class="bbar-fill" style="width:${ratio}%"></div></div>
              <div class="bbar-text">${fmtBec(localSat)} / ${fmtBec(remoteSat)}</div>
            </div>
          </td>
        </tr>
      `;
    });
    const tbody = $('#channelsTable tbody');
    tbody.innerHTML = rows.length
      ? rows.join('')
      : '<tr><td colspan="6" class="empty">활성 채널 없음</td></tr>';
    $('#channelsMeta').textContent = `${list.length} 개 채널`;
  } catch (e) {
    $('#channelsTable tbody').innerHTML =
      '<tr><td colspan="6" class="empty">불러올 수 없음</td></tr>';
  }
}

// ── E. recent activity ─────────────────────────────────────────────────
async function loadRecent() {
  try {
    const d = await fetchJson('/api/recent/activity');
    const rows = (d.closing || []).map(c => `
      <tr>
        <td><span class="state state-${esc(c.state)}">${esc(c.state)}</span></td>
        <td>${hexCell(c.nodeId, 10, 6)}</td>
        <td>${hexCell(c.channelId, 8, 6)}</td>
        <td>${scidCell(c.scid)}</td>
        <td>${hexCell(c.fundingTxId, 8, 6)}</td>
      </tr>
    `);
    const tbody = $('#recentTable tbody');
    tbody.innerHTML = rows.length
      ? rows.join('')
      : '<tr><td colspan="5" class="empty">최근 종료/협상 중인 채널 없음</td></tr>';
  } catch {
    $('#recentTable tbody').innerHTML =
      '<tr><td colspan="5" class="empty">불러올 수 없음</td></tr>';
  }
}

// ── clipboard copy (document-level delegation) ───────────────────────────
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.copy-btn');
  if (!btn) return;
  e.preventDefault();
  const value = btn.dataset.copy;
  if (!value) return;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      // Fallback for older browsers / non-secure contexts
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.style.position = 'fixed'; ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select(); document.execCommand('copy');
      document.body.removeChild(ta);
    }
    btn.classList.add('copied');
    setTimeout(() => btn.classList.remove('copied'), 1100);
  } catch {
    btn.classList.add('copy-fail');
    setTimeout(() => btn.classList.remove('copy-fail'), 1100);
  }
});

// ── refresh loop ───────────────────────────────────────────────────────
async function refreshAll() {
  await Promise.allSettled([
    loadNode(),
    loadChannelStats(),
    loadPayments24h(),
    loadChannels(),
    loadRecent(),
  ]);
  const now = new Date();
  $('#lastUpdated').textContent =
    `last update ${now.toLocaleTimeString('ko-KR', { hour12: false })}`;
}

refreshAll();
setInterval(refreshAll, REFRESH_MS);
