// Manajemen pertemuan: daftar, buat/ubah, buka/tutup absensi, detail dengan hadir/tidak hadir.
import * as api from './api.js';
import { icon } from './icons.js';
import { esc, fmtDate, fmtDateShort, fmtDateTime, STATUS_KEYS, STATUS_LABEL, todayStr, pct } from './utils.js';
import { pageHead, formModal, confirmDialog, openModal, toast, emptyState, errorState, loadingBlock, meetingBadge, statusBadge, skeletonPage, withBusy } from './ui.js';

export function meetingForm(m) {
  return `
    <div class="form-grid">
      <div class="field span-2"><label for="mt-name">Nama kegiatan</label><input class="input" id="mt-name" name="name" maxlength="100" minlength="3" required value="${esc(m?.name || '')}" /></div>
      <div class="field"><label for="mt-date">Tanggal</label><input class="input" id="mt-date" name="date" type="date" required value="${esc(m?.date || todayStr())}" /></div>
      <div class="field"><label for="mt-loc">Lokasi</label><input class="input" id="mt-loc" name="location" maxlength="100" value="${esc(m?.location || '')}" placeholder="Contoh: Ruang Bahasa" /></div>
      <div class="field"><label for="mt-start">Jam mulai (WIB)</label><input class="input" id="mt-start" name="startTime" type="time" required value="${esc(m?.startTime || '15:30')}" /></div>
      <div class="field"><label for="mt-end">Jam selesai (WIB)</label><input class="input" id="mt-end" name="endTime" type="time" required value="${esc(m?.endTime || '17:00')}" /></div>
      <div class="field span-2"><label for="mt-late">Dianggap terlambat setelah (menit)</label><input class="input" id="mt-late" name="lateAfterMinutes" type="number" min="0" max="180" inputmode="numeric" value="${esc(m?.lateAfterMinutes ?? 15)}" /><span class="hint">Anggota yang scan lebih dari ini setelah jam mulai otomatis tercatat Terlambat.</span></div>
      <div class="field span-2"><label for="mt-desc">Deskripsi</label><textarea class="textarea" id="mt-desc" name="description" maxlength="1000" placeholder="Materi atau catatan kegiatan">${esc(m?.description || '')}</textarea></div>
    </div>`;
}

export function openMeetingForm(meeting) {
  return formModal({
    title: meeting ? 'Ubah pertemuan' : 'Buat pertemuan',
    submitLabel: meeting ? 'Simpan perubahan' : 'Buat pertemuan',
    wide: true,
    html: meetingForm(meeting),
    onSubmit: async (v) => {
      const body = { name: v.name.trim(), description: v.description.trim(), date: v.date, startTime: v.startTime, endTime: v.endTime, location: v.location.trim(), lateAfterMinutes: Number(v.lateAfterMinutes === '' ? 15 : v.lateAfterMinutes) };
      const r = meeting ? await api.patch(`/api/meetings/${meeting.id}`, body) : await api.post('/api/meetings', body);
      toast(meeting ? 'Pertemuan diperbarui.' : 'Pertemuan dibuat.');
      return r.meeting;
    },
  });
}

export async function openAttendance(meeting) {
  await api.post(`/api/meetings/${meeting.id}/open`);
  location.hash = `#/meetings/${meeting.id}/qr`;
}

export async function closeAttendance(meeting) {
  const ok = await confirmDialog({
    title: 'Tutup sesi absensi?',
    message: 'QR langsung tidak berlaku. Anggota aktif yang belum tercatat akan ditandai Alfa. Kamu masih bisa mengubah statusnya setelah ini.',
    confirmLabel: 'Tutup sesi',
    danger: true,
  });
  if (!ok) return null;
  const r = await api.post(`/api/meetings/${meeting.id}/close`, { markAbsent: true });
  toast(r.markedAbsent ? `Sesi ditutup. ${r.markedAbsent} anggota ditandai Alfa.` : 'Sesi ditutup.');
  return r;
}

// ---------- Daftar ----------
export async function meetingsView({ container, user, isStale }) {
  let all = [];
  let filter = 'all';
  container.innerHTML = pageHead({ title: 'Pertemuan' }) + `<div class="panel">${loadingBlock()}</div>`;

  const actions = `${user.role === 'admin' ? `<a class="btn" href="#/meetings/archive">${icon('archive')} Arsip</a>` : ''}<button class="btn btn-primary" id="new-btn">${icon('plus')} Buat pertemuan</button>`;

  function rows(list) {
    return list.map((m) => {
      const c = m.counts;
      return `<tr class="clickable" data-id="${esc(m.id)}">
        <td class="cell-primary"><strong>${esc(m.name)}</strong><div class="small muted">${esc(m.location || 'Lokasi belum diisi')}</div></td>
        <td data-label="Tanggal">${esc(fmtDateShort(m.date))}</td>
        <td data-label="Jam" class="nowrap">${esc(m.startTime)} - ${esc(m.endTime)}</td>
        <td data-label="Status">${meetingBadge(m.status)}</td>
        <td data-label="Hadir" class="num">${c.hadir + c.terlambat}${c.total ? ` <span class="muted small">/ ${c.total}</span>` : ''}</td>
        <td class="cell-actions">
          ${m.status === 'open' ? `<a class="btn btn-sm btn-primary" href="#/meetings/${esc(m.id)}/qr">${icon('qr')} Layar QR</a>` : ''}
          <a class="btn btn-sm btn-icon" href="#/meetings/${esc(m.id)}" aria-label="Detail ${esc(m.name)}">${icon('chevronRight')}</a>
        </td></tr>`;
    }).join('');
  }

  function paint() {
    const today = todayStr();
    const list = all.filter((m) => {
      if (filter === 'upcoming') return m.status === 'scheduled';
      if (filter === 'open') return m.status === 'open';
      if (filter === 'closed') return m.status === 'closed';
      return true;
    }).sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime));
    const tbl = container.querySelector('#mt-table');
    const empty = container.querySelector('#mt-empty');
    if (!list.length) {
      tbl.classList.add('hidden');
      empty.innerHTML = all.length
        ? emptyState({ iconName: 'search', title: 'Tidak ada pertemuan di filter ini' })
        : emptyState({ iconName: 'calendar', title: 'Belum ada pertemuan', text: 'Buat pertemuan, lalu buka absensinya untuk menampilkan QR.', action: '<button class="btn btn-primary" data-new>Buat pertemuan</button>' });
      empty.querySelector('[data-new]')?.addEventListener('click', create);
      return;
    }
    empty.innerHTML = '';
    tbl.classList.remove('hidden');
    tbl.querySelector('tbody').innerHTML = rows(list);
    tbl.querySelectorAll('tr.clickable').forEach((tr) => tr.addEventListener('click', (e) => { if (!e.target.closest('a,button')) location.hash = `#/meetings/${tr.dataset.id}`; }));
    void today;
  }

  async function create() {
    const m = await openMeetingForm(null);
    if (m) await load();
  }

  function frame() {
    container.innerHTML = pageHead({ title: 'Pertemuan', subtitle: 'Buat pertemuan, buka absensi, dan lihat riwayat kehadiran.', actions }) + `
      <div class="panel">
        <div class="toolbar"><div class="segmented" role="group" aria-label="Filter pertemuan">
          ${[['all', 'Semua'], ['upcoming', 'Terjadwal'], ['open', 'Absensi dibuka'], ['closed', 'Selesai']].map(([k, l]) => `<button type="button" data-f="${k}" aria-pressed="${filter === k}">${l}</button>`).join('')}
        </div></div>
        <div id="mt-empty"></div>
        <div class="table-wrap"><table class="table stackable" id="mt-table"><thead><tr><th>Kegiatan</th><th>Tanggal</th><th>Jam</th><th>Status</th><th>Hadir</th><th></th></tr></thead><tbody></tbody></table></div>
      </div>`;
    container.querySelector('#new-btn').addEventListener('click', create);
    container.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => {
      filter = b.dataset.f;
      container.querySelectorAll('[data-f]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      paint();
    }));
    paint();
  }

  async function load() {
    try {
      // Rentang lebar agar riwayat lama tetap terlihat.
      const r = await api.get('/api/meetings?from=2020-01-01&to=2100-01-01');
      if (isStale()) return;
      all = r.meetings;
      frame();
    } catch (e) {
      if (isStale()) return;
      container.innerHTML = pageHead({ title: 'Pertemuan' }) + `<div class="panel">${errorState(e.message)}</div>`;
      container.querySelector('#retry')?.addEventListener('click', load);
    }
  }
  await load();
}

// ---------- Detail ----------
export async function meetingDetailView({ container, user, can, params, isStale }) {
  const id = params.id;
  const canEdit = can('editAttendance');
  container.innerHTML = skeletonPage();

  async function setStatus(uid, status, selectEl) {
    try {
      selectEl.disabled = true;
      await api.put(`/api/meetings/${id}/attendance/${uid}`, { status });
      toast(`Status diubah menjadi ${STATUS_LABEL[status]}.`);
      await load();
    } catch (e) {
      toast(e.message, 'error');
      selectEl.disabled = false;
      await load();
    }
  }

  const statusSelect = (uid, current, placeholder) => `<select class="select" style="min-height:36px;padding:4px 8px;width:auto;font-size:14px" data-set="${esc(uid)}" aria-label="Ubah status">${placeholder ? '<option value="">Tandai sebagai</option>' : ''}${STATUS_KEYS.map((s) => `<option value="${s}" ${s === current ? 'selected' : ''}>${STATUS_LABEL[s]}</option>`).join('')}</select>`;

  async function load() {
    try {
      const r = await api.get(`/api/meetings/${id}`);
      if (isStale()) return;
      const m = r.meeting, c = r.counts;
      const isAdmin = user.role === 'admin';
      container.innerHTML = `
        <p style="margin-bottom:12px"><a href="#/meetings" class="small">${icon('chevronLeft')} Kembali ke pertemuan</a></p>
        <div class="panel"><div class="panel-body">
          <div class="row" style="align-items:flex-start;gap:14px">
            <div class="grow"><h1 style="font-size:1.5rem">${esc(m.name)}</h1>
              <div class="row" style="margin-top:8px;gap:6px 18px;color:var(--ink-2)"><span>${icon('calendar')} ${esc(fmtDate(m.date))}</span><span>${icon('clock')} ${esc(m.startTime)} - ${esc(m.endTime)} WIB</span>${m.location ? `<span>${icon('pin')} ${esc(m.location)}</span>` : ''}</div>
              ${m.description ? `<p style="margin-top:10px;white-space:pre-wrap;max-width:70ch">${esc(m.description)}</p>` : ''}
              <p class="small muted" style="margin-top:8px">Dibuat oleh ${esc(m.createdByName)}${m.closedAt ? ` - ditutup ${esc(fmtDateTime(m.closedAt))}` : ''}</p></div>
            <div>${meetingBadge(m.status)}</div>
          </div>
          <div class="page-actions" style="margin-top:16px">
            ${m.status === 'open' ? `<a class="btn btn-primary" href="#/meetings/${esc(m.id)}/qr">${icon('qr')} Buka layar QR</a><button class="btn btn-danger" id="mt-close">Tutup sesi</button>` : ''}
            ${m.status === 'scheduled' ? `<button class="btn btn-primary" id="mt-open">${icon('qr')} Buka absensi</button>` : ''}
            ${m.status === 'closed' ? `<button class="btn" id="mt-open">Buka kembali absensi</button>` : ''}
            ${m.status !== 'closed' || isAdmin ? `<button class="btn" id="mt-edit">${icon('edit')} Ubah</button>` : ''}
            ${isAdmin ? `<button class="btn btn-danger" id="mt-del">${icon('trash')} Hapus pertemuan</button>` : ''}
          </div>
        </div></div>
        <div class="panel" style="margin-top:18px"><div class="panel-head"><h2>Rekap kehadiran</h2><strong class="num">${esc(pct(c.percentage))}</strong></div><div class="panel-body"><div class="mini-stats">${STATUS_KEYS.map((k) => `<div><strong>${c[k]}</strong><span>${STATUS_LABEL[k]}</span></div>`).join('')}</div></div></div>
        <div class="panel" style="margin-top:18px"><div class="panel-head"><h2>Sudah tercatat (${r.records.length})</h2></div><div class="panel-body panel-flush" style="padding-top:12px">${
          r.records.length
            ? `<div class="table-wrap"><table class="table stackable"><thead><tr><th>Nama</th><th>Kelas</th><th>Status</th><th>Waktu</th><th>Diubah oleh</th></tr></thead><tbody>${r.records.map((x) => `<tr><td class="cell-primary"><strong>${esc(x.memberName)}</strong>${x.note ? `<div class="small muted">${esc(x.note)}</div>` : ''}</td><td data-label="Kelas">${esc(x.kelas || '-')}</td><td data-label="Status">${canEdit ? statusSelect(x.uid, x.status, false) : statusBadge(x.status)}</td><td data-label="Waktu">${esc(fmtDateTime(x.recordedAt))}</td><td data-label="Diubah oleh">${esc(x.updatedByName || '-')}</td></tr>`).join('')}</tbody></table></div>`
            : `<div class="panel-body">${emptyState({ iconName: 'users', title: 'Belum ada kehadiran tercatat', text: m.status === 'open' ? 'Anggota yang scan QR akan muncul di sini.' : 'Buka absensi agar anggota bisa scan QR.' })}</div>`
        }</div></div>
        ${r.pending.length ? `<div class="panel" style="margin-top:18px"><div class="panel-head"><h2>Belum tercatat (${r.pending.length})</h2></div><div class="panel-body panel-flush" style="padding-top:12px"><div class="table-wrap"><table class="table stackable"><thead><tr><th>Nama</th><th>Kelas</th><th>${canEdit ? 'Tandai' : 'Status'}</th></tr></thead><tbody>${r.pending.map((p) => `<tr><td class="cell-primary"><strong>${esc(p.fullName)}</strong></td><td data-label="Kelas">${esc(p.kelas || '-')}</td><td data-label="${canEdit ? 'Tandai' : 'Status'}">${canEdit ? statusSelect(p.uid, '', true) : '<span class="badge badge-belum">Belum hadir</span>'}</td></tr>`).join('')}</tbody></table></div></div></div>` : ''}`;

      container.querySelectorAll('select[data-set]').forEach((sel) => sel.addEventListener('change', () => { if (sel.value) setStatus(sel.dataset.set, sel.value, sel); }));
      container.querySelector('#mt-open')?.addEventListener('click', async (e) => {
        try { await withBusy(e.currentTarget, 'Membuka', () => openAttendance(m)); } catch (err) { toast(err.message, 'error'); }
      });
      container.querySelector('#mt-close')?.addEventListener('click', async () => {
        try { if (await closeAttendance(m)) await load(); } catch (err) { toast(err.message, 'error'); }
      });
      container.querySelector('#mt-edit')?.addEventListener('click', async () => { if (await openMeetingForm(m)) await load(); });
      container.querySelector('#mt-del')?.addEventListener('click', async () => {
        if (await deleteMeetingFlow(m)) location.hash = '#/meetings';
      });
    } catch (e) {
      if (isStale()) return;
      container.innerHTML = `<p style="margin-bottom:12px"><a href="#/meetings" class="small">${icon('chevronLeft')} Kembali</a></p><div class="panel">${errorState(e.message)}</div>`;
      container.querySelector('#retry')?.addEventListener('click', load);
    }
  }
  await load();
}

// ---------- Hapus (arsip) dengan analisis dampak ----------
/** Dialog hapus pertemuan: tampilkan nama, tanggal, dampak. Mengembalikan true jika berhasil diarsipkan. */
export async function deleteMeetingFlow(m) {
  let info = null;
  try { info = await api.get(`/api/meetings/${m.id}/impact`); } catch (e) { toast(e.message, 'error'); return false; }
  const c = info.counts;
  const body = `
    <div class="del-summary"><strong>${esc(m.name)}</strong><span>${esc(fmtDate(m.date))} &middot; ${esc(m.startTime)} - ${esc(m.endTime)} WIB</span></div>
    <div class="alert alert-warn" role="alert">${icon('alert')}<div><strong>${info.attendanceCount ? `${info.attendanceCount} catatan absensi terkait` : 'Belum ada catatan absensi'}</strong>
      ${info.attendanceCount ? `<p class="small" style="margin-top:4px">Hadir ${c.hadir}, terlambat ${c.terlambat}, izin ${c.izin}, sakit ${c.sakit}, alfa ${c.alfa}.</p>` : ''}</div></div>
    <p style="margin:12px 0 6px"><strong>Yang akan terjadi:</strong></p>
    <ul class="plain-list">${info.effects.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
    <p class="small muted" style="margin-top:10px">Ini bukan hapus permanen. Pertemuan dipindah ke Arsip dan bisa dipulihkan kapan saja.</p>`;
  return new Promise((resolve) => {
    let done = false;
    openModal({
      title: 'Hapus pertemuan?',
      html: body,
      footer: [
        { label: 'Batal', value: false },
        {
          label: 'Pindahkan ke Arsip', kind: 'danger-solid', close: false,
          onClick: async (mod) => {
            const btn = mod.buttons[1];
            mod.setBusy(btn, true, 'Memproses');
            try {
              await api.del(`/api/meetings/${m.id}`);
              done = true;
              toast('Pertemuan dipindahkan ke Arsip.');
              mod.close(true);
            } catch (e) { mod.setBusy(btn, false); mod.showError(e.message); }
            return false;
          },
        },
      ],
      onClose: () => resolve(done),
    });
  });
}

// ---------- Arsip (khusus admin) ----------
export async function archiveView({ container, isStale }) {
  container.innerHTML = pageHead({ title: 'Arsip pertemuan' }) + `<div class="panel">${loadingBlock()}</div>`;

  async function load() {
    try {
      const r = await api.get('/api/meetings/archive');
      if (isStale()) return;
      const list = r.meetings;
      container.innerHTML = `<p style="margin-bottom:12px"><a href="#/meetings" class="small">${icon('chevronLeft')} Kembali ke pertemuan</a></p>` +
        pageHead({ title: 'Arsip pertemuan', subtitle: 'Pertemuan yang dihapus ada di sini. Pulihkan jika terhapus tidak sengaja.' }) +
        `<div class="panel">${list.length ? `<div class="table-wrap"><table class="table stackable"><thead><tr><th>Kegiatan</th><th>Tanggal</th><th>Absensi</th><th>Dihapus</th><th></th></tr></thead><tbody>${list.map((m) => `<tr>
          <td class="cell-primary"><strong>${esc(m.name)}</strong><div class="small muted">${esc(m.location || '')}</div></td>
          <td data-label="Tanggal">${esc(fmtDateShort(m.date))}</td>
          <td data-label="Absensi" class="num">${m.attendanceCount} catatan</td>
          <td data-label="Dihapus">${esc(fmtDateTime(m.deletedAt))}<div class="small muted">oleh ${esc(m.deletedByName || '-')}</div></td>
          <td class="cell-actions"><button class="btn btn-sm btn-primary" data-restore="${esc(m.id)}">Pulihkan</button><button class="btn btn-sm btn-danger" data-purge="${esc(m.id)}">Hapus permanen</button></td></tr>`).join('')}</tbody></table></div>`
          : emptyState({ iconName: 'archive', title: 'Arsip kosong', text: 'Pertemuan yang kamu hapus akan muncul di sini.' })}</div>`;
      container.querySelectorAll('[data-restore]').forEach((b) => b.addEventListener('click', async () => {
        try { await withBusy(b, 'Memulihkan', () => api.post(`/api/meetings/${b.dataset.restore}/restore`)); toast('Pertemuan dipulihkan.'); await load(); } catch (e) { toast(e.message, 'error'); }
      }));
      container.querySelectorAll('[data-purge]').forEach((b) => b.addEventListener('click', () => purge(list.find((x) => x.id === b.dataset.purge))));
    } catch (e) {
      if (isStale()) return;
      container.innerHTML = pageHead({ title: 'Arsip pertemuan' }) + `<div class="panel">${errorState(e.message)}</div>`;
      container.querySelector('#retry')?.addEventListener('click', load);
    }
  }

  async function purge(m) {
    const r = await formModal({
      title: 'Hapus permanen?',
      submitLabel: 'Hapus permanen',
      html: `<div class="alert alert-bad" role="alert">${icon('alert')}<div><strong>Tidak bisa dibatalkan.</strong><p class="small" style="margin-top:4px">Pertemuan dan ${m.attendanceCount} catatan absensinya akan hilang selamanya.</p></div></div>
        <div class="field" style="margin-top:14px"><label for="pg-name">Ketik nama pertemuan untuk melanjutkan</label><input class="input" id="pg-name" name="confirmName" autocomplete="off" placeholder="${esc(m.name)}" required /><span class="hint">${esc(m.name)}</span></div>`,
      onSubmit: async (v) => { await api.post(`/api/meetings/${m.id}/purge`, { confirmName: v.confirmName }); toast('Pertemuan dihapus permanen.'); return true; },
    });
    if (r) await load();
  }
  await load();
}
