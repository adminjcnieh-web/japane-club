import { HttpError } from '../lib/http.js';
import { username as vUsername, str } from '../lib/validate.js';
import * as v from '../lib/validate.js';
import { signInWithPassword, refreshIdToken, updateAuthUser } from '../lib/google.js';
import { rateLimit } from '../lib/ratelimit.js';
import { userOut } from '../lib/models.js';
import { op } from '../lib/firestore.js';
import { auditOp } from '../lib/audit.js';

function clientIp(request) {
  return request.headers.get('cf-connecting-ip') || 'local';
}

async function loadActiveUser(ctx, uid) {
  const user = await ctx.fs.get(`users/${uid}`);
  if (!user) throw new HttpError(403, 'Akun belum terdaftar di sistem Japanese Club', 'no_profile');
  if (!user.active) throw new HttpError(403, 'Akun ini dinonaktifkan. Hubungi admin Japanese Club.', 'disabled');
  return user;
}

export async function login(ctx) {
  rateLimit(`login-ip:${clientIp(ctx.request)}`, 20, 5 * 60000);
  const body = await ctx.json();
  const username = vUsername(body.username);
  if (typeof body.password !== 'string' || body.password.length < 1 || body.password.length > 100) {
    throw new HttpError(400, 'Password wajib diisi', 'validation');
  }
  rateLimit(`login-user:${username}`, 8, 5 * 60000);

  const session = await signInWithPassword(ctx.env, username, body.password);
  const user = await loadActiveUser(ctx, session.uid);
  return { idToken: session.idToken, refreshToken: session.refreshToken, expiresIn: session.expiresIn, user: userOut(user) };
}

export async function refresh(ctx) {
  rateLimit(`refresh-ip:${clientIp(ctx.request)}`, 60, 5 * 60000);
  const body = await ctx.json();
  const token = str(body.refreshToken, { name: 'Refresh token', min: 10, max: 2000 });
  const session = await refreshIdToken(ctx.env, token);
  await loadActiveUser(ctx, session.uid); // akun yang dinonaktifkan tidak bisa memperbarui sesi
  return { idToken: session.idToken, refreshToken: session.refreshToken, expiresIn: session.expiresIn };
}

export async function me(ctx) {
  return { user: userOut({ id: ctx.auth.uid, ...ctx.auth.user }) };
}

export async function changePassword(ctx) {
  const body = await ctx.json();
  const current = typeof body.currentPassword === 'string' ? body.currentPassword : '';
  const next = v.password(body.newPassword, 'Password baru');
  if (!current) throw new HttpError(400, 'Password saat ini wajib diisi', 'validation');
  if (current === next) throw new HttpError(400, 'Password baru harus berbeda dari password lama', 'validation');
  rateLimit(`pw:${ctx.auth.uid}`, 5, 10 * 60000);

  // Verifikasi password lama dulu (mencegah pengambilalihan lewat sesi yang tertinggal).
  await signInWithPassword(ctx.env, ctx.auth.user.usernameLower, current);
  await updateAuthUser(ctx.env, ctx.auth.uid, { password: next });
  await ctx.fs.commit([
    auditOp({ action: 'password.change', actor: ctx.auth, targetUid: ctx.auth.uid, targetName: ctx.auth.user.fullName }, ctx.now),
  ]);
  return { ok: true, message: 'Password berhasil diganti. Silakan login ulang.' };
}
