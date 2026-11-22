// Laporan absensi: bulanan, per pertemuan, per anggota + ekspor Excel (XLSX) memakai ExcelJS.
import * as api from './api.js';
import { icon } from './icons.js';
import { esc, STATUS_KEYS, STATUS_LABEL, fmtDateShort, fmtDateTime, loadScript, downloadBlob, todayStr, pct } from './utils.js';
import { LIBS } from './config.js';
import { pageHead, emptyState, errorState, loadingBlock, statusBadge, toast, withBusy } from './ui.js';

const lastDayOf = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
const slug = (s) => String(s).normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 40) || 'laporan';

// ---------- Ekspor XLSX ----------
function wibDate(iso) {
  // Excel tidak punya zona waktu: geser +7 jam agar jam yang tampil = jam WIB.
  return new Date(new Date(iso).getTime() + 7 * 3600000);
}

// Gabungkan daftar anggota + hitungan per anggota (anggota tanpa catatan tetap muncul dengan angka 0).
export function memberRows(data) {
  const by = new Map(data.perMember.map((m) => [m.uid, m]));
  const rows = data.roster.map((u) => {
    const m = by.get(u.uid) || {};
    return { uid: u.uid, name: u.name, username: u.username, kelas: u.kelas, hadir: m.hadir || 0, izin: m.izin || 0, sakit: m.sakit || 0, alfa: m.alfa || 0, terlambat: m.terlambat || 0 };
  });
  // Anggota yang punya catatan tetapi tidak ada di roster (mis. akun sudah dihapus/berubah).
  for (const m of data.perMember) if (!data.roster.some((u) => u.uid === m.uid)) rows.push({ uid: m.uid, name: m.name, username: '', kelas: m.kelas || '', hadir: m.hadir, izin: m.izin, sakit: m.sakit, alfa: m.alfa, terlambat: m.terlambat });
  return rows.sort((a, b) => a.name.localeCompare(b.name, 'id'));
}

export function meetingRows(data) {
  const by = new Map(data.perMeeting.map((m) => [m.meetingId, m]));
  const rows = data.meetings.map((m) => {
    const t = by.get(m.id) || {};
    return { id: m.id, name: m.name, date: m.date, startTime: m.startTime, hadir: t.hadir || 0, izin: t.izin || 0, sakit: t.sakit || 0, alfa: t.alfa || 0, terlambat: t.terlambat || 0 };
  });
  for (const m of data.perMeeting) if (!rows.some((r) => r.id === m.meetingId)) rows.push({ id: m.meetingId, name: m.name, date: m.date, startTime: '', hadir: m.hadir, izin: m.izin, sakit: m.sakit, alfa: m.alfa, terlambat: m.terlambat });
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

const FILL = { hadir: 'FFD9EAD3', terlambat: 'FFFCE8B2', izin: 'FFCFE2F3', sakit: 'FFE4D7F5', alfa: 'FFF4CCCC' };
const solid = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

/** Lebar kolom mengikuti isi terpanjang (baris tabel saja, dibatasi). */
function autoWidth(ws, { cols, fromRow = 4, toRow, min = 8, max = 48 } = {}) {
  for (let c = 1; c <= cols; c++) {
    let w = min;
    for (let r = fromRow; r <= toRow; r++) {
      const v = ws.getRow(r).getCell(c).value;
      let t = v == null ? '' : v instanceof Date ? 'dd/mm/yyyy hh:mm' : typeof v === 'object' ? (v.result ?? v.text ?? '') : v;
      t = String(t);
      w = Math.max(w, Math.min(max, Math.max(...t.split('\n').map((x) => x.length)) + 3));
    }
    ws.getColumn(c).width = w;
  }
}

export async function buildWorkbook(data, meta) {
  await loadScript(LIBS.exceljs);
  const ExcelJS = window.ExcelJS;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Japanese Club Management System';
  wb.created = new Date();

  const NAVY = 'FF1F2A44', RED = 'FFB3262E', SAND = 'FFF1E9DA';
  const thin = { style: 'thin', color: { argb: 'FFD9D2C3' } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };

  function titleBlock(ws, text, lastCol) {
    ws.mergeCells(1, 1, 1, lastCol);
    const t = ws.getCell(1, 1);
    t.value = text;
    t.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' }, name: 'Calibri' };
    t.fill = solid(NAVY);
    t.alignment = { vertical: 'middle', indent: 1 };
    ws.getRow(1).height = 32;
    ws.mergeCells(2, 1, 2, lastCol);
    const p = ws.getCell(2, 1);
    p.value = `${meta.periodLabel}   |   ${meta.filterLabel}   |   Dibuat ${meta.createdLabel} oleh ${meta.by}`;
    p.font = { size: 10, color: { argb: 'FF6B665C' }, italic: true };
    p.alignment = { indent: 1 };
  }
  function header(ws, rowNo, labels, tints = {}) {
    const row = ws.getRow(rowNo);
    row.values = labels;
    row.height = 30;
    row.eachCell((c, n) => {
      const tint = tints[n];
      c.font = { bold: true, color: { argb: tint ? 'FF26231F' : 'FFFFFFFF' }, name: 'Calibri', size: 11 };
      c.fill = solid(tint || RED);
      c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      c.border = border;
    });
    return row;
  }

  // ===== Sheet 1: Ringkasan Anggota =====
  const members = memberRows(data);
  const s1 = wb.addWorksheet('Ringkasan Anggota', { views: [{ state: 'frozen', ySplit: 4, showGridLines: false }] });
  titleBlock(s1, 'Ringkasan Kehadiran Anggota - Japanese Club', 10);
  header(s1, 4, ['Nomor', 'Nama anggota', 'Username / ID', 'Total pertemuan', 'Hadir', 'Izin', 'Sakit', 'Alfa', 'Terlambat', 'Persentase kehadiran'], { 5: FILL.hadir, 6: FILL.izin, 7: FILL.sakit, 8: FILL.alfa, 9: FILL.terlambat });
  const first = 5;
  members.forEach((m, i) => {
    const r = first + i;
    const total = m.hadir + m.izin + m.sakit + m.alfa + m.terlambat;
    const row = s1.getRow(r);
    row.getCell(1).value = i + 1;
    row.getCell(2).value = m.name;
    row.getCell(3).value = m.username || m.uid;
    row.getCell(4).value = { formula: `SUM(E${r}:I${r})`, result: total };
    [m.hadir, m.izin, m.sakit, m.alfa, m.terlambat].forEach((v, k) => { row.getCell(5 + k).value = v; });
    row.getCell(10).value = { formula: `IF(D${r}=0,0,(E${r}+I${r})/D${r})`, result: total ? (m.hadir + m.terlambat) / total : 0 };
    row.getCell(10).numFmt = '0.0%';
    row.eachCell({ includeEmpty: true }, (c, n) => {
      if (n > 10) return;
      c.border = border;
      c.alignment = { horizontal: n === 2 || n === 3 ? 'left' : 'center', vertical: 'middle' };
      if (n >= 5 && n <= 9) c.fill = solid(['FFF3F8F1', 'FFF2F7FC', 'FFF7F2FB', 'FFFBF1F1', 'FFFFF8E6'][n - 5]);
    });
  });
  const last = first + members.length - 1;
  const totalRow = last + 1;
  const tr = s1.getRow(totalRow);
  tr.getCell(2).value = 'TOTAL';
  if (members.length) {
    for (let c = 4; c <= 9; c++) {
      const L = String.fromCharCode(64 + c);
      tr.getCell(c).value = { formula: `SUM(${L}${first}:${L}${last})`, result: members.reduce((a, m) => a + (c === 4 ? m.hadir + m.izin + m.sakit + m.alfa + m.terlambat : [0, 0, 0, 0, m.hadir, m.izin, m.sakit, m.alfa, m.terlambat][c - 1]), 0) };
    }
    const tot = members.reduce((a, m) => a + m.hadir + m.izin + m.sakit + m.alfa + m.terlambat, 0);
    const pr = members.reduce((a, m) => a + m.hadir + m.terlambat, 0);
    tr.getCell(10).value = { formula: `IF(D${totalRow}=0,0,(E${totalRow}+I${totalRow})/D${totalRow})`, result: tot ? pr / tot : 0 };
    tr.getCell(10).numFmt = '0.0%';
  }
  tr.eachCell({ includeEmpty: true }, (c, n) => {
    if (n > 10) return;
    c.font = { bold: true };
    c.fill = solid(SAND);
    c.border = border;
    c.alignment = { horizontal: n === 2 ? 'left' : 'center', vertical: 'middle' };
  });
  if (members.length) {
    s1.autoFilter = { from: { row: 4, column: 1 }, to: { row: last, column: 10 } };
    s1.addConditionalFormatting({
      ref: `J${first}:J${last}`,
      rules: [
        { type: 'cellIs', operator: 'greaterThanOrEqual', formulae: [0.9], style: { font: { color: { argb: 'FF1E6B3A' }, bold: true }, fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFD9EAD3' } } } },
        { type: 'cellIs', operator: 'lessThan', formulae: [0.75], style: { font: { color: { argb: 'FF9E2A2A' }, bold: true }, fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFF4CCCC' } } } },
      ],
    });
  }
  const note1 = s1.getRow(totalRow + 2);
  note1.getCell(1).value = 'Keterangan: Hadir = tepat waktu. Total pertemuan = Hadir + Izin + Sakit + Alfa + Terlambat. Persentase kehadiran = (Hadir + Terlambat) / Total pertemuan. Hijau >= 90%, merah < 75%.';
  note1.getCell(1).font = { italic: true, size: 9, color: { argb: 'FF6B665C' } };
  autoWidth(s1, { cols: 10, toRow: totalRow, min: 10 });
  s1.getColumn(1).width = 8;

  // ===== Sheet 2: Riwayat Absensi =====
  const s2 = wb.addWorksheet('Riwayat Absensi', { views: [{ state: 'frozen', ySplit: 4, showGridLines: false }] });
  titleBlock(s2, 'Riwayat Absensi per Pertemuan', 8);
  header(s2, 4, ['Tanggal pertemuan', 'Pertemuan', 'Nama anggota', 'Username', 'Status kehadiran', 'Waktu check-in (WIB)', 'Keterangan izin / sakit', 'Keterangan keterlambatan']);
  data.rows.forEach((x, i) => {
    const row = s2.getRow(5 + i);
    row.getCell(1).value = new Date(`${x.meetingDate}T00:00:00Z`);
    row.getCell(1).numFmt = 'dd/mm/yyyy';
    row.getCell(2).value = x.meetingName;
    row.getCell(3).value = x.memberName;
    row.getCell(4).value = x.username;
    row.getCell(5).value = STATUS_LABEL[x.status] || x.status;
    row.getCell(5).fill = solid(FILL[x.status] || 'FFFFFFFF');
    row.getCell(6).value = x.method === 'auto' ? '-' : wibDate(x.recordedAt);
    if (x.method !== 'auto') row.getCell(6).numFmt = 'dd/mm/yyyy hh:mm';
    row.getCell(7).value = x.status === 'izin' || x.status === 'sakit' ? x.note || '' : '';
    row.getCell(8).value = x.lateNote || '';
    row.eachCell({ includeEmpty: true }, (c, n) => {
      if (n > 8) return;
      c.border = border;
      c.alignment = { horizontal: [1, 5, 6].includes(n) ? 'center' : 'left', vertical: 'middle', wrapText: n >= 7 };
    });
  });
  if (data.rows.length) s2.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + data.rows.length, column: 8 } };
  else { s2.getCell('A5').value = 'Tidak ada catatan absensi pada filter ini.'; s2.getCell('A5').font = { italic: true }; }
  if (data.truncated) { s2.getCell(`A${6 + data.rows.length}`).value = 'Catatan: data dibatasi 5.000 baris pertama. Persempit rentang tanggal untuk melihat semuanya.'; }
  autoWidth(s2, { cols: 8, toRow: 4 + Math.max(1, data.rows.length), min: 12, max: 60 });

  // ===== Sheet 3: Rekap Per Pertemuan =====
  const mts = meetingRows(data);
  const s3 = wb.addWorksheet('Rekap Per Pertemuan', { views: [{ state: 'frozen', ySplit: 4, showGridLines: false }] });
  titleBlock(s3, 'Rekap Kehadiran per Pertemuan', 9);
  header(s3, 4, ['Tanggal', 'Pertemuan', 'Jumlah tercatat', 'Hadir', 'Izin', 'Sakit', 'Alfa', 'Terlambat', 'Persentase kehadiran'], { 4: FILL.hadir, 5: FILL.izin, 6: FILL.sakit, 7: FILL.alfa, 8: FILL.terlambat });
  mts.forEach((m, i) => {
    const r = 5 + i;
    const total = m.hadir + m.izin + m.sakit + m.alfa + m.terlambat;
    const row = s3.getRow(r);
    row.getCell(1).value = new Date(`${m.date}T00:00:00Z`);
    row.getCell(1).numFmt = 'dd/mm/yyyy';
    row.getCell(2).value = m.name;
    row.getCell(3).value = { formula: `SUM(D${r}:H${r})`, result: total };
    [m.hadir, m.izin, m.sakit, m.alfa, m.terlambat].forEach((v, k) => { row.getCell(4 + k).value = v; });
    row.getCell(9).value = { formula: `IF(C${r}=0,0,(D${r}+H${r})/C${r})`, result: total ? (m.hadir + m.terlambat) / total : 0 };
    row.getCell(9).numFmt = '0.0%';
    row.eachCell({ includeEmpty: true }, (c, n) => {
      if (n > 9) return;
      c.border = border;
      c.alignment = { horizontal: n === 2 ? 'left' : 'center', vertical: 'middle' };
      if (n >= 4 && n <= 8) c.fill = solid(['FFF3F8F1', 'FFF2F7FC', 'FFF7F2FB', 'FFFBF1F1', 'FFFFF8E6'][n - 4]);
    });
  });
  if (mts.length) {
    const l3 = 4 + mts.length, t3 = l3 + 1;
    const row = s3.getRow(t3);
    row.getCell(2).value = 'TOTAL';
    const sums = [0, 0, 0, 0, 0, 0];
    mts.forEach((m) => { sums[1] += m.hadir; sums[2] += m.izin; sums[3] += m.sakit; sums[4] += m.alfa; sums[5] += m.terlambat; });
    for (let c = 3; c <= 8; c++) {
      const L = String.fromCharCode(64 + c);
      row.getCell(c).value = { formula: `SUM(${L}5:${L}${l3})`, result: c === 3 ? sums[1] + sums[2] + sums[3] + sums[4] + sums[5] : sums[c - 3] };
    }
    const tot = sums[1] + sums[2] + sums[3] + sums[4] + sums[5];
    row.getCell(9).value = { formula: `IF(C${t3}=0,0,(D${t3}+H${t3})/C${t3})`, result: tot ? (sums[1] + sums[5]) / tot : 0 };
    row.getCell(9).numFmt = '0.0%';
    row.eachCell({ includeEmpty: true }, (c, n) => {
      if (n > 9) return;
      c.font = { bold: true }; c.fill = solid(SAND); c.border = border;
      c.alignment = { horizontal: n === 2 ? 'left' : 'center', vertical: 'middle' };
    });
    s3.autoFilter = { from: { row: 4, column: 1 }, to: { row: l3, column: 9 } };
  } else { s3.getCell('A5').value = 'Tidak ada pertemuan pada filter ini.'; s3.getCell('A5').font = { italic: true }; }
  autoWidth(s3, { cols: 9, toRow: 5 + mts.length, min: 11, max: 50 });

  for (const ws of [s1, s2, s3]) ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  return wb;
}

export function reportFilename(meta) {
  return `${meta.fileBase}.xlsx`;
}

// ---------- Halaman ----------
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

export async function reportsView({ container, user, isStale }) {
  container.innerHTML = pageHead({ title: 'Laporan' }) + `<div class="panel">${loadingBlock()}</div>`;
  let members = [], meetings = [];
  try {
    const [m, mt] = await Promise.all([api.get('/api/members'), api.get('/api/meetings?from=2020-01-01&to=2100-01-01')]);
    if (isStale()) return;
    members = m.members.filter((x) => x.countsAttendance !== false);
    meetings = mt.meetings.sort((a, b) => b.date.localeCompare(a.date));
  } catch (e) {
    if (isStale()) return;
    container.innerHTML = pageHead({ title: 'Laporan' }) + `<div class="panel">${errorState(e.message)}</div>`;
    container.querySelector('#retry')?.addEventListener('click', () => location.reload());
    return;
  }

  const today = todayStr();
  const f = { mode: 'month', month: today.slice(5, 7), year: today.slice(0, 4), from: `${today.slice(0, 7)}-01`, to: today, meetingId: meetings[0]?.id || '', uid: '', kelas: '', status: '' };
  const kelasList = [...new Set(members.map((x) => x.kelas).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'id', { numeric: true }));
  const thisYear = Number(today.slice(0, 4));
  const years = [];
  for (let y = thisYear + 1; y >= Math.min(2024, thisYear); y--) years.push(String(y));
  let data = null, loadSeq = 0;

  function range() {
    if (f.mode === 'month') {
      if (f.month === 'all') return { from: `${f.year}-01-01`, to: `${f.year}-12-31` };
      return { from: `${f.year}-${f.month}-01`, to: lastDayOf(`${f.year}-${f.month}`) };
    }
    return { from: f.from, to: f.to };
  }

  function queryString() {
    const q = new URLSearchParams();
    if (f.mode === 'meeting') q.set('meetingId', f.meetingId);
    else { const r = range(); q.set('from', r.from); q.set('to', r.to); }
    if (f.uid) q.set('uid', f.uid);
    if (f.kelas) q.set('kelas', f.kelas);
    if (f.status) q.set('status', f.status);
    return q.toString();
  }

  function metaNow() {
    let periodLabel, fileBase;
    const u = members.find((x) => x.uid === f.uid);
    if (f.mode === 'meeting') {
      const m = meetings.find((x) => x.id === f.meetingId);
      periodLabel = m ? `Pertemuan: ${m.name} (${fmtDateShort(m.date)})` : '-';
      fileBase = `Laporan-Absensi_${slug(m?.name || 'pertemuan')}_${m?.date || ''}`;
    } else {
      const r = range();
      periodLabel = `Periode: ${fmtDateShort(r.from)} s.d. ${fmtDateShort(r.to)}`;
      fileBase = `Laporan-Absensi-Japanese-Club_${r.from}_sd_${r.to}`;
    }
    if (u) fileBase += `_${slug(u.fullName)}`;
    const parts = [u ? `Anggota: ${u.fullName}` : 'Semua anggota', f.kelas ? `Kelas ${f.kelas}` : 'Semua kelas', f.status ? `Status ${STATUS_LABEL[f.status]}` : 'Semua status'];
    const createdLabel = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(new Date());
    return { periodLabel, filterLabel: parts.join(', '), createdLabel, fileBase, by: user.fullName };
  }

  function resultHtml() {
    if (!data) return `<div class="panel">${loadingBlock()}</div>`;
    const t = data.summary;
    const mem = memberRows(data);
    const mts = meetingRows(data);
    const p = (x) => { const tot = x.hadir + x.izin + x.sakit + x.alfa + x.terlambat; return tot ? Math.round(((x.hadir + x.terlambat) / tot) * 1000) / 10 : 0; };
    return `
      <div class="panel" style="margin-top:18px"><div class="panel-head"><h2>Ringkasan</h2><strong class="num">${esc(pct(t.percentage))} hadir</strong></div>
        <div class="panel-body"><div class="mini-stats">${STATUS_KEYS.map((k) => `<div><strong>${t[k]}</strong><span>${STATUS_LABEL[k]}</span></div>`).join('')}</div></div></div>
      <div class="panel" style="margin-top:18px"><div class="panel-head"><h2>Ringkasan anggota (${mem.length})</h2></div><div class="panel-body panel-flush" style="padding-top:12px">${
        mem.length ? `<div class="table-wrap"><table class="table stackable"><thead><tr><th>Nama</th><th>Username</th><th>Hadir</th><th>Izin</th><th>Sakit</th><th>Alfa</th><th>Terlambat</th><th>% hadir</th></tr></thead><tbody>${mem.map((m) => `<tr><td class="cell-primary"><strong>${esc(m.name)}</strong></td><td data-label="Username">${esc(m.username || '-')}</td>${['hadir', 'izin', 'sakit', 'alfa', 'terlambat'].map((k) => `<td data-label="${STATUS_LABEL[k]}" class="num">${m[k]}</td>`).join('')}<td data-label="% hadir" class="num"><strong>${esc(pct(p(m)))}</strong></td></tr>`).join('')}</tbody></table></div>` : `<div class="panel-body">${emptyState({ iconName: 'report', title: 'Tidak ada anggota' })}</div>`
      }</div></div>
      <div class="panel" style="margin-top:18px"><div class="panel-head"><h2>Rekap per pertemuan (${mts.length})</h2></div><div class="panel-body panel-flush" style="padding-top:12px">${
        mts.length ? `<div class="table-wrap"><table class="table stackable"><thead><tr><th>Pertemuan</th><th>Hadir</th><th>Izin</th><th>Sakit</th><th>Alfa</th><th>Terlambat</th></tr></thead><tbody>${mts.map((m) => `<tr><td class="cell-primary"><strong>${esc(fmtDateShort(m.date))}</strong> <span class="muted">${esc(m.name)}</span></td>${['hadir', 'izin', 'sakit', 'alfa', 'terlambat'].map((k) => `<td data-label="${STATUS_LABEL[k]}" class="num">${m[k]}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : `<div class="panel-body">${emptyState({ iconName: 'calendar', title: 'Belum ada pertemuan di periode ini' })}</div>`
      }</div></div>
      <div class="panel" style="margin-top:18px"><div class="panel-head"><h2>Riwayat absensi (${data.rows.length}${data.truncated ? '+' : ''})</h2></div><div class="panel-body panel-flush" style="padding-top:12px">${
        data.rows.length ? `<div class="table-wrap"><table class="table stackable"><thead><tr><th>Tanggal</th><th>Nama</th><th>Status</th><th>Check-in</th><th>Keterangan</th></tr></thead><tbody>${data.rows.map((x) => `<tr><td class="cell-primary"><strong>${esc(fmtDateShort(x.meetingDate))}</strong> <span class="muted">${esc(x.meetingName)}</span></td><td data-label="Nama">${esc(x.memberName)}</td><td data-label="Status">${statusBadge(x.status)}</td><td data-label="Check-in" class="small">${x.method === 'auto' ? '-' : esc(fmtDateTime(x.recordedAt))}</td><td data-label="Keterangan" class="small">${esc(x.lateNote || x.note || '')}</td></tr>`).join('')}</tbody></table></div>${data.truncated ? '<div class="panel-body small muted">Tabel dibatasi 5.000 baris pertama. Persempit filter untuk melihat semuanya.</div>' : ''}` : `<div class="panel-body">${emptyState({ iconName: 'report', title: 'Tidak ada data kehadiran', text: 'Ubah periode atau filter untuk melihat data lain.' })}</div>`
      }</div></div>`;
  }

  async function load() {
    const seq = ++loadSeq;
    data = null;
    const holder = container.querySelector('#rp-result');
    if (holder) holder.innerHTML = resultHtml();
    const btn = container.querySelector('#rp-export');
    if (btn) btn.disabled = true;
    if (f.mode === 'range' && (!f.from || !f.to || f.to < f.from)) {
      container.querySelector('#rp-result').innerHTML = `<div class="panel" style="margin-top:18px">${errorState('Tanggal akhir harus sama atau setelah tanggal awal.')}</div>`;
      return;
    }
    try {
      const r = await api.get(`/api/reports?${queryString()}`);
      if (seq !== loadSeq || isStale()) return;
      data = r;
    } catch (e) {
      if (seq !== loadSeq || isStale()) return;
      container.querySelector('#rp-result').innerHTML = `<div class="panel" style="margin-top:18px">${errorState(e.message)}</div>`;
      container.querySelector('#retry')?.addEventListener('click', load);
      return;
    }
    container.querySelector('#rp-result').innerHTML = resultHtml();
    container.querySelector('#rp-export').disabled = false;
  }

  function frame() {
    const opt = (v, l, sel) => `<option value="${esc(v)}" ${sel ? 'selected' : ''}>${esc(l)}</option>`;
    const modes = { month: 'Bulan & tahun', range: 'Rentang tanggal', meeting: 'Satu pertemuan' };
    container.innerHTML = pageHead({
      title: 'Laporan',
      subtitle: 'Lihat rekap kehadiran dan unduh Excel.',
      actions: `<button class="btn btn-primary" id="rp-export" disabled>${icon('fileDown')} Unduh Excel</button>`,
    }) + `
      <div class="panel"><div class="panel-body">
        <div class="segmented" role="group" aria-label="Cara memilih periode" style="margin-bottom:16px">
          ${Object.entries(modes).map(([k, l]) => `<button type="button" data-mode="${k}" aria-pressed="${f.mode === k}">${l}</button>`).join('')}
        </div>
        <div class="form-grid" style="grid-template-columns:repeat(auto-fit,minmax(190px,1fr));margin-bottom:-16px">
          ${f.mode === 'month' ? `<div class="field"><label for="rp-month">Bulan</label><select class="select" id="rp-month">${opt('all', 'Semua bulan', f.month === 'all')}${MONTHS.map((n, i) => opt(String(i + 1).padStart(2, '0'), n, f.month === String(i + 1).padStart(2, '0'))).join('')}</select></div><div class="field"><label for="rp-year">Tahun</label><select class="select" id="rp-year">${years.map((y) => opt(y, y, y === f.year)).join('')}</select></div>` : ''}
          ${f.mode === 'range' ? `<div class="field"><label for="rp-from">Dari tanggal</label><input class="input" id="rp-from" type="date" value="${esc(f.from)}" /></div><div class="field"><label for="rp-to">Sampai tanggal</label><input class="input" id="rp-to" type="date" value="${esc(f.to)}" /></div>` : ''}
          ${f.mode === 'meeting' ? `<div class="field" style="grid-column:span 2"><label for="rp-meeting">Pertemuan</label><select class="select" id="rp-meeting">${meetings.length ? meetings.map((m) => opt(m.id, `${fmtDateShort(m.date)} - ${m.name}`, m.id === f.meetingId)).join('') : '<option value="">Belum ada pertemuan</option>'}</select></div>` : ''}
          <div class="field"><label for="rp-member">Anggota</label><select class="select" id="rp-member">${opt('', 'Semua anggota', !f.uid)}${members.map((m) => opt(m.uid, `${m.fullName}${m.kelas ? ` (${m.kelas})` : ''}`, m.uid === f.uid)).join('')}</select></div>
          <div class="field"><label for="rp-kelas">Kelas</label><select class="select" id="rp-kelas">${opt('', 'Semua kelas', !f.kelas)}${kelasList.map((k) => opt(k, k, k === f.kelas)).join('')}</select></div>
          <div class="field"><label for="rp-status">Status</label><select class="select" id="rp-status">${opt('', 'Semua status', !f.status)}${STATUS_KEYS.map((k) => opt(k, STATUS_LABEL[k], k === f.status)).join('')}</select></div>
        </div>
      </div></div>
      <div id="rp-result"></div>`;
    const $ = (s) => container.querySelector(s);
    container.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { f.mode = b.dataset.mode; frame(); load(); }));
    const bind = (sel, key) => $(sel)?.addEventListener('change', (e) => { f[key] = e.target.value; load(); });
    bind('#rp-month', 'month'); bind('#rp-year', 'year'); bind('#rp-meeting', 'meetingId'); bind('#rp-member', 'uid'); bind('#rp-from', 'from'); bind('#rp-to', 'to'); bind('#rp-kelas', 'kelas'); bind('#rp-status', 'status');
    $('#rp-export').addEventListener('click', async (e) => {
      if (!data) return;
      try {
        await withBusy(e.currentTarget, 'Menyiapkan', async () => {
          const meta = metaNow();
          const wb = await buildWorkbook(data, meta);
          const buf = await wb.xlsx.writeBuffer();
          downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), reportFilename(meta));
        });
        toast('File Excel berhasil dibuat.');
      } catch (err) { toast(err.message || 'Gagal membuat file Excel.', 'error'); }
    });
  }

  frame();
  await load();
}
