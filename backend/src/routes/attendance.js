import { HttpError } from '../lib/http.js';
import * as v from '../lib/validate.js';
import { op, newId, FirestoreError } from '../lib/firestore.js';
import { auditOp } from '../lib/audit.js';
import { requirePermission } from '../lib/guard.js';
import { rateLimit } from '../lib/ratelimit.js';
import { verifyToken } from '../lib/qr-token.js';
import { localToMs, tzOffset } from '../lib/time.js';
import { recordOut } from '../lib/models.js';

const CONFLICT_CODES = ['ALREADY_EXISTS', 'FAILED_PRECONDITION', 'ABORTED'];

/** Anggota memindai QR. Identitas SELALU diambil dari ID Token, bukan dari isi request. */
export async function scan(ctx) {
  const { uid, user } = ctx.auth;
  // Absensi hanya lewat aplikasi (APK). Aplikasi menambahkan "JapaneseClubApp/" ke User-Agent.
  // Catatan: ini penghalang untuk pemakaian biasa, bukan jaminan mutlak (User-Agent bisa dipalsukan oleh orang teknis).
  const ua = ctx.request.headers.get('user-agent') || '';
  if (ctx.env.ALLOW_WEB_SCAN !== '1' && !/JapaneseClubApp\//.test(ua)) {
    throw new HttpError(403, 'Absensi hanya bisa dilakukan lewat aplikasi Japanese Club (APK).', 'app_required');
  }
  rateLimit(`scan:${uid}`, 15, 60000);
  const body = await ctx.json();
  const token = v.str(body.token, { name: 'Token QR', min: 10, max: 200 });

  const { meetingId } = await verifyToken(ctx.env.QR_SECRET, token, ctx.now.getTime());
  const meeting = await ctx.fs.get(`meetings/${meetingId}`);
  if (!meeting || meeting.deletedAt) throw new HttpError(404, 'Pertemuan tidak ditemukan', 'not_found');
  if (meeting.status !== 'open') {
    throw new HttpError(
      409,
      meeting.status === 'closed' ? 'Sesi absensi sudah ditutup' : 'Sesi absensi belum dibuka',
      meeting.status === 'closed' ? 'session_closed' : 'session_not_open',
    );
  }
  if (user.countsAttendance === false) {
    throw new HttpError(403, 'Akunmu tidak termasuk daftar peserta absensi', 'not_tracked');
  }

  const startMs = localToMs(meeting.date, meeting.startTime, tzOffset(ctx.env));
  const late = ctx.now.getTime() > startMs + meeting.lateAfterMinutes * 60000;
  const status = late ? 'terlambat' : 'hadir';
  const recordId = `${meetingId}_${uid}`;
  const path = `attendance/${recordId}`;
  const record = {
    meetingId,
    meetingName: meeting.name,
    meetingDate: meeting.date,
    uid,
    memberName: user.fullName,
    username: user.username,
    kelas: user.kelas || '',
    status,
    method: 'qr',
    recordedAt: ctx.now,
    updatedAt: ctx.now,
    updatedBy: uid,
    updatedByName: user.fullName,
    note: '',
    signRequired: true, // wajib tanda tangan setelah scan
    signed: false,
  };
  const audit = auditOp({ action: 'attendance.scan', actor: ctx.auth, targetUid: uid, targetName: user.fullName, meetingId, meetingName: meeting.name, detail: status }, ctx.now);

  try {
    // "create" gagal bila catatan sudah ada -> 1 anggota = 1 catatan per pertemuan.
    await ctx.fs.commit([op.create(path, record), audit]);
    return { ok: true, duplicate: false, status, meetingId, meetingName: meeting.name, needsSignature: true, message: status === 'hadir' ? 'Absensi berhasil dicatat' : 'Absensi dicatat sebagai terlambat' };
  } catch (e) {
    if (!(e instanceof FirestoreError) || !CONFLICT_CODES.includes(e.code)) throw e;
  }

  const existing = await ctx.fs.get(path);
  if (existing && existing.method === 'auto' && existing.status === 'alfa') {
    // Sesi sempat ditutup (anggota ditandai Alfa otomatis) lalu dibuka lagi: boleh ditingkatkan.
    try {
      await ctx.fs.commit([op.update(path, { ...record, recordedAt: ctx.now }, existing._updateTime), audit]);
      return { ok: true, duplicate: false, status, meetingId, meetingName: meeting.name, needsSignature: true, message: 'Absensi berhasil dicatat' };
    } catch (e) {
      if (!(e instanceof FirestoreError) || !CONFLICT_CODES.includes(e.code)) throw e;
    }
  }
  const final = (await ctx.fs.get(path)) || existing;
  return { ok: true, duplicate: true, status: final?.status || status, meetingId, meetingName: meeting.name, needsSignature: !!(final && final.signRequired === true && !final.signed && (final.status === 'hadir' || final.status === 'terlambat')), message: 'Kamu sudah tercatat di pertemuan ini' };
}

/** Pengurus (dengan izin) mengubah/memasukkan status kehadiran. Setiap perubahan dicatat. */
export async function setStatus(ctx) {
  requirePermission(ctx, 'editAttendance');
  const { id: meetingId, uid } = ctx.params;
  const b = await ctx.json();
  const status = v.oneOf(b.status, v.STATUSES, 'Status');
  const note = v.str(b.note, { name: 'Catatan', max: 200 });

  const [meeting, member] = await Promise.all([ctx.fs.get(`meetings/${meetingId}`), ctx.fs.get(`users/${uid}`)]);
  if (!meeting || meeting.deletedAt) throw new HttpError(404, 'Pertemuan tidak ditemukan', 'not_found');
  if (!member) throw new HttpError(404, 'Anggota tidak ditemukan', 'not_found');

  const path = `attendance/${meetingId}_${uid}`;
  const existing = await ctx.fs.get(path);
  const actorName = ctx.auth.user.fullName;
  const audit = (from) =>
    auditOp(
      { action: 'attendance.update', actor: ctx.auth, targetUid: uid, targetName: member.fullName, meetingId, meetingName: meeting.name, detail: `${from || '-'} -> ${status}` },
      ctx.now,
    );

  if (existing) {
    if (existing.status === status && (existing.note || '') === note) return { record: recordOut(existing), unchanged: true };
    await ctx.fs.commit([
      op.update(path, { status, note, method: existing.method === 'qr' ? 'qr' : 'manual', updatedAt: ctx.now, updatedBy: ctx.auth.uid, updatedByName: actorName }),
      audit(existing.status),
    ]);
    return { record: recordOut({ ...existing, status, note, updatedAt: ctx.now, updatedByName: actorName }) };
  }
  if (!member.active && meeting.status !== 'closed') {
    throw new HttpError(400, 'Anggota nonaktif tidak bisa dicatat pada sesi yang masih berjalan', 'inactive');
  }
  const record = {
    meetingId,
    meetingName: meeting.name,
    meetingDate: meeting.date,
    uid,
    memberName: member.fullName,
    username: member.username,
    kelas: member.kelas || '',
    status,
    method: 'manual',
    recordedAt: ctx.now,
    updatedAt: ctx.now,
    updatedBy: ctx.auth.uid,
    updatedByName: actorName,
    note,
  };
  try {
    await ctx.fs.commit([op.create(path, record), audit(null)]);
  } catch (e) {
    if (e instanceof FirestoreError && CONFLICT_CODES.includes(e.code)) {
      throw new HttpError(409, 'Data berubah saat disimpan. Muat ulang lalu coba lagi.', 'conflict');
    }
    throw e;
  }
  return { record: recordOut({ id: `${meetingId}_${uid}`, ...record }) };
}

/** Ubah status banyak anggota sekaligus (maks. 100) pada satu pertemuan. */
export async function bulkSet(ctx) {
  requirePermission(ctx, 'editAttendance');
  const meetingId = ctx.params.id;
  const b = await ctx.json();
  const status = v.oneOf(b.status, v.STATUSES, 'Status');
  if (!Array.isArray(b.uids) || !b.uids.length) throw new HttpError(400, 'Pilih minimal satu anggota.', 'validation');
  const uids = [...new Set(b.uids.map(String))];
  if (uids.length > 100) throw new HttpError(400, 'Maksimal 100 anggota sekali ubah.', 'validation');

  if (!/^[A-Za-z0-9]{8,40}$/.test(meetingId)) throw new HttpError(404, 'Pertemuan tidak ditemukan', 'not_found');
  const meeting = await ctx.fs.get(`meetings/${meetingId}`);
  if (!meeting || meeting.deletedAt) throw new HttpError(404, 'Pertemuan tidak ditemukan', 'not_found');
  const [users, recs] = await Promise.all([ctx.fs.list('users'), ctx.fs.query('attendance', { where: [['meetingId', '==', meetingId]] })]);
  const byUid = new Map(users.map((u) => [u.id, u]));
  const existing = new Map(recs.map((r) => [r.uid, r]));
  const actorName = ctx.auth.user.fullName;
  const ops = [];
  let changed = 0, unchanged = 0, skipped = 0;
  for (const uid of uids) {
    const member = byUid.get(uid);
    const ex = existing.get(uid);
    if (!member || (!ex && !member.active && meeting.status !== 'closed')) { skipped++; continue; }
    const audit = (from) => auditOp({ action: 'attendance.update', actor: ctx.auth, targetUid: uid, targetName: member.fullName, meetingId, meetingName: meeting.name, detail: `${from || '-'} -> ${status} (massal)` }, ctx.now);
    if (ex) {
      if (ex.status === status) { unchanged++; continue; }
      ops.push(op.update(`attendance/${meetingId}_${uid}`, { status, method: ex.method === 'qr' ? 'qr' : 'manual', updatedAt: ctx.now, updatedBy: ctx.auth.uid, updatedByName: actorName }), audit(ex.status));
    } else {
      ops.push(op.create(`attendance/${meetingId}_${uid}`, { meetingId, meetingName: meeting.name, meetingDate: meeting.date, uid, memberName: member.fullName, username: member.username, kelas: member.kelas || '', status, method: 'manual', recordedAt: ctx.now, updatedAt: ctx.now, updatedBy: ctx.auth.uid, updatedByName: actorName, note: '' }), audit(null));
    }
    changed++;
  }
  if (ops.length) {
    try { await ctx.fs.commit(ops); } catch (e) {
      if (e instanceof FirestoreError && CONFLICT_CODES.includes(e.code)) throw new HttpError(409, 'Data berubah saat disimpan. Muat ulang lalu coba lagi.', 'conflict');
      throw e;
    }
  }
  return { changed, unchanged, skipped };
}
