// Kotak tanda tangan di layar. WAJIB diisi setelah scan absensi: tidak bisa ditutup tanpa menyimpan.
import * as api from './api.js';
import { openModal } from './ui.js';
import { esc, fmtDateShort } from './utils.js';

const OUT_W = 360;
const OUT_H = 140;
const MAX_BYTES = 38000;

/** Memotong area berisi tinta, mengecilkan agar muat, lalu menghasilkan PNG (latar putih, tinta hitam). */
function exportPng(src) {
  const ctx = src.getContext('2d');
  const { width: W, height: H } = src;
  const data = ctx.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1, ink = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * 4 + 3] > 40) { ink++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  if (ink < 120 || x1 - x0 < 12) return null; // hanya titik / coretan terlalu kecil
  const pad = 8;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
  const sw = x1 - x0 + 1, sh = y1 - y0 + 1;
  for (const scaleMax of [1, 0.8, 0.6]) {
    const k = Math.min(OUT_W / sw, OUT_H / sh) * scaleMax;
    const out = document.createElement('canvas');
    out.width = Math.max(40, Math.round(sw * k));
    out.height = Math.max(20, Math.round(sh * k));
    const o = out.getContext('2d');
    o.fillStyle = '#fff';
    o.fillRect(0, 0, out.width, out.height);
    o.imageSmoothingQuality = 'high';
    o.drawImage(src, x0, y0, sw, sh, 0, 0, out.width, out.height);
    const url = out.toDataURL('image/png');
    const b64 = url.split(',')[1] || '';
    if (b64.length * 0.75 <= MAX_BYTES) return b64;
  }
  return null;
}

/** Membuka kotak tanda tangan. Selesai (true) hanya setelah tanda tangan tersimpan di server. */
const openPads = new Map();
export function requireSignature(info) {
  // satu kotak per pertemuan: scan dan pengecekan tertunda tidak boleh membuka dua kotak sekaligus
  if (openPads.has(info.meetingId)) return openPads.get(info.meetingId);
  const p = openPad(info).finally(() => openPads.delete(info.meetingId));
  openPads.set(info.meetingId, p);
  return p;
}

function openPad({ meetingId, meetingName, meetingDate }) {
  return new Promise((resolve) => {
    const m = openModal({
      title: 'Tanda tangan kehadiran',
      dismissible: false,
      html: `
        <p class="muted small" style="margin-bottom:10px">Absensimu sudah tercatat. Tanda tangani di kotak ini dengan jari.<br><strong>${esc(meetingName)}</strong>${meetingDate ? `, ${esc(fmtDateShort(meetingDate))}` : ''}</p>
        <div class="sig-box"><canvas id="sig-canvas" aria-label="Area tanda tangan"></canvas><span class="sig-hint" id="sig-hint">Tanda tangan di sini</span></div>`,
      footer: [
        { label: 'Hapus', close: false, onClick: () => { clear(); return false; } },
        { label: 'Simpan tanda tangan', kind: 'primary', close: false, onClick: () => { save(); return false; } },
      ],
    });
    const canvas = m.body.querySelector('#sig-canvas');
    const hint = m.body.querySelector('#sig-hint');
    const clearBtn = m.buttons[0];
    const saveBtn = m.buttons[1];
    saveBtn.disabled = true;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let drawing = false, last = null, dirty = false;

    function size() {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(2.5, 3 * dpr);
      ctx.strokeStyle = '#111';
    }
    requestAnimationFrame(size);

    function pos(e) {
      const r = canvas.getBoundingClientRect();
      return { x: ((e.clientX - r.left) * canvas.width) / r.width, y: ((e.clientY - r.top) * canvas.height) / r.height };
    }
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      canvas.setPointerCapture?.(e.pointerId);
      drawing = true;
      last = pos(e);
      ctx.beginPath();
      ctx.arc(last.x, last.y, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fillStyle = '#111';
      ctx.fill();
      dirty = true;
      hint.hidden = true;
      saveBtn.disabled = false;
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drawing) return;
      e.preventDefault();
      const p = pos(e);
      const mid = { x: (last.x + p.x) / 2, y: (last.y + p.y) / 2 };
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.quadraticCurveTo(last.x, last.y, mid.x, mid.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last = p;
    });
    const end = () => { drawing = false; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', end);

    function clear() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      dirty = false;
      hint.hidden = false;
      saveBtn.disabled = true;
      m.clearError();
    }

    async function save() {
      m.clearError();
      if (!dirty) return;
      const b64 = exportPng(canvas);
      if (!b64) { m.showError('Tanda tangan terlalu kecil atau kurang jelas. Hapus lalu tanda tangani lagi dengan goresan yang lebih besar.'); return; }
      m.setBusy(saveBtn, true, 'Menyimpan');
      clearBtn.disabled = true;
      try {
        try {
          await api.put(`/api/meetings/${encodeURIComponent(meetingId)}/signature`, { image: b64 });
        } catch (e) {
          if (e.code !== 'already_signed') throw e;
        }
        m.close(true);
        resolve(true);
      } catch (e) {
        m.setBusy(saveBtn, false);
        clearBtn.disabled = false;
        m.showError(e.status === 0 ? 'Tidak ada koneksi. Periksa internetmu lalu coba lagi.' : e.message || 'Gagal menyimpan. Coba lagi.');
      }
    }
  });
}

let checking = false;
/** Dipanggil saat aplikasi dibuka: bila ada absensi yang belum ditandatangani, kotak tanda tangan muncul. */
export async function checkPendingSignatures() {
  if (checking) return;
  checking = true;
  try {
    const r = await api.get('/api/signatures/pending');
    for (const p of r.pending || []) await requireSignature(p);
  } catch { /* diam: dicoba lagi saat aplikasi dibuka berikutnya */ }
  finally { checking = false; }
}
