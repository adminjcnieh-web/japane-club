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
const METHOD = { qr: 'Scan QR', manual: 'Manual', auto: 'Otomatis (sesi ditutup)' };

// ---------- Ekspor XLSX ----------
function wibDate(iso) {
  // Excel tidak punya zona waktu: geser +7 jam agar jam yang tampil = jam WIB.
  return new Date(new Date(iso).getTime() + 7 * 3600000);
}

export async function buildWorkbook(data, meta) {
  await loadScript(LIBS.exceljs);
  const ExcelJS = window.ExcelJS;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Japanese Club Management System';
  wb.created = new Date();

  const RED = 'FFB3262E', INK = 'FF26231F', SAND = 'FFEBE4D4', PAPER = 'FFFCFBF8';
  const thin = { style: 'thin', color: { argb: 'FFE2DCCF' } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };

  const styleHeader = (row) => {
    row.height = 24;
    row.eachCell((c) => {
      c.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Calibri', size: 11 };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } };
      c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      c.border = border;
    });
  };

  // --- Ringkasan ---
  const s1 = wb.addWorksheet('Ringkasan', { views: [{ showGridLines: false }] });
  s1.columns = [{ width: 30 }, { width: 22 }, { width: 18 }];
  s1.mergeCells('A1:C1');
  const title = s1.getCell('A1');
  title.value = 'Laporan Absensi Japanese Club';
  title.font = { bold: true, size: 18, color: { argb: 'FFFFFFFF' } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RED } };
  title.alignment = { vertical: 'middle', indent: 1 };
  s1.getRow(1).height = 38;
  const info = [
    ['Jenis laporan', meta.typeLabel],
    ['Periode', meta.periodLabel],
    ['Filter kelas', meta.kelas || 'Semua kelas'],
    ['Filter status', meta.status ? STATUS_LABEL[meta.status] : 'Semua status'],
    ['Dibuat pada', wibDate(new Date().toISOString())],
    ['Dibuat oleh', meta.by],
  ];
  info.forEach(([k, v], i) => {
    const r = s1.getRow(3 + i);
    r.getCell(1).value = k;
    r.getCell(1).font = { bold: true, color: { argb: 'FF857F74' } };
    r.getCell(2).value = v;
    if (v instanceof Date) r.getCell(2).numFmt = 'dd/mm/yyyy hh:mm';
    r.getCell(2).alignment = { horizontal: 'left' };
  });
  const h = s1.getRow(10);
  h.values = ['Status kehadiran', 'Jumlah', 'Persentase'];
  styleHeader(h);
  const t = data.summary;
  STATUS_KEYS.forEach((k, i) => {
    const r = s1.getRow(11 + i);
    r.values = [STATUS_LABEL[k], t[k], t.total ? t[k] / t.total : 0];
    r.getCell(3).numFmt = '0.0%';
    r.eachCell((c) => { c.border = border; });
    r.getCell(2).alignment = { horizontal: 'center' };
    r.getCell(3).alignment = { horizontal: 'center' };
  });
  const total = s1.getRow(16);
  total.values = ['Total catatan', t.total, t.total ? 1 : 0];
  total.getCell(3).numFmt = '0.0%';
  total.eachCell((c) => { c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SAND } }; c.border = border; });
  total.getCell(2).alignment = { horizontal: 'center' };
  total.getCell(3).alignment = { horizontal: 'center' };
  s1.getCell('A18').value = 'Persentase kehadiran (Hadir + Terlambat)';
  s1.getCell('A18').font = { bold: true };
  s1.getCell('B18').value = t.total ? (t.hadir + t.terlambat) / t.total : 0;
  s1.getCell('B18').numFmt = '0.0%';
  s1.getCell('B18').font = { bold: true, size: 14, color: { argb: RED } };
  s1.getCell('B18').alignment = { horizontal: 'center' };

  // --- Rekap anggota ---
  const s2 = wb.addWorksheet('Rekap Anggota', { views: [{ state: 'frozen', ySplit: 1 }] });
  s2.columns = [
    { header: 'No', key: 'no', width: 6 }, { header: 'Nama', key: 'name', width: 30 }, { header: 'Kelas', key: 'kelas', width: 10 },
    { header: 'Hadir', key: 'hadir', width: 9 }, { header: 'Terlambat', key: 'terlambat', width: 11 }, { header: 'Izin', key: 'izin', width: 8 },
    { header: 'Sakit', key: 'sakit', width: 8 }, { header: 'Alfa', key: 'alfa', width: 8 }, { header: 'Total', key: 'total', width: 8 }, { header: 'Persentase hadir', key: 'pct', width: 17 },
  ];
  styleHeader(s2.getRow(1));
  data.perMember.forEach((m, i) => {
    const r = s2.addRow({ no: i + 1, name: m.name, kelas: m.kelas, hadir: m.hadir, terlambat: m.terlambat, izin: m.izin, sakit: m.sakit, alfa: m.alfa, total: m.total, pct: m.total ? (m.hadir + m.terlambat) / m.total : 0 });
    r.getCell('pct').numFmt = '0.0%';
    r.eachCell((c, n) => { c.border = border; if (n !== 2) c.alignment = { horizontal: 'center' }; });
  });
  s2.autoFilter = { from: 'A1', to: 'J1' };

  // --- Detail ---
  const s3 = wb.addWorksheet('Detail Kehadiran', { views: [{ state: 'frozen', ySplit: 1 }] });
  s3.columns = [
    { header: 'No', key: 'no', width: 6 }, { header: 'Tanggal', key: 'date', width: 13 }, { header: 'Pertemuan', key: 'meeting', width: 32 },
    { header: 'Nama', key: 'name', width: 28 }, { header: 'Username', key: 'user', width: 16 }, { header: 'Kelas', key: 'kelas', width: 10 },
    { header: 'Status', key: 'status', width: 12 }, { header: 'Metode', key: 'method', width: 22 }, { header: 'Waktu tercatat (WIB)', key: 'at', width: 20 },
    { header: 'Diubah oleh', key: 'by', width: 22 }, { header: 'Catatan', key: 'note', width: 30 },
  ];
  styleHeader(s3.getRow(1));
  const FILL = { hadir: 'FFE2EEE6', terlambat: 'FFF4E9D0', izin: 'FFE0E9F1', sakit: 'FFEBE6F3', alfa: 'FFF5E0DD' };
  data.rows.forEach((x, i) => {
    const r = s3.addRow({ no: i + 1, date: new Date(`${x.meetingDate}T00:00:00Z`), meeting: x.meetingName, name: x.memberName, user: x.username, kelas: x.kelas, status: STATUS_LABEL[x.status], method: METHOD[x.method] || x.method, at: wibDate(x.recordedAt), by: x.updatedByName || '', note: x.note || '' });
    r.getCell('date').numFmt = 'dd/mm/yyyy';
    r.getCell('at').numFmt = 'dd/mm/yyyy hh:mm';
    r.getCell('status').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL[x.status] || PAPER } };
    r.eachCell((c, n) => { c.border = border; if ([1, 2, 6, 7, 9].includes(n)) c.alignment = { horizontal: 'center' }; });
  });
  if (data.rows.length) s3.autoFilter = { from: 'A1', to: 'K1' };

  for (const ws of [s1, s2, s3]) {
    ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  }
  return wb;
}

export function reportFilename(meta) {
  return `${meta.fileBase}.xlsx`;
}

// ---------- Halaman ----------
export async function reportsView({ container, user, isStale }) {
  container.innerHTML = pageHead({ title: 'Laporan' }) + `<div class="panel">${loadingBlock()}</div>`;
  let members = [], meetings = [];
  try {
    const [m, mt] = await Promise.all([api.get('/api/members'), api.get('/api/meetings?from=2020-01-01&to=2100-01-01')]);
    if (isStale()) return;
    members = m.members;
    meetings = mt.meetings.sort((a, b) => b.date.localeCompare(a.date));
  } catch (e) {
    if (isStale()) return;
    container.innerHTML = pageHead({ title: 'Laporan' }) + `<div class="panel">${errorState(e.message)}</div>`;
    container.querySelector('#retry')?.addEventListener('click', () => location.reload());
    return;
  }

  const f = { type: 'monthly', month: todayStr().slice(0, 7), from: `${todayStr().slice(0, 7)}-01`, to: todayStr(), meetingId: meetings[0]?.id || '', uid: members.find((x) => x.role !== 'admin')?.uid || members[0]?.uid || '', kelas: '', status: '' };
  const kelasList = [...new Set(members.map((x) => x.kelas).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'id', { numeric: true }));
  let data = null, loadSeq = 0;

  const typeLabel = { monthly: 'Laporan bulanan', meeting: 'Laporan per pertemuan', member: 'Laporan per anggota' };

  function queryString() {
    const q = new URLSearchParams();
    if (f.type === 'monthly') { q.set('from', `${f.month}-01`); q.set('to', lastDayOf(f.month)); }
    else if (f.type === 'meeting') { q.set('meetingId', f.meetingId); }
    else { q.set('uid', f.uid); q.set('from', f.from); q.set('to', f.to); }
    if (f.kelas) q.set('kelas', f.kelas);
    if (f.status) q.set('status', f.status);
    return q.toString();
  }

  function metaNow() {
    let periodLabel, fileBase;
    if (f.type === 'monthly') {
      periodLabel = `${fmtDateShort(`${f.month}-01`)} s.d. ${fmtDateShort(lastDayOf(f.month))}`;
      fileBase = `Laporan-Absensi-Japanese-Club_${f.month}`;
    } else if (f.type === 'meeting') {
      const m = meetings.find((x) => x.id === f.meetingId);
      periodLabel = m ? `${m.name} (${fmtDateShort(m.date)})` : '-';
      fileBase = `Laporan-Pertemuan_${slug(m?.name || 'pertemuan')}_${m?.date || ''}`;
    } else {
      const u = members.find((x) => x.uid === f.uid);
      periodLabel = `${u?.fullName || '-'}: ${fmtDateShort(f.from)} s.d. ${fmtDateShort(f.to)}`;
      fileBase = `Laporan-Anggota_${slug(u?.fullName || 'anggota')}_${f.from}_sd_${f.to}`;
    }
    return { typeLabel: typeLabel[f.type], periodLabel, fileBase, kelas: f.kelas, status: f.status, by: user.fullName };
  }

  function resultHtml() {
    if (!data) return `<div class="panel">${loadingBlock()}</div>`;
    const t = data.summary;
    return `
      <div class="panel" style="margin-top:18px"><div class="panel-head"><h2>Ringkasan</h2><strong class="num">${esc(pct(t.percentage))} hadir</strong></div>
        <div class="panel-body"><div class="mini-stats">${STATUS_KEYS.map((k) => `<div><strong>${t[k]}</strong><span>${STATUS_LABEL[k]}</span></div>`).join('')}</div></div></div>
      ${data.perMember.length > 1 || f.type !== 'member' ? `<div class="panel" style="margin-top:18px"><div class="panel-head"><h2>Rekap persentase per anggota</h2></div><div class="panel-body panel-flush" style="padding-top:12px">${
        data.perMember.length ? `<div class="table-wrap"><table class="table stackable"><thead><tr><th>Nama</th><th>Kelas</th>${STATUS_KEYS.map((k) => `<th>${STATUS_LABEL[k]}</th>`).join('')}<th>% hadir</th></tr></thead><tbody>${data.perMember.map((m) => `<tr><td class="cell-primary"><strong>${esc(m.name)}</strong></td><td data-label="Kelas">${esc(m.kelas || '-')}</td>${STATUS_KEYS.map((k) => `<td data-label="${STATUS_LABEL[k]}" class="num">${m[k]}</td>`).join('')}<td data-label="% hadir" class="num"><strong>${esc(pct(m.percentage))}</strong></td></tr>`).join('')}</tbody></table></div>` : `<div class="panel-body">${emptyState({ iconName: 'report', title: 'Tidak ada data' })}</div>`
      }</div></div>` : ''}
      <div class="panel" style="margin-top:18px"><div class="panel-head"><h2>Detail kehadiran (${data.rows.length}${data.truncated ? '+' : ''})</h2></div><div class="panel-body panel-flush" style="padding-top:12px">${
        data.rows.length ? `<div class="table-wrap"><table class="table stackable"><thead><tr><th>Tanggal</th><th>Pertemuan</th><th>Nama</th><th>Kelas</th><th>Status</th><th>Waktu tercatat</th></tr></thead><tbody>${data.rows.map((x) => `<tr><td class="cell-primary"><strong>${esc(fmtDateShort(x.meetingDate))}</strong> <span class="muted">${esc(x.meetingName)}</span></td><td data-label="Nama">${esc(x.memberName)}</td><td data-label="Kelas">${esc(x.kelas || '-')}</td><td data-label="Status">${statusBadge(x.status)}</td><td data-label="Waktu tercatat" class="small">${esc(fmtDateTime(x.recordedAt))}</td></tr>`).join('')}</tbody></table></div>${data.truncated ? '<div class="panel-body small muted">Tabel dibatasi 5.000 baris pertama. Persempit rentang tanggal untuk melihat semuanya.</div>' : ''}` : `<div class="panel-body">${emptyState({ iconName: 'report', title: 'Tidak ada data kehadiran', text: 'Ubah periode atau filter untuk melihat data lain.' })}</div>`
      }</div></div>`;
  }

  async function load() {
    const seq = ++loadSeq;
    data = null;
    const holder = container.querySelector('#rp-result');
    if (holder) holder.innerHTML = resultHtml();
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
    container.querySelector('#rp-export').disabled = !data.rows.length && !data.perMember.length;
  }

  function frame() {
    const opt = (v, l, sel) => `<option value="${esc(v)}" ${sel ? 'selected' : ''}>${esc(l)}</option>`;
    container.innerHTML = pageHead({
      title: 'Laporan',
      subtitle: 'Lihat rekap kehadiran dan ekspor ke Excel.',
      actions: `<button class="btn btn-primary" id="rp-export" disabled>${icon('fileDown')} Ekspor Excel</button>`,
    }) + `
      <div class="panel"><div class="panel-body">
        <div class="segmented" role="group" aria-label="Jenis laporan" style="margin-bottom:16px">
          ${Object.entries(typeLabel).map(([k, l]) => `<button type="button" data-type="${k}" aria-pressed="${f.type === k}">${l.replace('Laporan ', '')}</button>`).join('')}
        </div>
        <div class="form-grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr));margin-bottom:-16px">
          ${f.type === 'monthly' ? `<div class="field"><label for="rp-month">Bulan</label><input class="input" id="rp-month" type="month" value="${esc(f.month)}" /></div>` : ''}
          ${f.type === 'meeting' ? `<div class="field" style="grid-column:span 2"><label for="rp-meeting">Pertemuan</label><select class="select" id="rp-meeting">${meetings.length ? meetings.map((m) => opt(m.id, `${fmtDateShort(m.date)} - ${m.name}`, m.id === f.meetingId)).join('') : '<option value="">Belum ada pertemuan</option>'}</select></div>` : ''}
          ${f.type === 'member' ? `<div class="field"><label for="rp-member">Anggota</label><select class="select" id="rp-member">${members.filter((x) => x.role !== 'admin' || x.countsAttendance).map((m) => opt(m.uid, `${m.fullName}${m.kelas ? ` (${m.kelas})` : ''}`, m.uid === f.uid)).join('')}</select></div><div class="field"><label for="rp-from">Dari tanggal</label><input class="input" id="rp-from" type="date" value="${esc(f.from)}" /></div><div class="field"><label for="rp-to">Sampai tanggal</label><input class="input" id="rp-to" type="date" value="${esc(f.to)}" /></div>` : ''}
          <div class="field"><label for="rp-kelas">Kelas</label><select class="select" id="rp-kelas">${opt('', 'Semua kelas', !f.kelas)}${kelasList.map((k) => opt(k, k, k === f.kelas)).join('')}</select></div>
          <div class="field"><label for="rp-status">Status</label><select class="select" id="rp-status">${opt('', 'Semua status', !f.status)}${STATUS_KEYS.map((k) => opt(k, STATUS_LABEL[k], k === f.status)).join('')}</select></div>
        </div>
      </div></div>
      <div id="rp-result"></div>`;
    const $ = (s) => container.querySelector(s);
    container.querySelectorAll('[data-type]').forEach((b) => b.addEventListener('click', () => { f.type = b.dataset.type; frame(); load(); }));
    const bind = (sel, key, cast = (v) => v) => $(sel)?.addEventListener('change', (e) => { f[key] = cast(e.target.value); load(); });
    bind('#rp-month', 'month'); bind('#rp-meeting', 'meetingId'); bind('#rp-member', 'uid'); bind('#rp-from', 'from'); bind('#rp-to', 'to'); bind('#rp-kelas', 'kelas'); bind('#rp-status', 'status');
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
