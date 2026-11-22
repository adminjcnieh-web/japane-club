// Foto profil. Gambar kecil (JPEG hasil crop di browser) disimpan di koleksi terpisah "avatars/{uid}",
// BUKAN di dokumen users, dan BUKAN di Firebase Storage (butuh paket berbayar).
//   full  : 256x256, maksimal 60 KB   (halaman profil)
//   thumb : 64x64,   maksimal 8 KB    (daftar, sidebar)
// Server memeriksa ulang: base64 valid, tanda JPEG, ukuran file, dan dimensi.
import { HttpError, readJson } from '../lib/http.js';
import { op } from '../lib/firestore.js';
import { auditOp } from '../lib/audit.js';
import { requireRole } from '../lib/guard.js';
import { userOut } from '../lib/models.js';

const FULL_MAX = 60000;
const THUMB_MAX = 8000;
const FULL_DIM = 384;
const THUMB_DIM = 128;
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;

function decodeB64(s, name) {
  if (typeof s !== 'string' || !s || !B64.test(s)) throw new HttpError(400, `${name} bukan data gambar yang valid`, 'avatar_invalid');
  try {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    throw new HttpError(400, `${name} bukan data gambar yang valid`, 'avatar_invalid');
  }
}

/** Mengembalikan {w,h} dari header JPEG, atau null bila bukan JPEG yang utuh. */
export function jpegSize(b) {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return null;
  if (b[b.length - 2] !== 0xff || b[b.length - 1] !== 0xd9) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    if (marker === 0xff) { i++; continue; }
    const len = (b[i + 2] << 8) | b[i + 3];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
    }
    if (len < 2) return null;
    i += 2 + len;
  }
  return null;
}

function checkImage(b64, name, maxBytes, maxDim) {
  const bytes = decodeB64(b64, name);
  if (bytes.length > maxBytes) throw new HttpError(413, `${name} terlalu besar (maksimal ${Math.round(maxBytes / 1000)} KB setelah dikompres)`, 'avatar_too_large');
  const size = jpegSize(bytes);
  if (!size) throw new HttpError(400, `${name} harus berupa gambar JPEG yang utuh`, 'avatar_type');
  if (!size.w || !size.h || size.w > maxDim || size.h > maxDim) throw new HttpError(400, `${name} berukuran terlalu besar (maksimal ${maxDim}px)`, 'avatar_dims');
  return bytes.length;
}

/** Simpan/ganti foto milik sendiri. uid SELALU dari token. */
export async function putMine(ctx) {
  const body = await readJson(ctx.request, 100000);
  const fullBytes = checkImage(body.image, 'Foto', FULL_MAX, FULL_DIM);
  checkImage(body.thumb, 'Foto kecil', THUMB_MAX, THUMB_DIM);
  const uid = ctx.auth.uid;
  const ver = ctx.now.getTime();
  await ctx.fs.commit([
    op.set(`avatars/${uid}`, { image: body.image, thumb: body.thumb, bytes: fullBytes, updatedAt: ctx.now }),
    op.update(`users/${uid}`, { avatarVer: ver, updatedAt: ctx.now }),
    auditOp({ action: 'avatar.update', actor: ctx.auth, targetUid: uid, targetName: ctx.auth.user.fullName }, ctx.now),
  ]);
  return { user: userOut({ id: uid, ...ctx.auth.user, avatarVer: ver }) };
}

export async function deleteMine(ctx) {
  const uid = ctx.auth.uid;
  await ctx.fs.commit([
    op.delete(`avatars/${uid}`),
    op.update(`users/${uid}`, { avatarVer: null, updatedAt: ctx.now }),
    auditOp({ action: 'avatar.delete', actor: ctx.auth, targetUid: uid, targetName: ctx.auth.user.fullName }, ctx.now),
  ]);
  return { user: userOut({ id: uid, ...ctx.auth.user, avatarVer: null }) };
}

/** Admin menghapus foto anggota lain (moderasi). */
export async function deleteOf(ctx) {
  requireRole(ctx, 'admin');
  const { uid } = ctx.params;
  const target = await ctx.fs.get(`users/${uid}`);
  if (!target) throw new HttpError(404, 'Anggota tidak ditemukan', 'not_found');
  await ctx.fs.commit([
    op.delete(`avatars/${uid}`),
    op.update(`users/${uid}`, { avatarVer: null, updatedAt: ctx.now }),
    auditOp({ action: 'avatar.delete', actor: ctx.auth, targetUid: uid, targetName: target.fullName, detail: 'oleh admin' }, ctx.now),
  ]);
  return { ok: true };
}

/** Mengirim gambar. Boleh dilihat semua pengguna yang login. Di-cache lama di browser (URL memakai ?v=). */
export async function get(ctx) {
  const { uid } = ctx.params;
  if (!/^[A-Za-z0-9]{6,40}$/.test(uid)) throw new HttpError(404, 'Foto tidak ditemukan', 'not_found');
  const doc = await ctx.fs.get(`avatars/${uid}`);
  if (!doc) throw new HttpError(404, 'Foto tidak ditemukan', 'not_found');
  const useThumb = ctx.url.searchParams.get('size') === 'thumb';
  const bytes = decodeB64(useThumb ? doc.thumb : doc.image, 'Foto');
  return new Response(bytes, {
    status: 200,
    headers: {
      'content-type': 'image/jpeg',
      'cache-control': 'private, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
    },
  });
}
