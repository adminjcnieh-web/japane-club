import { HttpError } from '../lib/http.js';
import * as v from '../lib/validate.js';
import { requirePermission } from '../lib/guard.js';
import { recordOut, tally } from '../lib/models.js';
import { addDays, localDate, tzOffset } from '../lib/time.js';

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

  // Laporan per pertemuan mengabaikan rentang tanggal; filter lain tetap memakai rentang.
  if (!meetingId) records = records.filter((r) => r.meetingDate >= from && r.meetingDate <= to);
  if (kelas) records = records.filter((r) => (r.kelas || '').toLowerCase() === kelas.toLowerCase());

  const summary = tally(records); // rekap sebelum filter status agar persentase tetap bermakna
  const perMember = group(records, (r) => r.uid, (r) => ({ uid: r.uid, name: r.memberName, kelas: r.kelas || '' })).sort((a, b) => a.name.localeCompare(b.name, 'id'));
  const perMeeting = group(records, (r) => r.meetingId, (r) => ({ meetingId: r.meetingId, name: r.meetingName, date: r.meetingDate })).sort((a, b) => a.date.localeCompare(b.date));

  let rows = records;
  if (status) rows = rows.filter((r) => r.status === status);
  rows.sort((a, b) => (a.meetingDate === b.meetingDate ? a.memberName.localeCompare(b.memberName, 'id') : a.meetingDate.localeCompare(b.meetingDate)));
  const truncated = rows.length > MAX_ROWS;

  return { filters: { from, to, kelas, status, meetingId, uid }, summary, perMember, perMeeting, rows: rows.slice(0, MAX_ROWS).map(recordOut), truncated };
}
