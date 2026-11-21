import { HttpError } from '../lib/http.js';
import * as v from '../lib/validate.js';
import { op, newId, FirestoreError } from '../lib/firestore.js';
import { auditOp } from '../lib/audit.js';
import { isStaff, requireRole } from '../lib/guard.js';
import { meetingOut, recordOut, userOut, tally } from '../lib/models.js';
import { makeToken, WINDOW_SECONDS } from '../lib/qr-token.js';
import { addDays, localDate, tzOffset } from '../lib/time.js';
import { readSettings } from './settings.js';

function requireStaff(ctx) {
  if (!isStaff(ctx.auth.user)) throw new HttpError(403, 'Hanya pengurus yang boleh melakukan ini', 'forbidden');
}

function validateMeeting(b, defaults) {
  const startTime = v.timeStr(b.startTime, 'Jam mulai');
  const endTime = v.timeStr(b.endTime, 'Jam selesai');
  if (endTime <= startTime) throw new HttpError(400, 'Jam selesai harus setelah jam mulai', 'validation');
  return {
    name: v.str(b.name, { name: 'Nama kegiatan', min: 3, max: 100 }),
    description: v.str(b.description, { name: 'Deskripsi', max: 1000, multiline: true }),
    date: v.dateStr(b.date, 'Tanggal'),
    startTime,
    endTime,
    location: v.str(b.location, { name: 'Lokasi', max: 100 }),
    lateAfterMinutes:
      b.lateAfterMinutes === undefined || b.lateAfterMinutes === null || b.lateAfterMinutes === ''
        ? defaults.defaultLateMinutes
        : v.intRange(b.lateAfterMinutes, { name: 'Batas terlambat (menit)', min: 0, max: 180 }),
  };
}

async function loadMeeting(ctx, id) {
  if (!/^[A-Za-z0-9]{8,40}$/.test(id)) throw new HttpError(404, 'Pertemuan tidak ditemukan', 'not_found');
  const m = await ctx.fs.get(`meetings/${id}`);
  if (!m) throw new HttpError(404, 'Pertemuan tidak ditemukan', 'not_found');
  return m;
}

export async function list(ctx) {
  const offset = tzOffset(ctx.env);
  const today = localDate(ctx.now.getTime(), offset);
  const from = ctx.url.searchParams.get('from') ? v.dateStr(ctx.url.searchParams.get('from'), 'from') : addDays(today, -120);
  const to = ctx.url.searchParams.get('to') ? v.dateStr(ctx.url.searchParams.get('to'), 'to') : addDays(today, 365);
  const meetings = (await ctx.fs.query('meetings', { where: [['date', '>=', from], ['date', '<=', to]] })).sort((a, b) =>
    a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date),
  );

  if (isStaff(ctx.auth.user)) {
    const records = await ctx.fs.query('attendance', { where: [['meetingDate', '>=', from], ['meetingDate', '<=', to]] });
    const byMeeting = new Map();
    for (const r of records) {
      if (!byMeeting.has(r.meetingId)) byMeeting.set(r.meetingId, []);
      byMeeting.get(r.meetingId).push(r);
    }
    return { meetings: meetings.map((m) => ({ ...meetingOut(m), counts: tally(byMeeting.get(m.id) || []) })) };
  }
  const mine = await ctx.fs.query('attendance', { where: [['uid', '==', ctx.auth.uid]] });
  const mineBy = new Map(mine.map((r) => [r.meetingId, r]));
  return { meetings: meetings.map((m) => ({ ...meetingOut(m), myStatus: mineBy.get(m.id)?.status || null })) };
}

export async function detail(ctx) {
  const m = await loadMeeting(ctx, ctx.params.id);
  if (!isStaff(ctx.auth.user)) {
    const rec = await ctx.fs.get(`attendance/${m.id}_${ctx.auth.uid}`);
    return { meeting: meetingOut(m), myRecord: rec ? recordOut(rec) : null };
  }
  const [records, users] = await Promise.all([
    ctx.fs.query('attendance', { where: [['meetingId', '==', m.id]] }),
    ctx.fs.list('users'),
  ]);
  const recorded = new Set(records.map((r) => r.uid));
  // Anggota aktif yang ikut absensi tetapi belum punya catatan (sesi belum ditutup).
  const pending = users
    .filter((u) => u.active && u.countsAttendance !== false && !recorded.has(u.id))
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'id'))
    .map(userOut);
  records.sort((a, b) => a.memberName.localeCompare(b.memberName, 'id'));
  return { meeting: meetingOut(m), counts: tally(records), records: records.map(recordOut), pending };
}

export async function create(ctx) {
  requireStaff(ctx);
  const b = await ctx.json();
  const settings = await readSettings(ctx);
  const data = validateMeeting(b, settings);
  const id = newId();
  const doc = {
    ...data,
    status: 'scheduled',
    createdBy: ctx.auth.uid,
    createdByName: ctx.auth.user.fullName,
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
  await ctx.fs.commit([
    op.create(`meetings/${id}`, doc),
    auditOp({ action: 'meeting.create', actor: ctx.auth, meetingId: id, meetingName: data.name, detail: `${data.date} ${data.startTime}` }, ctx.now),
  ]);
  return { meeting: meetingOut({ id, ...doc }) };
}

export async function update(ctx) {
  requireStaff(ctx);
  const m = await loadMeeting(ctx, ctx.params.id);
  if (m.status === 'closed' && ctx.auth.user.role !== 'admin') {
    throw new HttpError(403, 'Pertemuan yang sudah ditutup hanya bisa diubah oleh admin', 'forbidden');
  }
  const settings = await readSettings(ctx);
  const merged = validateMeeting({ ...meetingOut(m), ...(await ctx.json()) }, settings);
  const patch = { ...merged, updatedAt: ctx.now };
  // Nama/tanggal didenormalisasi di catatan absensi; hanya diubah lewat penutupan agar riwayat konsisten.
  await ctx.fs.commit([
    op.update(`meetings/${m.id}`, patch),
    auditOp({ action: 'meeting.update', actor: ctx.auth, meetingId: m.id, meetingName: merged.name }, ctx.now),
  ]);
  const records = await ctx.fs.query('attendance', { where: [['meetingId', '==', m.id]] });
  if (records.length && (merged.name !== m.name || merged.date !== m.date)) {
    for (let i = 0; i < records.length; i += 400) {
      await ctx.fs.commit(
        records.slice(i, i + 400).map((r) => op.update(`attendance/${r.id}`, { meetingName: merged.name, meetingDate: merged.date })),
      );
    }
  }
  return { meeting: meetingOut({ ...m, ...patch }) };
}

export async function open(ctx) {
  requireStaff(ctx);
  const m = await loadMeeting(ctx, ctx.params.id);
  if (m.status === 'open') return { meeting: meetingOut(m) };
  const reopen = m.status === 'closed';
  const patch = { status: 'open', openedAt: reopen ? m.openedAt || ctx.now : ctx.now, closedAt: null, openedBy: ctx.auth.uid, updatedAt: ctx.now };
  await ctx.fs.commit([
    op.update(`meetings/${m.id}`, patch),
    auditOp({ action: reopen ? 'meeting.reopen' : 'meeting.open', actor: ctx.auth, meetingId: m.id, meetingName: m.name }, ctx.now),
  ]);
  return { meeting: meetingOut({ ...m, ...patch }) };
}

async function createIgnoringExisting(ctx, writes) {
  try {
    await ctx.fs.commit(writes);
  } catch (e) {
    if (!(e instanceof FirestoreError) || e.code !== 'ALREADY_EXISTS') throw e;
    // Ada anggota yang absen di detik yang sama; ulangi satu per satu dan lewati yang sudah ada.
    for (const w of writes) {
      try {
        await ctx.fs.commit([w]);
      } catch (e2) {
        if (!(e2 instanceof FirestoreError) || e2.code !== 'ALREADY_EXISTS') throw e2;
      }
    }
  }
}

export async function close(ctx) {
  requireStaff(ctx);
  const m = await loadMeeting(ctx, ctx.params.id);
  if (m.status === 'closed') return { meeting: meetingOut(m), markedAbsent: 0 };
  if (m.status !== 'open') throw new HttpError(409, 'Pertemuan belum dibuka, jadi belum bisa ditutup', 'not_open');
  const body = await ctx.json();
  const markAbsent = body.markAbsent === undefined ? true : v.bool(body.markAbsent, 'markAbsent');

  // 1) Tutup dulu agar QR langsung tidak berlaku.
  const patch = { status: 'closed', closedAt: ctx.now, closedBy: ctx.auth.uid, updatedAt: ctx.now };
  await ctx.fs.commit([
    op.update(`meetings/${m.id}`, patch),
    auditOp({ action: 'meeting.close', actor: ctx.auth, meetingId: m.id, meetingName: m.name }, ctx.now),
  ]);

  // 2) Tandai Alfa untuk anggota aktif yang belum punya catatan.
  let markedAbsent = 0;
  if (markAbsent) {
    const [users, records] = await Promise.all([
      ctx.fs.query('users', { where: [['active', '==', true]] }),
      ctx.fs.query('attendance', { where: [['meetingId', '==', m.id]] }),
    ]);
    const recorded = new Set(records.map((r) => r.uid));
    const missing = users.filter((u) => u.countsAttendance !== false && !recorded.has(u.id));
    const writes = missing.map((u) =>
      op.create(`attendance/${m.id}_${u.id}`, {
        meetingId: m.id,
        meetingName: m.name,
        meetingDate: m.date,
        uid: u.id,
        memberName: u.fullName,
        username: u.username,
        kelas: u.kelas || '',
        status: 'alfa',
        method: 'auto',
        recordedAt: ctx.now,
        updatedAt: ctx.now,
        updatedBy: ctx.auth.uid,
        updatedByName: ctx.auth.user.fullName,
        note: '',
      }),
    );
    for (let i = 0; i < writes.length; i += 400) await createIgnoringExisting(ctx, writes.slice(i, i + 400));
    markedAbsent = writes.length;
  }
  return { meeting: meetingOut({ ...m, ...patch }), markedAbsent };
}

export async function remove(ctx) {
  requireRole(ctx, 'admin');
  const m = await loadMeeting(ctx, ctx.params.id);
  const records = await ctx.fs.query('attendance', { where: [['meetingId', '==', m.id]], limit: 1 });
  if (records.length || m.status !== 'scheduled') {
    throw new HttpError(409, 'Pertemuan yang sudah berjalan atau memiliki riwayat absensi tidak bisa dihapus', 'has_history');
  }
  await ctx.fs.commit([
    op.delete(`meetings/${m.id}`),
    auditOp({ action: 'meeting.delete', actor: ctx.auth, meetingId: m.id, meetingName: m.name }, ctx.now),
  ]);
  return { ok: true };
}

/** Token QR saat ini + perubahan daftar hadir sejak `since` (polling ringan). */
export async function qr(ctx) {
  requireStaff(ctx);
  const m = await loadMeeting(ctx, ctx.params.id);
  const sinceParam = ctx.url.searchParams.get('since');
  const base = { meeting: meetingOut(m), serverTime: ctx.now.getTime(), windowSeconds: WINDOW_SECONDS };
  if (m.status !== 'open') return { ...base, open: false, token: null, expiresAt: null, records: [] };

  const { token, expiresAt } = await makeToken(ctx.env.QR_SECRET, m.id, ctx.now.getTime());
  let records;
  if (sinceParam) {
    // Hemat pembacaan: hanya catatan yang berubah sejak polling terakhir (filter satu field, tanpa index khusus).
    const since = v.isoDateTime(sinceParam, 'since');
    records = (await ctx.fs.query('attendance', { where: [['updatedAt', '>=', since]] })).filter((r) => r.meetingId === m.id);
  } else {
    records = await ctx.fs.query('attendance', { where: [['meetingId', '==', m.id]] });
  }
  return { ...base, open: true, token, expiresAt, records: records.map(recordOut) };
}
