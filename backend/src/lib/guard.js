// Autentikasi (ID Token) dan otorisasi (role + izin). Semua dicek di server.
import { HttpError } from './http.js';
import { verifyIdToken } from './google.js';
import { rateLimit } from './ratelimit.js';

export async function authenticate(ctx) {
  const header = ctx.request.headers.get('authorization') || '';
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) throw new HttpError(401, 'Silakan login terlebih dahulu', 'unauthenticated');

  let payload;
  try {
    payload = await verifyIdToken(ctx.env, match[1]);
  } catch {
    throw new HttpError(401, 'Sesi login tidak valid atau sudah habis. Silakan login lagi.', 'token_invalid');
  }
  rateLimit(`api:${payload.sub}`, 300, 60000);

  // Peran dan status akun SELALU dibaca dari database, bukan dari token/browser.
  const user = await ctx.fs.get(`users/${payload.sub}`);
  if (!user) throw new HttpError(403, 'Akun belum terdaftar di sistem Japanese Club', 'no_profile');
  if (!user.active) throw new HttpError(403, 'Akun ini dinonaktifkan. Hubungi admin Japanese Club.', 'disabled');
  return { uid: payload.sub, user };
}

export const isStaff = (user) => user.role === 'admin' || user.role === 'officer';

export function requireRole(ctx, ...roles) {
  if (!roles.includes(ctx.auth.user.role)) {
    throw new HttpError(403, 'Kamu tidak punya izin untuk tindakan ini', 'forbidden');
  }
}

/** Admin otomatis punya semua izin; officer harus diberi izin khusus oleh admin. */
export function hasPermission(user, permission) {
  if (user.role === 'admin') return true;
  return user.role === 'officer' && user.permissions?.[permission] === true;
}

export function requirePermission(ctx, permission) {
  if (!hasPermission(ctx.auth.user, permission)) {
    throw new HttpError(403, 'Kamu belum diberi izin untuk tindakan ini oleh admin', 'forbidden');
  }
}
