// Jadwal kegiatan: tampilan daftar (mendatang/lalu) dan kalender bulanan.
import * as api from './api.js';
import { icon } from './icons.js';
import { esc, fmtDate, fmtMonth, dayNum, todayStr, addDays } from './utils.js';
import { pageHead, emptyState, errorState, loadingBlock, meetingBadge, statusBadge } from './ui.js';

const DOW = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
const MONTHS_BEFORE = 120;

export async function scheduleView({ container, user, isStaff, isStale }) {
  let meetings = [];
  let mode = 'list';
  let showPast = false;
  const today = todayStr();
  let cursor = today.slice(0, 7); // YYYY-MM
  let selected = today;

  container.innerHTML = pageHead({ title: 'Jadwal' }) + `<div class="panel">${loadingBlock()}</div>`;

  const byDate = () => {
    const map = new Map();
    for (const m of meetings) {
      if (!map.has(m.date)) map.set(m.date, []);
      map.get(m.date).push(m);
    }
    return map;
  };

  const eventHtml = (m) => `
    <article class="event">
      <div class="event-date" aria-hidden="true"><strong>${dayNum(m.date)}</strong><span>${esc(fmtMonth(m.date).split(' ')[0].slice(0, 3))}</span></div>
      <div class="grow">
        <div class="row" style="justify-content:space-between;gap:8px"><h3>${esc(m.name)}</h3>${meetingBadge(m.status)}</div>
        <div class="meta"><span>${icon('clock')} ${esc(m.startTime)} - ${esc(m.endTime)} WIB</span>${m.location ? `<span>${icon('pin')} ${esc(m.location)}</span>` : ''}<span class="muted">${esc(fmtDate(m.date))}</span></div>
        ${m.description ? `<p style="margin-top:6px;color:var(--ink-2);white-space:pre-wrap">${esc(m.description)}</p>` : ''}
        <div class="row" style="margin-top:8px">
          ${!isStaff && m.myStatus ? `<span class="small muted">Kehadiranmu:</span> ${statusBadge(m.myStatus)}` : ''}
          ${!isStaff && m.status === 'open' && !m.myStatus ? `<a class="btn btn-sm btn-primary" href="#/scan">${icon('scan')} Scan absensi</a>` : ''}
          ${isStaff ? `<a class="btn btn-sm" href="#/meetings/${esc(m.id)}">Detail</a>` : ''}
        </div>
      </div>
    </article>`;

  function listHtml() {
    const upcoming = meetings.filter((m) => m.date >= today || m.status === 'open').sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
    const past = meetings.filter((m) => m.date < today && m.status !== 'open').sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime));
    const group = (arr) => {
      let lastMonth = '';
      return arr.map((m) => {
        const mo = m.date.slice(0, 7);
        const head = mo !== lastMonth ? `<h2 class="group-title">${esc(fmtMonth(mo))}</h2>` : '';
        lastMonth = mo;
        return head + eventHtml(m);
      }).join('');
    };
    return `
      <div class="panel"><div class="panel-head"><h2>Kegiatan mendatang</h2></div><div class="panel-body">${
        upcoming.length ? group(upcoming) : emptyState({ iconName: 'calendar', title: 'Belum ada kegiatan mendatang', text: isStaff ? 'Buat pertemuan baru dari menu Pertemuan.' : 'Jadwal baru akan muncul di sini.' })
      }</div></div>
      ${past.length ? `<div style="margin-top:14px"><button class="btn" id="toggle-past" aria-expanded="${showPast}">${showPast ? 'Sembunyikan' : 'Tampilkan'} kegiatan yang sudah lewat (${past.length})</button></div>${showPast ? `<div class="panel" style="margin-top:14px"><div class="panel-body">${group(past)}</div></div>` : ''}` : ''}`;
  }

  function calendarHtml() {
    const map = byDate();
    const first = `${cursor}-01`;
    const dow = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7; // Senin = 0
    const gridStart = addDays(first, -dow);
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = addDays(gridStart, i);
      if (i >= 35 && d.slice(0, 7) !== cursor) break;
      const items = map.get(d) || [];
      cells.push(`<button type="button" class="cal-day ${d.slice(0, 7) !== cursor ? 'other' : ''} ${d === today ? 'today' : ''}" data-date="${d}" aria-pressed="${d === selected}" aria-label="${esc(fmtDate(d))}${items.length ? `, ${items.length} kegiatan` : ''}"><span>${dayNum(d)}</span><span class="cal-dots">${items.slice(0, 3).map((m) => `<i class="${m.status === 'closed' ? 'closed' : ''}"></i>`).join('')}</span></button>`);
    }
    const sel = map.get(selected) || [];
    return `
      <div class="panel"><div class="panel-body">
        <div class="cal-head"><button class="btn btn-sm btn-icon" id="cal-prev" aria-label="Bulan sebelumnya">${icon('chevronLeft')}</button><h2>${esc(fmtMonth(cursor))}</h2><button class="btn btn-sm btn-icon" id="cal-next" aria-label="Bulan berikutnya">${icon('chevronRight')}</button></div>
        <div class="cal-grid">${DOW.map((d) => `<div class="cal-dow">${d}</div>`).join('')}${cells.join('')}</div>
      </div></div>
      <div class="panel" style="margin-top:14px"><div class="panel-head"><h2>${esc(fmtDate(selected))}</h2></div><div class="panel-body">${sel.length ? sel.map(eventHtml).join('') : emptyState({ iconName: 'calendar', title: 'Tidak ada kegiatan di tanggal ini' })}</div></div>`;
  }

  function paint() {
    container.innerHTML = pageHead({
      title: 'Jadwal',
      subtitle: 'Pertemuan dan kegiatan Japanese Club.',
      actions: `<div class="segmented" role="group" aria-label="Tampilan jadwal"><button type="button" data-mode="list" aria-pressed="${mode === 'list'}">Daftar</button><button type="button" data-mode="cal" aria-pressed="${mode === 'cal'}">Kalender</button></div>`,
    }) + (mode === 'list' ? listHtml() : calendarHtml());
    container.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { mode = b.dataset.mode; paint(); }));
    container.querySelector('#toggle-past')?.addEventListener('click', () => { showPast = !showPast; paint(); });
    const shift = (n) => {
      const [y, m] = cursor.split('-').map(Number);
      cursor = new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
      selected = cursor === today.slice(0, 7) ? today : `${cursor}-01`;
      paint();
    };
    container.querySelector('#cal-prev')?.addEventListener('click', () => shift(-1));
    container.querySelector('#cal-next')?.addEventListener('click', () => shift(1));
    container.querySelectorAll('.cal-day').forEach((b) => b.addEventListener('click', () => { selected = b.dataset.date; cursor = selected.slice(0, 7); paint(); container.querySelector(`.cal-day[data-date="${selected}"]`)?.focus(); }));
  }

  async function load() {
    try {
      const r = await api.get(`/api/meetings?from=${addDays(today, -MONTHS_BEFORE)}&to=${addDays(today, 540)}`);
      if (isStale()) return;
      meetings = r.meetings;
      paint();
    } catch (e) {
      if (isStale()) return;
      container.innerHTML = pageHead({ title: 'Jadwal' }) + `<div class="panel">${errorState(e.message)}</div>`;
      container.querySelector('#retry')?.addEventListener('click', load);
    }
  }
  await load();
}
