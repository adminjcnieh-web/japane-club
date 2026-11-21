// Layar QR dinamis untuk pengurus/admin: QR berganti tiap 30 detik, daftar hadir diperbarui langsung.
import * as api from './api.js';
import { icon } from './icons.js';
import { esc, fmtDate, fmtTime, loadScript, initials } from './utils.js';
import { LIBS, QR_POLL_MS } from './config.js';
import { toast, statusBadge, emptyState, loadingBlock, errorState, meetingBadge, withBusy } from './ui.js';
import { closeAttendance, openAttendance } from './meetings.js';

const R = 22;
const CIRC = 2 * Math.PI * R;

// Menggambar SVG sendiri dari matriks modul (hanya memakai getModuleCount/isDark milik pustaka),
// supaya tidak bergantung pada varian createSvgTag. Quiet zone 2 modul sudah termasuk.
function qrSvg(text) {
  const qr = window.qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const pad = 2;
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + pad} ${r + pad}h1v1h-1z`;
  }
  const size = n + pad * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="Kode QR absensi"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

export async function qrStageView({ container, params, isStale }) {
  const id = params.id;
  container.innerHTML = `<p style="margin-bottom:12px"><a href="#/meetings/${esc(id)}" class="small">${icon('chevronLeft')} Kembali ke detail pertemuan</a></p><div class="panel">${loadingBlock('Menyiapkan QR')}</div>`;

  try {
    await loadScript(LIBS.qrcode);
  } catch (e) {
    container.innerHTML = `<div class="panel">${errorState(e.message)}</div>`;
    container.querySelector('#retry')?.addEventListener('click', () => location.reload());
    return;
  }
  if (isStale()) return;

  const state = {
    meeting: null,
    open: false,
    token: null,
    expiresAt: 0, // dalam jam server
    offset: 0, // serverTime - Date.now()
    records: new Map(),
    since: null,
    fresh: new Set(),
    lastOk: Date.now(),
    failing: false,
  };
  let pollTimer = null, tickTimer = null, destroyed = false, fetching = false, renderedToken = null;

  const serverNow = () => Date.now() + state.offset;

  async function fetchQr() {
    if (fetching || destroyed) return;
    fetching = true;
    try {
      const q = state.since ? `?since=${encodeURIComponent(state.since)}` : '';
      const r = await api.get(`/api/meetings/${id}/qr${q}`);
      if (destroyed || isStale()) return;
      state.failing = false;
      state.lastOk = Date.now();
      state.offset = r.serverTime - Date.now();
      state.meeting = r.meeting;
      state.open = r.open;
      state.token = r.token;
      state.expiresAt = r.expiresAt || 0;
      for (const rec of r.records || []) {
        if (!state.records.has(rec.uid)) state.fresh.add(rec.uid);
        state.records.set(rec.uid, rec);
        if (!state.since || rec.updatedAt > state.since) state.since = rec.updatedAt;
      }
      paint();
    } catch (e) {
      if (destroyed) return;
      state.failing = true;
      if (e.status === 404) {
        container.innerHTML = `<div class="panel">${emptyState({ iconName: 'alert', title: 'Pertemuan tidak ditemukan', action: '<a class="btn" href="#/meetings">Kembali</a>' })}</div>`;
        destroy();
        return;
      }
      paintQrArea();
    } finally {
      fetching = false;
    }
  }

  function frame() {
    const m = state.meeting;
    container.innerHTML = `
      <p style="margin-bottom:12px"><a href="#/meetings/${esc(id)}" class="small">${icon('chevronLeft')} Kembali ke detail pertemuan</a></p>
      <div class="stage">
        <section class="qr-card" id="qr-card" aria-label="QR absensi">
          <div class="row" style="justify-content:center;margin-bottom:6px" id="qr-status"></div>
          <h1 style="font-size:1.55rem">${esc(m.name)}</h1>
          <p class="qr-meta">${esc(fmtDate(m.date))} &middot; ${esc(m.startTime)} - ${esc(m.endTime)} WIB${m.location ? ` &middot; ${esc(m.location)}` : ''}</p>
          <div class="qr-frame" id="qr-frame"></div>
          <div class="qr-timer" id="qr-timer"></div>
          <p class="small muted" style="margin-top:10px" id="qr-hint">QR berganti otomatis setiap 30 detik. Foto lama tidak akan berlaku.</p>
          <div class="page-actions" style="justify-content:center;margin-top:14px">
            <button class="btn btn-sm" id="qr-full">${icon('maximize')} Layar penuh</button>
            <button class="btn btn-sm btn-danger" id="qr-close">Tutup sesi</button>
          </div>
        </section>
        <section class="panel" aria-label="Daftar hadir">
          <div class="panel-head"><div><div class="count-big num" id="att-count">0</div><div class="muted small">anggota sudah tercatat</div></div><a class="btn btn-sm" href="#/meetings/${esc(id)}">Detail & ubah status</a></div>
          <div class="panel-body panel-flush" style="padding-top:12px"><div class="attendee-list" id="att-list" aria-live="polite"></div></div>
        </section>
      </div>`;
    container.querySelector('#qr-full').addEventListener('click', () => {
      const el = container.querySelector('#qr-card');
      if (document.fullscreenElement) document.exitFullscreen();
      else el.requestFullscreen?.().catch(() => toast('Browser ini tidak mendukung layar penuh.', 'error'));
    });
    container.querySelector('#qr-close').addEventListener('click', async () => {
      try {
        if (await closeAttendance(state.meeting)) { state.token = null; await fetchQr(); }
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  function paintStatus() {
    const el = container.querySelector('#qr-status');
    if (!el) return;
    el.innerHTML = state.open
      ? `<span class="stage-status badge badge-open">Absensi dibuka</span>`
      : `<span class="stage-status">${meetingBadge(state.meeting.status)}</span>`;
    container.querySelector('#qr-close')?.classList.toggle('hidden', !state.open);
  }

  function paintQrArea() {
    const frameEl = container.querySelector('#qr-frame');
    const timerEl = container.querySelector('#qr-timer');
    const hint = container.querySelector('#qr-hint');
    if (!frameEl) return;
    if (!state.open) {
      renderedToken = null;
      frameEl.classList.add('expired');
      frameEl.innerHTML = `<div class="qr-overlay" style="position:static;height:100%"><div><p>${state.meeting?.status === 'closed' ? 'Sesi absensi sudah ditutup.' : 'Absensi belum dibuka.'}</p><button class="btn btn-primary" id="qr-reopen" style="margin-top:12px">${state.meeting?.status === 'closed' ? 'Buka kembali absensi' : 'Buka absensi'}</button></div></div>`;
      frameEl.querySelector('#qr-reopen').addEventListener('click', async (e) => {
        try { await withBusy(e.currentTarget, 'Membuka', async () => { await api.post(`/api/meetings/${id}/open`); await fetchQr(); }); } catch (err) { toast(err.message, 'error'); }
      });
      timerEl.innerHTML = '';
      hint.textContent = 'QR tidak berlaku saat sesi tidak dibuka.';
      return;
    }
    hint.textContent = 'QR berganti otomatis setiap 30 detik. Foto lama tidak akan berlaku.';
    const stale = serverNow() > state.expiresAt + 2000;
    if (state.token && state.token !== renderedToken) {
      try {
        frameEl.innerHTML = qrSvg(state.token);
        frameEl.setAttribute('role', 'img');
        frameEl.setAttribute('aria-label', 'Kode QR absensi');
        renderedToken = state.token;
      } catch {
        frameEl.innerHTML = '<div class="qr-overlay">QR tidak dapat dibuat. Muat ulang halaman.</div>';
      }
    }
    frameEl.classList.toggle('expired', stale || state.failing && stale);
    let ov = frameEl.querySelector('.qr-overlay');
    if (stale) {
      if (!ov) { ov = document.createElement('div'); ov.className = 'qr-overlay'; frameEl.appendChild(ov); }
      ov.textContent = state.failing ? 'Koneksi terputus. Menyambung ulang...' : 'Memperbarui QR...';
    } else ov?.remove();
  }

  function paintTimer() {
    const timerEl = container.querySelector('#qr-timer');
    if (!timerEl || !state.open) return;
    const left = Math.max(0, Math.ceil((state.expiresAt - serverNow()) / 1000));
    const frac = Math.max(0, Math.min(1, (state.expiresAt - serverNow()) / 30000));
    timerEl.innerHTML = `<div class="timer-ring"><svg viewBox="0 0 52 52" aria-hidden="true"><circle class="track" cx="26" cy="26" r="${R}" fill="none" stroke-width="5"/><circle class="bar" cx="26" cy="26" r="${R}" fill="none" stroke-width="5" stroke-dasharray="${CIRC}" stroke-dashoffset="${CIRC * (1 - frac)}"/></svg><span>${left}</span></div><span class="muted small">QR berikutnya dalam ${left} detik</span>`;
  }

  function paintList() {
    const list = container.querySelector('#att-list');
    if (!list) return;
    const recs = [...state.records.values()].sort((a, b) => (b.recordedAt > a.recordedAt ? 1 : -1));
    container.querySelector('#att-count').textContent = String(recs.length);
    if (!recs.length) {
      list.innerHTML = `<div class="panel-body">${emptyState({ iconName: 'users', title: 'Belum ada yang absen', text: 'Anggota yang memindai QR akan muncul di sini secara langsung.' })}</div>`;
      return;
    }
    list.innerHTML = recs.map((r) => `<div class="attendee ${state.fresh.has(r.uid) ? 'attendee-new' : ''}"><span class="avatar">${esc(initials(r.memberName))}</span><div class="grow"><strong>${esc(r.memberName)}</strong><div class="small muted">${esc(r.kelas || '')}${r.kelas ? ' &middot; ' : ''}${esc(fmtTime(r.recordedAt))}</div></div>${statusBadge(r.status)}</div>`).join('');
    state.fresh.clear();
  }

  function paint() {
    if (!container.querySelector('#qr-card')) frame();
    paintStatus();
    paintQrArea();
    paintTimer();
    paintList();
  }

  function destroy() {
    destroyed = true;
    clearInterval(pollTimer);
    clearInterval(tickTimer);
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  }

  await fetchQr();
  if (isStale()) { destroy(); return; }
  if (!state.meeting) { destroy(); return; }

  // Pembaruan token tepat saat berganti jendela + pemeriksaan daftar hadir berkala.
  tickTimer = setInterval(() => {
    if (!state.open) return;
    paintTimer();
    paintQrArea();
    if (serverNow() >= state.expiresAt - 500) fetchQr();
  }, 500);
  pollTimer = setInterval(() => { if (!document.hidden) fetchQr(); }, QR_POLL_MS);
  const onVisible = () => { if (!document.hidden) fetchQr(); };
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    destroy();
    document.removeEventListener('visibilitychange', onVisible);
  };
}
