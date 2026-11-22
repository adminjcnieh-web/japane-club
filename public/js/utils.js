// Fungsi bantu umum.
import { CLUB_TZ } from './config.js';

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const STATUS_KEYS = ['hadir', 'terlambat', 'izin', 'sakit', 'alfa'];
export const STATUS_LABEL = { hadir: 'Hadir', terlambat: 'Terlambat', izin: 'Izin', sakit: 'Sakit', alfa: 'Alfa' };
export const STATUS_COLOR = { hadir: '#46745a', terlambat: '#c08a2b', izin: '#4a6e8d', sakit: '#8a79b3', alfa: '#b3262e' };
export const ROLE_LABEL = { admin: 'Admin', officer: 'Pengurus', member: 'Anggota' };
export const MEETING_STATUS_LABEL = { scheduled: 'Terjadwal', open: 'Absensi dibuka', closed: 'Selesai' };

const dateOnly = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const dateShort = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const monthName = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthShort = new Intl.DateTimeFormat('id-ID', { month: 'short', timeZone: 'UTC' });
const timeFmt = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: CLUB_TZ });
const dateTimeFmt = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: CLUB_TZ });

const asUtc = (ymd) => new Date(`${ymd}T00:00:00Z`);
export const fmtDate = (ymd) => (ymd ? dateOnly.format(asUtc(ymd)) : '-');
export const fmtDateShort = (ymd) => (ymd ? dateShort.format(asUtc(ymd)) : '-');
export const fmtMonth = (ymd) => monthName.format(asUtc(ymd.length === 7 ? ymd + '-01' : ymd));
export const fmtMonthShort = (ym) => monthShort.format(asUtc(ym + '-01'));
export const fmtTime = (iso) => (iso ? timeFmt.format(new Date(iso)).replace('.', ':') : '-');
export const fmtDateTime = (iso) => (iso ? dateTimeFmt.format(new Date(iso)).replace(/\./g, ':') : '-');
export const dayNum = (ymd) => Number(ymd.slice(8, 10));

/** Tanggal hari ini (YYYY-MM-DD) menurut zona waktu klub. */
export function todayStr() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: CLUB_TZ }).format(new Date());
}

export function addDays(ymd, n) {
  const d = asUtc(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const initials = (name) =>
  String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '?';

export function debounce(fn, ms = 250) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

const loaded = new Map();
/** Memuat skrip pihak ketiga sekali saja. */
export function loadScript(src) {
  if (loaded.has(src)) return loaded.get(src);
  const p = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = resolve;
    s.onerror = () => {
      loaded.delete(src);
      reject(new Error('Gagal memuat pustaka. Periksa koneksi internet lalu coba lagi.'));
    };
    document.head.appendChild(s);
  });
  loaded.set(src, p);
  return p;
}

// Aplikasi (APK) menambahkan "JapaneseClubApp/" ke User-Agent WebView.
export function isApp() {
  return /JapaneseClubApp\//.test(navigator.userAgent || '');
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(new Error('Gagal membaca file.'));
    r.readAsDataURL(blob);
  });
}

/** Mengunduh file. Di aplikasi (WebView) tautan unduhan biasa tidak jalan, jadi file disimpan lalu dibuka lewat menu Bagikan/Simpan Android. */
export async function downloadBlob(blob, filename) {
  const cap = window.Capacitor;
  if (isApp() && cap && typeof cap.nativePromise === 'function') {
    const data = await blobToBase64(blob);
    const saved = await cap.nativePromise('Filesystem', 'writeFile', { path: filename, data, directory: 'CACHE', recursive: true });
    try {
      await cap.nativePromise('Share', 'share', { title: filename, text: filename, url: saved.uri, dialogTitle: 'Simpan atau kirim laporan' });
    } catch (e) {
      if (!/cancel/i.test(String(e?.message || e))) throw e; // menutup menu Bagikan bukan kesalahan
    }
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'radio') {
      if (el.checked) out[el.name] = el.value;
    } else out[el.name] = el.value;
  }
  return out;
}

export function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'baru saja';
  if (s < 3600) return `${Math.floor(s / 60)} menit lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} hari lalu`;
  return fmtDateTime(iso);
}

export const pct = (n) => `${String(n).replace('.', ',')}%`;
