// Dasbor: tampilan staf (statistik klub) dan tampilan anggota (kehadiran pribadi).
import * as api from './api.js';
import { icon } from './icons.js';
import { esc, STATUS_KEYS, STATUS_LABEL, STATUS_COLOR, fmtDate, fmtDateShort, fmtTime, fmtMonthShort, timeAgo, pct, loadScript, dayNum } from './utils.js';
import { LIBS } from './config.js';
import { pageHead, skeletonPage, errorState, emptyState, statusBadge, meetingBadge } from './ui.js';
import { openAnnouncement } from './announcements.js';

export const ACTION_TEXT = {
  'member.create': (a) => `membuat akun ${a.targetName}`,
  'member.update': (a) => `mengubah data ${a.targetName}`,
  'member.activate': (a) => `mengaktifkan akun ${a.targetName}`,
  'member.deactivate': (a) => `menonaktifkan akun ${a.targetName}`,
  'member.password_reset': (a) => `mereset password ${a.targetName}`,
  'password.change': () => 'mengganti password',
  'meeting.create': (a) => `membuat pertemuan ${a.meetingName}`,
  'meeting.update': (a) => `mengubah pertemuan ${a.meetingName}`,
  'meeting.open': (a) => `membuka absensi ${a.meetingName}`,
  'meeting.reopen': (a) => `membuka kembali absensi ${a.meetingName}`,
  'meeting.close': (a) => `menutup absensi ${a.meetingName}`,
  'meeting.delete': (a) => `menghapus pertemuan ${a.meetingName}`,
  'attendance.scan': (a) => `absen lewat QR di ${a.meetingName}${a.detail ? ` (${STATUS_LABEL[a.detail] || a.detail})` : ''}`,
  'attendance.update': (a) => `mengubah kehadiran ${a.targetName} di ${a.meetingName}`,
  'announcement.create': (a) => `membuat pengumuman "${a.detail}"`,
  'announcement.update': (a) => `mengubah pengumuman "${a.detail}"`,
  'announcement.delete': (a) => `menghapus pengumuman "${a.detail}"`,
  'settings.update': () => 'mengubah informasi klub',
  'admin.bootstrap': () => 'membuat akun admin pertama',
};
export const actionText = (a) => (ACTION_TEXT[a.action] ? ACTION_TEXT[a.action](a) : a.action);

function ledgerItem(value, label, { accent = false, suffix = '' } = {}) {
  return `<div class="ledger-item ${accent ? 'accent' : ''}"><div class="ledger-value">${esc(value)}${suffix ? `<small>${esc(suffix)}</small>` : ''}</div><div class="ledger-label">${esc(label)}</div></div>`;
}

function nextMeetingPanel(m, isStaff) {
  if (!m) return `<div class="panel"><div class="panel-head"><h2>Pertemuan berikutnya</h2></div><div class="panel-body">${emptyState({ iconName: 'calendar', title: 'Belum ada jadwal', text: isStaff ? 'Buat pertemuan baru agar anggota bisa melihat jadwalnya.' : 'Jadwal baru akan tampil di sini.', action: isStaff ? '<a class="btn btn-primary" href="#/meetings">Buat pertemuan</a>' : '' })}</div></div>`;
  return `<div class="panel"><div class="panel-head"><h2>Pertemuan berikutnya</h2>${meetingBadge(m.status)}</div>
    <div class="panel-body"><h3>${esc(m.name)}</h3>
    <div class="stack" style="gap:6px;margin-top:10px;color:var(--ink-2)">
      <div>${icon('calendar')} ${esc(fmtDate(m.date))}</div>
      <div>${icon('clock')} ${esc(m.startTime)} - ${esc(m.endTime)} WIB</div>
      ${m.location ? `<div>${icon('pin')} ${esc(m.location)}</div>` : ''}
    </div>
    ${isStaff ? `<a class="btn btn-sm" style="margin-top:14px" href="#/meetings/${esc(m.id)}">Lihat detail</a>` : ''}</div></div>`;
}

function announcementsPanel(list) {
  return `<div class="panel"><div class="panel-head"><h2>Pengumuman terbaru</h2><a class="btn btn-quiet btn-sm" href="#/announcements">Semua</a></div>
    <div class="panel-body">${
      list.length
        ? list.map((a) => `<button class="note-item" data-ann="${esc(a.id)}"><h3>${esc(a.title)}</h3><p>${esc(a.body)}</p><span class="small muted">${esc(fmtDateShort(a.publishAt.slice(0, 10)))}</span></button>`).join('')
        : emptyState({ iconName: 'megaphone', title: 'Belum ada pengumuman' })
    }</div></div>`;
}

function bindAnnouncements(container, list) {
  container.querySelectorAll('[data-ann]').forEach((b) => b.addEventListener('click', () => openAnnouncement(list.find((a) => a.id === b.dataset.ann))));
}

// ---------- Grafik ----------
async function drawCharts(container, d, isStale) {
  const barHost = container.querySelector('#chart-monthly');
  const donutHost = container.querySelector('#chart-status');
  try {
    await loadScript(LIBS.chart);
    if (isStale() || !window.Chart) return;
    const Chart = window.Chart;
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    Chart.defaults.color = '#4a463f';
    const labels = d.chart.map((m) => fmtMonthShort(m.month));
    const charts = [];
    charts.push(new Chart(barHost.querySelector('canvas'), {
      type: 'bar',
      data: { labels, datasets: STATUS_KEYS.map((s) => ({ label: STATUS_LABEL[s], data: d.chart.map((m) => m[s]), backgroundColor: STATUS_COLOR[s], borderRadius: 3, maxBarThickness: 38 })) },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
        scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#ece7dc' } } },
      },
    }));
    const total = STATUS_KEYS.reduce((n, s) => n + d.monthStatus[s], 0);
    if (total > 0) {
      charts.push(new Chart(donutHost.querySelector('canvas'), {
        type: 'doughnut',
        data: { labels: STATUS_KEYS.map((s) => STATUS_LABEL[s]), datasets: [{ data: STATUS_KEYS.map((s) => d.monthStatus[s]), backgroundColor: STATUS_KEYS.map((s) => STATUS_COLOR[s]), borderWidth: 2, borderColor: '#fcfbf8' }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '64%', plugins: { legend: { display: false } } },
      }));
    } else {
      donutHost.innerHTML = emptyState({ iconName: 'report', title: 'Belum ada data bulan ini' });
    }
    return () => charts.forEach((c) => c.destroy());
  } catch {
    // Cadangan bila pustaka grafik tidak bisa dimuat: tampilkan angka dalam tabel.
    barHost.innerHTML = `<div class="table-wrap"><table class="table"><thead><tr><th>Bulan</th>${STATUS_KEYS.map((s) => `<th>${STATUS_LABEL[s]}</th>`).join('')}</tr></thead><tbody>${d.chart.map((m) => `<tr><td>${esc(fmtMonthShort(m.month))}</td>${STATUS_KEYS.map((s) => `<td class="num">${m[s]}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    donutHost.innerHTML = `<p class="muted small">Grafik tidak bisa dimuat (periksa koneksi internet).</p>`;
  }
}

// ---------- Tampilan staf ----------
function staffHtml(d, isStaff) {
  const s = d.stats;
  const live = d.openMeeting
    ? `<div class="live-banner"><span class="live-dot"></span><div class="grow"><strong>${esc(d.openMeeting.name)}</strong><div class="small" style="opacity:.85">Absensi sedang dibuka${s.notYetPresent !== null ? ` - ${s.notYetPresent} anggota belum hadir` : ''}</div></div><a class="btn" href="#/meetings/${esc(d.openMeeting.id)}/qr">${icon('qr')} Buka layar QR</a></div>`
    : '';
  return `
    ${live}
    <div class="ledger" role="list">
      ${ledgerItem(s.activeMembers, 'Anggota aktif')}
      ${ledgerItem(s.officers, 'Pengurus')}
      ${ledgerItem(s.totalMeetings, 'Total pertemuan')}
      ${ledgerItem(s.monthAttendance, 'Kehadiran bulan ini')}
      ${ledgerItem(String(s.monthPercentage).replace('.', ','), 'Persentase kehadiran', { accent: true, suffix: '%' })}
      ${ledgerItem(s.notYetPresent === null ? '-' : s.notYetPresent, 'Belum hadir (sesi berjalan)')}
    </div>
    <div class="grid-main" style="margin-top:18px">
      <div class="panel"><div class="panel-head"><h2>Kehadiran 6 bulan terakhir</h2></div>
        <div class="panel-body"><div class="chart-box" id="chart-monthly"><canvas role="img" aria-label="Grafik batang kehadiran per bulan"></canvas></div>
        <div class="legend">${STATUS_KEYS.map((k) => `<span><i style="background:${STATUS_COLOR[k]}"></i>${STATUS_LABEL[k]}</span>`).join('')}</div></div></div>
      <div class="panel"><div class="panel-head"><h2>Status bulan ini</h2></div>
        <div class="panel-body"><div class="chart-box short" id="chart-status"><canvas role="img" aria-label="Grafik lingkaran status kehadiran bulan ini"></canvas></div>
        <div class="mini-stats" style="margin-top:14px">${STATUS_KEYS.map((k) => `<div><strong>${d.monthStatus[k]}</strong><span>${STATUS_LABEL[k]}</span></div>`).join('')}</div></div></div>
    </div>
    <div class="grid-main" style="margin-top:18px">
      <div class="panel"><div class="panel-head"><h2>Aktivitas terbaru</h2></div><div class="panel-body">${
        d.activity.length
          ? `<ul class="activity">${d.activity.map((a) => `<li><span class="dot"></span><div><div><strong>${esc(a.actorName)}</strong> ${esc(actionText(a))}</div><div class="when">${esc(timeAgo(a.at))}</div></div></li>`).join('')}</ul>`
          : emptyState({ iconName: 'history', title: 'Belum ada aktivitas', text: 'Perubahan penting akan tercatat di sini.' })
      }</div></div>
      <div class="stack">${nextMeetingPanel(d.nextMeeting, isStaff)}${announcementsPanel(d.announcements)}</div>
    </div>`;
}

// ---------- Tampilan anggota ----------
function ringSvg(percent) {
  const r = 52, c = 2 * Math.PI * r;
  return `<div class="ring"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="track" cx="60" cy="60" r="${r}" fill="none" stroke-width="11"/><circle class="bar" cx="60" cy="60" r="${r}" fill="none" stroke-width="11" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - Math.min(100, percent) / 100)}"/></svg><div class="ring-center"><div><strong>${esc(pct(percent))}</strong><span>kehadiran</span></div></div></div>`;
}

function memberHtml(d, user) {
  const live = d.openMeeting
    ? `<div class="live-banner"><span class="live-dot"></span><div class="grow"><strong>${esc(d.openMeeting.name)}</strong><div class="small" style="opacity:.85">Absensi sedang dibuka. Pindai QR di layar pengurus.</div></div><a class="btn" href="#/scan">${icon('scan')} Scan sekarang</a></div>`
    : '';
  const t = d.summary;
  return `
    <p class="muted" style="margin:-14px 0 20px">Halo, ${esc(user.fullName.split(' ')[0])}. Ini ringkasan kehadiranmu.</p>
    ${live}
    <div class="grid-main">
      <div class="panel"><div class="panel-body">
        <div class="row" style="gap:22px;align-items:center">${ringSvg(t.percentage)}
          <div class="grow"><h2>Kehadiran keseluruhan</h2><p class="muted small" style="margin-bottom:12px">${t.total} pertemuan tercatat. Bulan ini: ${d.monthSummary.hadir + d.monthSummary.terlambat} dari ${d.monthSummary.total} hadir.</p></div></div>
        <div class="mini-stats" style="margin-top:18px">${STATUS_KEYS.map((k) => `<div><strong>${t[k]}</strong><span>${STATUS_LABEL[k]}</span></div>`).join('')}</div>
      </div></div>
      ${nextMeetingPanel(d.nextMeeting, false)}
    </div>
    <div class="grid-main" style="margin-top:18px">
      <div class="panel"><div class="panel-head"><h2>Riwayat terakhir</h2><a class="btn btn-quiet btn-sm" href="#/profile">Semua</a></div><div class="panel-body panel-flush">${
        d.recent.length
          ? `<div class="table-wrap"><table class="table stackable"><thead><tr><th>Pertemuan</th><th>Tanggal</th><th>Status</th></tr></thead><tbody>${d.recent.map((r) => `<tr><td class="cell-primary"><strong>${esc(r.meetingName)}</strong></td><td data-label="Tanggal">${esc(fmtDateShort(r.meetingDate))}</td><td data-label="Status">${statusBadge(r.status)}</td></tr>`).join('')}</tbody></table></div>`
          : `<div class="panel-body">${emptyState({ iconName: 'history', title: 'Belum ada riwayat', text: 'Kehadiranmu akan muncul di sini setelah pertemuan pertama.' })}</div>`
      }</div></div>
      ${announcementsPanel(d.announcements)}
    </div>`;
}

export async function dashboardView({ container, user, isStaff, isStale }) {
  container.innerHTML = pageHead({ title: 'Beranda' }) + skeletonPage();
  let cleanup = null;

  const load = async (silent = false) => {
    try {
      const d = await api.get('/api/dashboard');
      if (isStale()) return;
      container.innerHTML = pageHead({ title: 'Beranda', subtitle: isStaff ? 'Ringkasan aktivitas Japanese Club.' : '', actions: `<button class="btn btn-sm" id="dash-refresh">${icon('refresh')} Muat ulang</button>` }) + (d.role === 'staff' ? staffHtml(d, isStaff) : memberHtml(d, user));
      bindAnnouncements(container, d.announcements);
      container.querySelector('#dash-refresh')?.addEventListener('click', () => load());
      if (d.role === 'staff') {
        cleanup?.();
        cleanup = await drawCharts(container, d, isStale);
      }
    } catch (e) {
      if (isStale() || silent) return;
      container.innerHTML = pageHead({ title: 'Beranda' }) + errorState(e.message);
      container.querySelector('#retry')?.addEventListener('click', () => load());
    }
  };
  await load();
  // Tidak ada refresh otomatis: menghemat kuota baca Firestore gratis. Gunakan tombol "Muat ulang".
  return () => {
    if (typeof cleanup === 'function') cleanup();
  };
}
