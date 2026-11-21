// Token QR dinamis (stateless, HMAC-SHA256).
//
// Format: JC1.<meetingId>.<jendelaWaktu>.<tandaTangan>
//  - jendelaWaktu = floor(detik / 30)  -> token berganti tiap 30 detik
//  - tandaTangan  = HMAC(QR_SECRET, "<meetingId>.<jendelaWaktu>")
//  - Token diterima jika berada di jendela sekarang atau 1 jendela sebelumnya
//    (toleransi keterlambatan pemindaian), jadi umur maksimal ~60 detik.
//
// Rahasia QR_SECRET hanya ada di server, sehingga browser tidak bisa memalsukan token.
import { HttpError } from './http.js';

export const WINDOW_SECONDS = 5;
const GRACE_WINDOWS = 1;
const enc = new TextEncoder();

function toB64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sign(secret, message) {
  if (!secret || secret.length < 16) throw new HttpError(500, 'Konfigurasi server belum lengkap (QR_SECRET)', 'misconfigured');
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return toB64url(new Uint8Array(sig)).slice(0, 27);
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function makeToken(secret, meetingId, nowMs) {
  const w = Math.floor(nowMs / 1000 / WINDOW_SECONDS);
  const sig = await sign(secret, `${meetingId}.${w}`);
  return { token: `JC1.${meetingId}.${w}.${sig}`, expiresAt: (w + 1) * WINDOW_SECONDS * 1000 };
}

/** Mengembalikan { meetingId } atau melempar HttpError (400 = tidak valid, 410 = kedaluwarsa). */
export async function verifyToken(secret, token, nowMs) {
  const parts = String(token).split('.');
  if (parts.length !== 4 || parts[0] !== 'JC1' || !/^[A-Za-z0-9]{8,40}$/.test(parts[1]) || !/^\d{1,10}$/.test(parts[2])) {
    throw new HttpError(400, 'QR tidak dikenali. Pastikan memindai QR absensi Japanese Club.', 'qr_invalid');
  }
  const [, meetingId, windowStr, sig] = parts;
  const expected = await sign(secret, `${meetingId}.${windowStr}`);
  if (!safeEqual(expected, sig)) {
    throw new HttpError(400, 'QR tidak valid.', 'qr_invalid');
  }
  const current = Math.floor(nowMs / 1000 / WINDOW_SECONDS);
  const w = Number(windowStr);
  if (w > current + 1 || current - w > GRACE_WINDOWS) {
    throw new HttpError(410, 'QR sudah kedaluwarsa. Pindai QR terbaru yang tampil di layar.', 'qr_expired');
  }
  return { meetingId };
}
