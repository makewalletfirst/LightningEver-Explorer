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
    $('#nodeIdLine').textContent  = d.nodeId || '—';
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
      const commit = c.data?.commitments?.active?.[0]?.localCommit?.spec;
      const localSat  = commit ? msatToSat(commit.toLocal)  : 0;
      const remoteSat = commit ? msatToSat(commit.toRemote) : 0;
      const capSat = localSat + remoteSat;
      const ratio = capSat ? Math.round((localSat / capSat) * 100) : 0;
      return `
        <tr>
          <td><span class="state state-${c.state}">${c.state}</span></td>
          <td><span class="hex-short" title="${c.nodeId}">${shortHex(c.nodeId, 10, 6)}</span></td>
          <td><span class="hex-short" title="${c.channelId}">${shortHex(c.channelId, 8, 6)}</span></td>
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
      : '<tr><td colspan="5" class="empty">활성 채널 없음</td></tr>';
    $('#channelsMeta').textContent = `${list.length} 개 채널`;
  } catch (e) {
    $('#channelsTable tbody').innerHTML =
      '<tr><td colspan="5" class="empty">불러올 수 없음</td></tr>';
  }
}

// ── E. recent activity ─────────────────────────────────────────────────
async function loadRecent() {
  try {
    const d = await fetchJson('/api/recent/activity');
    const rows = (d.closing || []).map(c => `
      <tr>
        <td><span class="state state-${c.state}">${c.state}</span></td>
        <td><span class="hex-short" title="${c.nodeId}">${shortHex(c.nodeId, 10, 6)}</span></td>
        <td><span class="hex-short" title="${c.channelId}">${shortHex(c.channelId, 8, 6)}</span></td>
        <td><span class="hex-short" title="${c.fundingTxId || ''}">${shortHex(c.fundingTxId, 8, 6)}</span></td>
      </tr>
    `);
    const tbody = $('#recentTable tbody');
    tbody.innerHTML = rows.length
      ? rows.join('')
      : '<tr><td colspan="4" class="empty">최근 종료/협상 중인 채널 없음</td></tr>';
  } catch {
    $('#recentTable tbody').innerHTML =
      '<tr><td colspan="4" class="empty">불러올 수 없음</td></tr>';
  }
}

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
