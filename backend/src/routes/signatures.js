// Tanda tangan kehadiran. Setelah scan QR, anggota WAJIB menandatangani di layar.
// Gambar kecil (PNG hasil kanvas, maksimal ~40 KB) disimpan di koleksi terpisah "signatures/{meetingId}_{uid}",
// bukan di dokumen absensi. Satu tanda tangan per anggota per pertemuan, tidak bisa ditimpa.
import { HttpError, readJson } from '../lib/http.js';
import * as v from '../lib/validate.js';
import { op, FirestoreError } from '../lib/firestore.js';
import { auditOp } from '../lib/audit.js';
import { requirePermission } from '../lib/guard.js';
import { addDays, localDate, tzOffset } from '../lib/time.js';

const MAX_BYTES = 40000;
const MAX_W = 700;
const MAX_H = 350;
const MAX_MEETINGS = 40;
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_END = [0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];

/** Memeriksa PNG: tanda file, ukuran dimensi pada IHDR, dan penutup IEND. Mengembalikan jumlah byte. */
export function checkPng(b64) {
  if (typeof b64 !== 'string' || !b64 || !B64.test(b64)) throw new HttpError(400, 'Tanda tangan bukan gambar yang valid', 'signature_invalid');
  let bytes;
  try {
    const bin = atob(b64);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } catch {
    throw new HttpError(400, 'Tanda tangan bukan gambar yang valid', 'signature_invalid');
  }
  if (bytes.length > MAX_BYTES) throw new HttpError(413, `Tanda tangan terlalu besar (maksimal ${MAX_BYTES / 1000} KB)`, 'signature_too_large');
  if (bytes.length < 80 || PNG_MAGIC.some((x, i) => bytes[i] !== x) || bytes[12] !== 0x49 || bytes[13] !== 0x48 || bytes[14] !== 0x44 || bytes[15] !== 0x52) {
    throw new HttpError(400, 'Tanda tangan harus berupa gambar PNG yang utuh', 'signature_type');
  }
  if (PNG_END.some((x, i) => bytes[bytes.length - 8 + i] !== x)) throw new HttpError(400, 'Tanda tangan harus berupa gambar PNG yang utuh', 'signature_type');
  const w = ((bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19]) >>> 0;
  const h = ((bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23]) >>> 0;
  if (!w || !h || w > MAX_W || h > MAX_H) throw new HttpError(400, `Ukuran tanda tangan terlalu besar (maksimal ${MAX_W}x${MAX_H}px)`, 'signature_dims');
  return bytes.length;
}

/** Anggota menandatangani kehadirannya sendiri. uid SELALU dari token. */
export async function put(ctx) {
  const meetingId = ctx.params.id;
  if (!/^[A-Za-z0-9]{8,40}$/.test(meetingId)) throw new HttpError(400, 'ID pertemuan tidak valid', 'validation');
  const uid = ctx.auth.uid;
  const body = await readJson(ctx.request, 70000);
  const size = checkPng(body.image);

  const [meeting, record] = await Promise.all([ctx.fs.get(`meetings/${meetingId}`), ctx.fs.get(`attendance/${meetingId}_${uid}`)]);
  if (!meeting || meeting.deletedAt) throw new HttpError(404, 'Pertemuan tidak ditemukan', 'not_found');
  if (!record || record.meetingDeleted) throw new HttpError(404, 'Kamu belum tercatat hadir di pertemuan ini', 'not_attended');
  if (record.status !== 'hadir' && record.status !== 'terlambat') throw new HttpError(409, 'Tanda tangan hanya untuk yang hadir', 'not_present');
  if (record.signed) throw new HttpError(409, 'Kamu sudah menandatangani pertemuan ini', 'already_signed');

  try {
    await ctx.fs.commit([
      op.create(`signatures/${meetingId}_${uid}`, { meetingId, uid, image: body.image, bytes: size, signedAt: ctx.now }),
      op.update(`attendance/${meetingId}_${uid}`, { signed: true, signedAt: ctx.now }),
      auditOp({ action: 'signature.save', actor: ctx.auth, targetUid: uid, targetName: ctx.auth.user.fullName, meetingId, meetingName: meeting.name }, ctx.now),
    ]);
  } catch (e) {
    if (e instanceof FirestoreError && ['ALREADY_EXISTS', 'FAILED_PRECONDITION', 'ABORTED'].includes(e.code)) {
      throw new HttpError(409, 'Kamu sudah menandatangani pertemuan ini', 'already_signed');
    }
    throw e;
  }
  return { ok: true };
}

/** Pertemuan yang sudah kamu hadiri tetapi belum kamu tandatangani. */
export async function pending(ctx) {
  const uid = ctx.auth.uid;
  const records = await ctx.fs.query('attendance', { where: [['uid', '==', uid]] });
  const list = records
    .filter((r) => r.signRequired === true && !r.signed && !r.meetingDeleted && (r.status === 'hadir' || r.status === 'terlambat'))
    .sort((a, b) => a.meetingDate.localeCompare(b.meetingDate))
    .slice(0, 10)
    .map((r) => ({ meetingId: r.meetingId, meetingName: r.meetingName, meetingDate: r.meetingDate }));
  return { pending: list };
}

/** Data untuk PDF daftar hadir bertanda tangan: anggota x pertemuan. */
export async function sheet(ctx) {
  requirePermission(ctx, 'exportReports');
  const q = ctx.url.searchParams;
  const today = localDate(ctx.now.getTime(), tzOffset(ctx.env));
  const from = q.get('from') ? v.dateStr(q.get('from'), 'Dari tanggal') : `${today.slice(0, 7)}-01`;
  const to = q.get('to') ? v.dateStr(q.get('to'), 'Sampai tanggal') : today;
  if (to < from) throw new HttpError(400, 'Tanggal akhir harus setelah tanggal awal', 'validation');
  if (from < addDays(to, -92)) throw new HttpError(400, 'Daftar hadir bertanda tangan maksimal 3 bulan per file', 'validation');
  const kelas = q.get('kelas') ? v.str(q.get('kelas'), { name: 'Kelas', max: 20 }) : '';

  let meetings = await ctx.fs.query('meetings', { where: [['date', '>=', from], ['date', '<=', to]] });
  meetings = meetings
    .filter((m) => !m.deletedAt && m.status !== 'scheduled')
    .sort((a, b) => (a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date)));
  if (meetings.length > MAX_MEETINGS) throw new HttpError(400, `Terlalu banyak pertemuan (${meetings.length}). Persempit rentang tanggal.`, 'validation');

  const perMeeting = await Promise.all(
    meetings.map(async (m) => {
      const [att, sig] = await Promise.all([
        ctx.fs.query('attendance', { where: [['meetingId', '==', m.id]] }),
        ctx.fs.query('signatures', { where: [['meetingId', '==', m.id]] }),
      ]);
      return { m, att, sig };
    }),
  );

  const cells = {};
  const withRecord = new Set();
  for (const { m, att, sig } of perMeeting) {
    const sigBy = new Map(sig.map((s) => [s.uid, s.image]));
    for (const r of att) {
      if (r.meetingDeleted) continue;
      withRecord.add(r.uid);
      (cells[r.uid] ||= {})[m.id] = { status: r.status, signRequired: r.signRequired === true, signed: !!r.signed, sig: sigBy.get(r.uid) || null };
    }
  }

  const users = await ctx.fs.list('users');
  const members = users
    .filter((u) => u.countsAttendance !== false && (u.active || withRecord.has(u.id)))
    .filter((u) => !kelas || (u.kelas || '').toLowerCase() === kelas.toLowerCase())
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'id'))
    .map((u) => ({ uid: u.id, name: u.fullName, kelas: u.kelas || '' }));

  return {
    from,
    to,
    meetings: meetings.map((m) => ({ id: m.id, name: m.name, date: m.date, startTime: m.startTime })),
    members,
    cells,
  };
}
