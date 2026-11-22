// Pemindai QR untuk anggota: kamera perangkat, izin kamera, dan hasil absensi.
import * as api from './api.js';
import { icon } from './icons.js';
import { esc, loadScript, STATUS_LABEL, isApp } from './utils.js';
import { LIBS } from './config.js';
import { pageHead, statusBadge } from './ui.js';

const ERRORS_BY_CODE = {
  qr_expired: { title: 'QR sudah kedaluwarsa', text: 'QR berganti tiap 5 detik, jadi pindai QR yang sedang tampil dan jangan pakai foto lama. Arahkan kamera ke layar pengurus.' },
  qr_invalid: { title: 'QR tidak valid', text: 'Pastikan kamu memindai QR absensi Japanese Club dari layar pengurus, bukan foto atau QR lain.' },
  session_closed: { title: 'Sesi absensi sudah ditutup', text: 'Absensi untuk pertemuan ini sudah selesai. Hubungi pengurus bila kamu hadir.' },
  session_not_open: { title: 'Absensi belum dibuka', text: 'Tunggu pengurus membuka sesi absensi, lalu pindai lagi.' },
  rate_limited: { title: 'Terlalu banyak percobaan', text: 'Tunggu sebentar lalu coba lagi.' },
  not_tracked: { title: 'Akunmu tidak ikut absensi', text: 'Akun ini tidak termasuk daftar peserta absensi. Hubungi admin bila ini keliru.' },
  not_found: { title: 'Pertemuan tidak ditemukan', text: 'Pertemuan ini sudah dihapus atau QR-nya tidak berlaku. Hubungi pengurus.' },
  app_required: { title: 'Gunakan aplikasi Japanese Club', text: 'Absensi hanya bisa dilakukan lewat aplikasi Japanese Club (APK), bukan lewat browser.' },
  network: { title: 'Tidak ada koneksi', text: 'Periksa internetmu lalu pindai lagi.' },
};

// Deteksi WebView (APK hasil konversi, atau browser di dalam aplikasi lain).
export function inAppWebView() {
  const ua = navigator.userAgent || '';
  if (/; wv\)/.test(ua) || /\bwv\b/.test(ua)) return true; // Android WebView
  if (/(iPhone|iPad|iPod)/.test(ua) && !/Safari\//.test(ua)) return true; // WKWebView
  if (/(FBAN|FBAV|Instagram|Line\/|MicroMessenger|GSA\/)/.test(ua)) return true;
  return false;
}

function cameraProblem(e) {
  if (inAppWebView() && (e?.name === 'NotAllowedError' || e?.name === 'SecurityError' || !navigator.mediaDevices?.getUserMedia)) {
    return { title: 'Aplikasi belum diberi izin kamera', text: 'Kamu membuka lewat aplikasi. Buka Pengaturan HP > Aplikasi > Japanese Club > Izin > Kamera > Izinkan, lalu buka aplikasi lagi.' };
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return { title: 'Kamera tidak bisa dipakai di sini', text: 'Browser ini tidak mendukung kamera, atau halaman tidak dibuka lewat HTTPS. Buka website lewat alamat https:// di Chrome atau Safari.' };
  }
  switch (e?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return { title: 'Izin kamera ditolak', text: 'Buka pengaturan situs di browser (ikon gembok di kolom alamat), ubah izin Kamera menjadi Izinkan, lalu muat ulang halaman. Di iPhone: Pengaturan > Safari > Kamera.' };
    case 'NotFoundError':
    case 'OverconstrainedError':
      return { title: 'Kamera tidak ditemukan', text: 'Perangkat ini tidak memiliki kamera yang bisa dipakai.' };
    case 'NotReadableError':
    case 'AbortError':
      return { title: 'Kamera sedang dipakai aplikasi lain', text: 'Tutup aplikasi lain yang memakai kamera, lalu coba lagi.' };
    default:
      return { title: 'Kamera tidak bisa dibuka', text: 'Coba muat ulang halaman. Jika masih gagal, mulai ulang browsermu.' };
  }
}

export async function scannerView({ container, isStale }) {
  let stream = null, raf = 0, active = false, busy = false, lastScan = 0, detector = null, destroyed = false;
  const canvas = document.createElement('canvas');
  const ctx2d = canvas.getContext('2d', { willReadFrequently: true });

  container.innerHTML = pageHead({ title: 'Scan absensi', subtitle: 'Pindai QR yang tampil di layar pengurus untuk mencatat kehadiranmu.' }) + `
    <div class="scanner"><div class="panel"><div class="panel-body" id="sc-body"></div></div></div>`;
  const body = container.querySelector('#sc-body');

  if (!isApp()) {
    body.innerHTML = `<div class="alert alert-warn" role="alert">${icon('alert')}<div><strong>Absensi hanya lewat aplikasi</strong><p style="margin-top:4px">Untuk mencegah titip absen dengan foto QR, scan absensi hanya bisa dilakukan dari aplikasi Japanese Club (APK). Buka aplikasinya di HP, lalu masuk ke menu Scan absensi.</p></div></div>`;
    return () => {};
  }

  function stop() {
    active = false;
    cancelAnimationFrame(raf);
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
  }

  function showIdle(note = '') {
    stop();
    body.innerHTML = `
      ${note}
      <ol class="steps" style="margin-bottom:18px">
        <li>Minta pengurus menampilkan QR absensi.</li>
        <li>Tekan <strong>Mulai kamera</strong> dan izinkan akses kamera.</li>
        <li>Arahkan kamera ke QR sampai muncul tanda berhasil.</li>
      </ol>
      <button class="btn btn-primary btn-block" id="sc-start" style="min-height:50px">${icon('camera')} Mulai kamera</button>
      ${fallbackButtons()}`;
    body.querySelector('#sc-start').addEventListener('click', start);
    wireFallbacks();
  }

  function fallbackButtons() {
    return `<div class="sc-alt"><div class="row" style="margin-top:10px;justify-content:center">
      <button class="btn btn-quiet btn-sm" id="sc-check" type="button">Cek kamera</button>
    </div></div>`;
  }

  function wireFallbacks() {
    body.querySelector('#sc-check')?.addEventListener('click', checkCamera);
  }

  async function checkCamera() {
    const lines = [];
    lines.push(['Halaman aman (HTTPS)', window.isSecureContext]);
    lines.push(['Browser mendukung kamera', !!navigator.mediaDevices?.getUserMedia]);
    let perm = 'tidak diketahui';
    try { perm = (await navigator.permissions.query({ name: 'camera' })).state; } catch { /* tidak semua browser */ }
    lines.push([`Izin kamera: ${perm === 'granted' ? 'diizinkan' : perm === 'denied' ? 'ditolak' : perm === 'prompt' ? 'akan ditanya' : perm}`, perm !== 'denied']);
    let devices = 0;
    try { devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput').length; } catch { /* abaikan */ }
    lines.push([`Kamera terdeteksi: ${devices}`, devices > 0 || perm === 'prompt']);
    lines.push(['Dibuka lewat aplikasi (WebView)', null]);
    lines[lines.length - 1][1] = !inAppWebView() ? true : 'info';
    showIdle(`<div class="panel-soft" style="margin-bottom:14px"><strong>Hasil cek kamera</strong><ul class="plain-list">${lines.map(([t, ok]) => `<li>${ok === true ? 'OK' : ok === 'info' ? 'Ya' : 'Perlu dicek'} &middot; ${esc(t)}</li>`).join('')}</ul></div>`);
  }

  function showProblem(p, { retry = true } = {}) {
    stop();
    body.innerHTML = `<div class="alert alert-warn" role="alert">${icon('alert')}<div><strong>${esc(p.title)}</strong><p style="margin-top:4px">${esc(p.text)}</p></div></div>${retry ? `<button class="btn btn-block" id="sc-retry" style="margin-top:14px">${icon('refresh')} Coba lagi</button>${fallbackButtons()}` : ''}`;
    body.querySelector('#sc-retry')?.addEventListener('click', start);
    if (retry) wireFallbacks();
  }

  function showResult(kind, title, text, status) {
    stop();
    body.innerHTML = `<div class="scan-result ${kind}"><div class="big-icon">${icon(kind === 'fail' ? 'x' : 'check')}</div><h2>${esc(title)}</h2>${status ? `<p style="margin:8px 0">${statusBadge(status)}</p>` : ''}<p class="muted" style="max-width:38ch;margin:6px auto 0">${esc(text)}</p></div>
      <div class="row" style="margin-top:12px;justify-content:center">${kind === 'fail' ? '<button class="btn btn-primary" id="sc-again">Pindai lagi</button>' : ''}<a class="btn" href="#/">Ke beranda</a></div>`;
    body.querySelector('#sc-again')?.addEventListener('click', start);
  }

  async function submit(token) {
    busy = true;
    body.querySelector('.vf-msg')?.classList.remove('hidden');
    const msg = body.querySelector('.vf-msg');
    if (msg) msg.innerHTML = '<span class="spinner"></span><span>Mencatat absensi...</span>';
    try {
      const r = await api.post('/api/attendance/scan', { token });
      if (destroyed) return;
      if (r.duplicate) showResult('ok', 'Kamu sudah tercatat', `${r.meetingName}. Tidak perlu absen lagi.`, r.status);
      else showResult(r.status === 'terlambat' ? 'late' : 'ok', r.status === 'terlambat' ? 'Tercatat terlambat' : 'Absensi berhasil', r.meetingName, r.status);
    } catch (e) {
      if (destroyed) return;
      if (e.status === 401 || e.code === 'disabled') return; // klien API sudah mengarahkan ke login
      const known = ERRORS_BY_CODE[e.code] || (e.status === 0 ? ERRORS_BY_CODE.network : null);
      showResult('fail', known?.title || 'Absensi gagal', known?.text || e.message);
    } finally {
      busy = false;
    }
  }

  function flash(text) {
    const msg = body.querySelector('.vf-msg');
    if (!msg) return;
    msg.classList.remove('hidden');
    msg.style.background = 'rgba(28,26,23,.72)';
    msg.textContent = text;
    setTimeout(() => { if (!busy && msg) { msg.classList.add('hidden'); msg.textContent = ''; } }, 1800);
  }

  async function decode(video) {
    if (detector) {
      try {
        const found = await detector.detect(video);
        return found[0]?.rawValue || null;
      } catch { /* jatuh ke jsQR */ }
    }
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return null;
    const scale = Math.min(1, 640 / Math.max(vw, vh));
    canvas.width = Math.round(vw * scale);
    canvas.height = Math.round(vh * scale);
    ctx2d.drawImage(video, 0, 0, canvas.width, canvas.height);
    const img = ctx2d.getImageData(0, 0, canvas.width, canvas.height);
    const hit = window.jsQR?.(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
    return hit?.data || null;
  }

  function loop(video) {
    if (!active || destroyed) return;
    raf = requestAnimationFrame(async () => {
      if (!active) return;
      const now = performance.now();
      if (!busy && now - lastScan > 120 && video.readyState >= 2) {
        lastScan = now;
        const text = await decode(video);
        if (text && active && !busy) {
          if (/^JC1\.[A-Za-z0-9]+\.\d+\.[A-Za-z0-9_-]+$/.test(text)) {
            if (navigator.vibrate) navigator.vibrate(60);
            active = false;
            submit(text);
            return;
          }
          lastScan = now + 1200;
          flash('Ini bukan QR absensi Japanese Club.');
        }
      }
      loop(video);
    });
  }

  async function start() {
    body.innerHTML = `<div class="viewfinder"><video playsinline muted autoplay></video><div class="guide" aria-hidden="true"><i></i><i></i><i></i><i></i></div><div class="vf-msg"><span class="spinner"></span><span>Membuka kamera...</span></div></div>
      <p class="muted small" style="text-align:center;margin-top:12px">Arahkan kamera ke QR di layar pengurus. Jaga jarak sekitar 20-30 cm.</p>
      <button class="btn btn-block" id="sc-cancel" style="margin-top:12px">Batal</button>`;
    body.querySelector('#sc-cancel').addEventListener('click', () => showIdle());
    const video = body.querySelector('video');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('no-media'), { name: 'NoMedia' });
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false });
      if (destroyed || isStale()) { stop(); return; }
      video.srcObject = stream;
      await video.play().catch(() => {});
      if ('BarcodeDetector' in window) {
        try { detector = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch { detector = null; }
      }
      if (!detector) await loadScript(LIBS.jsqr);
      if (destroyed) return;
      body.querySelector('.vf-msg')?.classList.add('hidden');
      active = true;
      loop(video);
    } catch (e) {
      if (destroyed) return;
      if (e.message && /memuat pustaka/i.test(e.message)) showProblem({ title: 'Pemindai tidak bisa dimuat', text: e.message });
      else showProblem(cameraProblem(e));
    }
  }

  showIdle();
  const onVis = () => { if (document.hidden && active) showIdle(); };
  document.addEventListener('visibilitychange', onVis);
  return () => {
    destroyed = true;
    stop();
    document.removeEventListener('visibilitychange', onVis);
  };
}
