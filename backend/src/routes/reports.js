import { HttpError } from '../lib/http.js';
import * as v from '../lib/validate.js';
import { requirePermission } from '../lib/guard.js';
import { recordOut, tally } from '../lib/models.js';
import { addDays, localDate, localToMs, tzOffset } from '../lib/time.js';

const MAX_ROWS = 5000;

function group(records, keyOf, labelOf) {
  const map = new Map();
  for (const r of records) {
    const k = keyOf(r);
    if (!map.has(k)) map.set(k, { key: k, ...labelOf(r), records: [] });
    map.get(k).records.push(r);
  }
  return [...map.values()].map(({ records: rs, ...meta }) => ({ ...meta, ...tally(rs) }));
}

export async function get(ctx) {
  requirePermission(ctx, 'exportReports');
  const q = ctx.url.searchParams;
  const today = localDate(ctx.now.getTime(), tzOffset(ctx.env));
  const from = q.get('from') ? v.dateStr(q.get('from'), 'Dari tanggal') : `${today.slice(0, 7)}-01`;
  const to = q.get('to') ? v.dateStr(q.get('to'), 'Sampai tanggal') : today;
  if (to < from) throw new HttpError(400, 'Tanggal akhir harus setelah tanggal awal', 'validation');
  if (from < addDays(to, -366)) throw new HttpError(400, 'Rentang laporan maksimal 1 tahun', 'validation');
  const kelas = q.get('kelas') ? v.str(q.get('kelas'), { name: 'Kelas', max: 20 }) : '';
  const status = q.get('status') ? v.oneOf(q.get('status'), v.STATUSES, 'Status') : '';
  const meetingId = q.get('meetingId') || '';
  const uid = q.get('uid') || '';
  if (meetingId && !/^[A-Za-z0-9]{8,40}$/.test(meetingId)) throw new HttpError(400, 'meetingId tidak valid', 'validation');
  if (uid && !/^[A-Za-z0-9]{6,40}$/.test(uid)) throw new HttpError(400, 'uid tidak valid', 'validation');

  let records;
  if (meetingId) records = await ctx.fs.query('attendance', { where: [['meetingId', '==', meetingId]] });
  else if (uid) records = await ctx.fs.query('attendance', { where: [['uid', '==', uid]] });
  else records = await ctx.fs.query('attendance', { where: [['meetingDate', '>=', from], ['meetingDate', '<=', to]] });

  records = records.filter((r) => !r.meetingDeleted);
  // Laporan per pertemuan mengabaikan rentang tanggal; filter lain tetap memakai rentang.
  if (!meetingId) records = records.filter((r) => r.meetingDate >= from && r.meetingDate <= to);
  if (kelas) records = records.filter((r) => (r.kelas || '').toLowerCase() === kelas.toLowerCase());

  // Pertemuan yang sudah berjalan pada rentang ini (untuk rekap per pertemuan) + daftar anggota (termasuk yang belum punya catatan).
  let meetingDocs;
  if (meetingId) {
    const one = await ctx.fs.get(`meetings/${meetingId}`);
    meetingDocs = one ? [one] : [];
  } else {
    meetingDocs = await ctx.fs.query('meetings', { where: [['date', '>=', from], ['date', '<=', to]] });
  }
  meetingDocs = meetingDocs.filter((m) => !m.deletedAt && m.status !== 'scheduled').sort((a, b) => (a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date)));
  const meetingById = new Map(meetingDocs.map((m) => [m.id, m]));
  const offset = tzOffset(ctx.env);
  const lateNote = (r) => {
    if (r.status !== 'terlambat') return '';
    if (r.method === 'manual') return `Ditandai terlambat secara manual oleh ${r.updatedByName || 'pengurus'}`;
    const m = meetingById.get(r.meetingId);
    if (!m || !(r.recordedAt instanceof Date)) return 'Terlambat';
    const mins = Math.max(0, Math.round((r.recordedAt.getTime() - localToMs(m.date, m.startTime, offset)) / 60000));
    return `Check-in ${mins} menit setelah jam mulai (${m.startTime}); batas terlambat ${m.lateAfterMinutes} menit`;
  };

  const users = await ctx.fs.list('users');
  const hasRecord = new Set(records.map((r) => r.uid));
  const roster = users
    .filter((u) => u.countsAttendance !== false && (uid ? u.id === uid : u.active || hasRecord.has(u.id)))
    .filter((u) => !kelas || (u.kelas || '').toLowerCase() === kelas.toLowerCase())
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'id'))
    .map((u) => ({ uid: u.id, name: u.fullName, username: u.username, kelas: u.kelas || '' }));

  const summary = tally(records); // rekap sebelum filter status agar persentase tetap bermakna
  const perMember = group(records, (r) => r.uid, (r) => ({ uid: r.uid, name: r.memberName, kelas: r.kelas || '' })).sort((a, b) => a.name.localeCompare(b.name, 'id'));
  const perMeeting = group(records, (r) => r.meetingId, (r) => ({ meetingId: r.meetingId, name: r.meetingName, date: r.meetingDate })).sort((a, b) => a.date.localeCompare(b.date));

  let rows = records;
  if (status) rows = rows.filter((r) => r.status === status);
  rows.sort((a, b) => (a.meetingDate === b.meetingDate ? a.memberName.localeCompare(b.memberName, 'id') : a.meetingDate.localeCompare(b.meetingDate)));
  const truncated = rows.length > MAX_ROWS;

  return { filters: { from, to, kelas, status, meetingId, uid }, summary, perMember, perMeeting, rows: rows.slice(0, MAX_ROWS).map((r) => ({ ...recordOut(r), lateNote: lateNote(r) })), truncated, roster, meetings: meetingDocs.map((m) => ({ id: m.id, name: m.name, date: m.date, startTime: m.startTime, status: m.status })) };
}
