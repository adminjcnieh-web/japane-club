// Manajemen anggota: daftar, cari/filter/urut, tambah, ubah, aktif/nonaktif, reset password, detail + riwayat.
import * as api from './api.js';
import { icon } from './icons.js';
import { esc, initials, fmtDate, fmtDateShort, STATUS_KEYS, STATUS_LABEL, ROLE_LABEL, debounce, pct, todayStr } from './utils.js';
import { avatar } from './avatar.js';
import { removePhoto } from './photo.js';
import { pageHead, formModal, confirmDialog, toast, emptyState, errorState, loadingBlock, roleBadge, statusBadge, skeletonPage, withBusy } from './ui.js';

const KELAS_LIST = ['X-1', 'X-2', 'X-3', 'XI-1', 'XI-2', 'XI-3', 'XII-1', 'XII-2', 'XII-3'];

function memberForm(m, { isCreate }) {
  const p = m?.permissions || {};
  return `
    <div class="form-grid">
      <div class="field span-2"><label for="m-name">Nama lengkap</label><input class="input" id="m-name" name="fullName" maxlength="80" required value="${esc(m?.fullName || '')}" /></div>
      <div class="field"><label for="m-user">Username</label>
        <input class="input" id="m-user" name="username" maxlength="20" autocapitalize="none" autocomplete="off" spellcheck="false" ${isCreate ? 'required' : 'disabled'} value="${esc(m?.username || '')}" />
        <span class="hint">${isCreate ? 'Huruf kecil, angka, titik, atau garis bawah. Tidak bisa diubah nanti.' : 'Username tidak dapat diubah.'}</span></div>
      ${isCreate ? `<div class="field"><label for="m-pass">Password awal</label><input class="input" id="m-pass" name="password" type="text" autocomplete="off" minlength="8" required /><span class="hint">Minimal 8 karakter, huruf dan angka. Berikan ke anggota.</span></div>` : '<div></div>'}
      <div class="field"><label for="m-kelas">Kelas</label><input class="input" id="m-kelas" name="kelas" list="kelas-list" maxlength="20" value="${esc(m?.kelas || '')}" /><datalist id="kelas-list">${KELAS_LIST.map((k) => `<option value="${k}">`).join('')}</datalist></div>
      <div class="field"><label for="m-jab">Jabatan</label><input class="input" id="m-jab" name="jabatan" maxlength="40" placeholder="Contoh: Anggota, Sekretaris" value="${esc(m?.jabatan || '')}" /></div>
      <div class="field"><label for="m-role">Role</label><select class="select" id="m-role" name="role"><option value="member">Anggota</option><option value="officer">Pengurus (officer)</option><option value="admin">Admin</option></select></div>
      <div class="field"><label for="m-join">Tanggal bergabung</label><input class="input" id="m-join" name="joinedAt" type="date" value="${esc(m?.joinedAt || todayStr())}" /></div>
      <div class="field span-2"><label class="check"><input type="checkbox" name="countsAttendance" ${(m?.countsAttendance ?? true) ? 'checked' : ''} /><span><strong>Ikut daftar absensi</strong><br /><span class="hint">Jika dimatikan, akun ini tidak ditandai Alfa otomatis dan tidak dihitung di laporan.</span></span></label></div>
      <fieldset class="span-2 hidden" id="perm-box" style="border:1px solid var(--line);border-radius:var(--r-md);padding:12px 14px;margin:0 0 16px">
        <legend class="label" style="padding:0 6px">Izin pengurus</legend>
        <label class="check"><input type="checkbox" name="perm_editAttendance" ${p.editAttendance ? 'checked' : ''} /><span>Boleh mengubah status kehadiran</span></label>
        <label class="check"><input type="checkbox" name="perm_announce" ${p.announce ? 'checked' : ''} /><span>Boleh membuat pengumuman</span></label>
        <label class="check"><input type="checkbox" name="perm_exportReports" ${p.exportReports ? 'checked' : ''} /><span>Boleh melihat dan mengekspor laporan</span></label>
      </fieldset>
    </div>`;
}

function bindRoleToggle(modal, role) {
  const sel = modal.body.querySelector('#m-role');
  const box = modal.body.querySelector('#perm-box');
  sel.value = role || 'member';
  const sync = () => box.classList.toggle('hidden', sel.value !== 'officer');
  sel.addEventListener('change', sync);
  sync();
}

const permsFrom = (v) => ({ editAttendance: !!v.perm_editAttendance, announce: !!v.perm_announce, exportReports: !!v.perm_exportReports });

export async function openMemberForm(member) {
  const isCreate = !member;
  return formModal({
    title: isCreate ? 'Tambah anggota' : 'Ubah data anggota',
    submitLabel: isCreate ? 'Buat akun' : 'Simpan perubahan',
    wide: true,
    html: memberForm(member, { isCreate }),
    onOpen: (m) => bindRoleToggle(m, member?.role),
    onSubmit: async (v) => {
      const body = {
        fullName: v.fullName.trim(), kelas: v.kelas.trim(), jabatan: v.jabatan.trim(), role: v.role,
        joinedAt: v.joinedAt || undefined, countsAttendance: !!v.countsAttendance, permissions: permsFrom(v),
      };
      if (isCreate) {
        body.username = v.username.trim().toLowerCase();
        body.password = v.password;
        const r = await api.post('/api/members', body);
        toast(`Akun ${r.member.username} berhasil dibuat.`);
        return r.member;
      }
      const r = await api.patch(`/api/members/${member.uid}`, body);
      toast('Data anggota diperbarui.');
      return r.member;
    },
  });
}

export function openResetPassword(member) {
  return formModal({
    title: `Reset password ${member.fullName}`,
    submitLabel: 'Reset password',
    html: `<div class="field"><label for="rp-pw">Password baru</label><input class="input" id="rp-pw" name="newPassword" type="text" autocomplete="off" minlength="8" required /><span class="hint">Minimal 8 karakter, huruf dan angka. Berikan ke anggota; sarankan menggantinya setelah login.</span></div>`,
    onSubmit: async (v) => {
      await api.post(`/api/members/${member.uid}/password`, { newPassword: v.newPassword });
      toast('Password berhasil direset.');
      return true;
    },
  });
}

export async function toggleActive(member) {
  const to = !member.active;
  const ok = await confirmDialog({
    title: to ? 'Aktifkan akun?' : 'Nonaktifkan akun?',
    message: to ? `${member.fullName} akan bisa login lagi.` : `${member.fullName} tidak akan bisa login. Riwayat absensinya tetap tersimpan.`,
    confirmLabel: to ? 'Aktifkan' : 'Nonaktifkan',
    danger: !to,
  });
  if (!ok) return false;
  await api.post(`/api/members/${member.uid}/active`, { active: to });
  toast(to ? 'Akun diaktifkan kembali.' : 'Akun dinonaktifkan.');
  return true;
}

// ---------- Daftar ----------
export async function membersView({ container, user, isStale }) {
  const isAdmin = user.role === 'admin';
  let all = [];
  const f = { q: '', role: '', status: 'active', kelas: '', sort: 'name' };

  container.innerHTML = pageHead({ title: 'Anggota' }) + `<div class="panel">${loadingBlock()}</div>`;

  const sorters = {
    name: (a, b) => a.fullName.localeCompare(b.fullName, 'id'),
    kelas: (a, b) => (a.kelas || '~').localeCompare(b.kelas || '~', 'id', { numeric: true }) || a.fullName.localeCompare(b.fullName, 'id'),
    joined: (a, b) => (b.joinedAt || '').localeCompare(a.joinedAt || ''),
    role: (a, b) => ['admin', 'officer', 'member'].indexOf(a.role) - ['admin', 'officer', 'member'].indexOf(b.role) || a.fullName.localeCompare(b.fullName, 'id'),
  };

  const filtered = () => {
    const q = f.q.trim().toLowerCase();
    return all
      .filter((m) => (!q || m.fullName.toLowerCase().includes(q) || m.username.includes(q)))
      .filter((m) => !f.role || m.role === f.role)
      .filter((m) => !f.status || (f.status === 'active' ? m.active : !m.active))
      .filter((m) => !f.kelas || m.kelas === f.kelas)
      .sort(sorters[f.sort]);
  };

  function rowsHtml(list) {
    if (!list.length) return '';
    return list.map((m) => `
      <tr class="clickable" data-uid="${esc(m.uid)}">
        <td class="cell-primary"><div class="cell-name">${avatar(m)}<div style="min-width:0"><strong>${esc(m.fullName)}</strong><div class="small muted">@${esc(m.username)}</div></div></div></td>
        <td data-label="Kelas">${esc(m.kelas || '-')}</td>
        <td data-label="Jabatan">${esc(m.jabatan || '-')}</td>
        <td data-label="Role">${roleBadge(m.role)}</td>
        <td data-label="Akun">${m.active ? '<span class="badge badge-hadir">Aktif</span>' : '<span class="badge badge-off">Nonaktif</span>'}</td>
        <td data-label="Bergabung">${esc(fmtDateShort(m.joinedAt))}</td>
        <td class="cell-actions">
          <a class="btn btn-sm btn-icon" href="#/members/${esc(m.uid)}" aria-label="Lihat detail ${esc(m.fullName)}">${icon('chevronRight')}</a>
        </td>
      </tr>`).join('');
  }

  function paint() {
    const list = filtered();
    const body = container.querySelector('#m-body');
    const count = container.querySelector('#m-count');
    count.textContent = `${list.length} dari ${all.length} akun`;
    if (!list.length) {
      body.innerHTML = '';
      container.querySelector('#m-empty').innerHTML = all.length
        ? emptyState({ iconName: 'search', title: 'Tidak ada hasil', text: 'Coba ubah kata kunci atau filter.' })
        : emptyState({ iconName: 'users', title: 'Belum ada anggota', text: isAdmin ? 'Tambahkan anggota pertama agar mereka bisa login dan absen.' : 'Admin belum menambahkan anggota.', action: isAdmin ? '<button class="btn btn-primary" data-add>Tambah anggota</button>' : '' });
      container.querySelector('[data-add]')?.addEventListener('click', add);
      container.querySelector('#m-table').classList.add('hidden');
      return;
    }
    container.querySelector('#m-empty').innerHTML = '';
    container.querySelector('#m-table').classList.remove('hidden');
    body.innerHTML = rowsHtml(list);
    body.querySelectorAll('tr.clickable').forEach((tr) => tr.addEventListener('click', (e) => { if (!e.target.closest('a,button')) location.hash = `#/members/${tr.dataset.uid}`; }));
  }

  async function add() {
    const m = await openMemberForm(null);
    if (m) await load();
  }

  function frame() {
    const kelasOpts = [...new Set(all.map((m) => m.kelas).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'id', { numeric: true }));
    container.innerHTML = pageHead({
      title: 'Anggota',
      subtitle: 'Kelola akun anggota dan pengurus Japanese Club.',
      actions: isAdmin ? `<button class="btn btn-primary" id="add-btn">${icon('plus')} Tambah anggota</button>` : '',
    }) + `
      <div class="panel">
        <div class="toolbar">
          <div class="search"><span class="sr-only"><label for="m-search">Cari anggota</label></span>${icon('search')}<input class="input" id="m-search" type="search" placeholder="Cari nama atau username" /></div>
          <select class="select" id="f-role" aria-label="Filter role"><option value="">Semua role</option><option value="member">Anggota</option><option value="officer">Pengurus</option><option value="admin">Admin</option></select>
          <select class="select" id="f-status" aria-label="Filter status akun"><option value="active">Akun aktif</option><option value="inactive">Nonaktif</option><option value="">Semua akun</option></select>
          <select class="select" id="f-kelas" aria-label="Filter kelas"><option value="">Semua kelas</option>${kelasOpts.map((k) => `<option>${esc(k)}</option>`).join('')}</select>
          <select class="select" id="f-sort" aria-label="Urutkan"><option value="name">Urut nama</option><option value="kelas">Urut kelas</option><option value="role">Urut role</option><option value="joined">Terbaru bergabung</option></select>
        </div>
        <div id="m-empty"></div>
        <div class="table-wrap"><table class="table stackable" id="m-table"><thead><tr><th>Nama</th><th>Kelas</th><th>Jabatan</th><th>Role</th><th>Akun</th><th>Bergabung</th><th></th></tr></thead><tbody id="m-body"></tbody></table></div>
        <div class="panel-body small muted" id="m-count" aria-live="polite"></div>
      </div>`;
    container.querySelector('#add-btn')?.addEventListener('click', add);
    const $ = (id) => container.querySelector(id);
    $('#f-status').value = f.status; $('#f-role').value = f.role; $('#f-kelas').value = f.kelas; $('#f-sort').value = f.sort; $('#m-search').value = f.q;
    $('#m-search').addEventListener('input', debounce((e) => { f.q = e.target.value; paint(); }, 150));
    for (const [id, key] of [['#f-role', 'role'], ['#f-status', 'status'], ['#f-kelas', 'kelas'], ['#f-sort', 'sort']]) $(id).addEventListener('change', (e) => { f[key] = e.target.value; paint(); });
    paint();
  }

  async function load() {
    try {
      const r = await api.get('/api/members');
      if (isStale()) return;
      all = r.members;
      frame();
    } catch (e) {
      if (isStale()) return;
      container.innerHTML = pageHead({ title: 'Anggota' }) + `<div class="panel">${errorState(e.message)}</div>`;
      container.querySelector('#retry')?.addEventListener('click', load);
    }
  }
  await load();
}

// ---------- Detail ----------
export async function memberDetailView({ container, user, params, isStale, isStaff }) {
  const uid = params.uid;
  const isAdmin = user.role === 'admin';
  if (!isStaff && uid !== user.uid) { location.hash = '#/profile'; return; }
  container.innerHTML = skeletonPage();

  async function load() {
    try {
      const r = await api.get(`/api/members/${uid}/attendance`);
      if (isStale()) return;
      const m = r.member, t = r.summary;
      const chips = STATUS_KEYS.map((k) => `<div><strong>${t[k]}</strong><span>${STATUS_LABEL[k]}</span></div>`).join('');
      container.innerHTML = `
        <p style="margin-bottom:12px"><a href="#/members" class="small">${icon('chevronLeft')} Kembali ke daftar anggota</a></p>
        <div class="panel"><div class="panel-body">
          <div class="row" style="gap:18px;align-items:flex-start">
            ${avatar(m, { size: 'lg', full: true })}
            <div class="grow"><h1 style="font-size:1.5rem">${esc(m.fullName)}</h1>
              <div class="row" style="margin-top:6px">${roleBadge(m.role)} ${m.active ? '<span class="badge badge-hadir">Aktif</span>' : '<span class="badge badge-off">Nonaktif</span>'}</div></div>
            ${isAdmin ? `<div class="page-actions"><button class="btn btn-sm" id="d-edit">${icon('edit')} Ubah</button><button class="btn btn-sm" id="d-pw">${icon('key')} Reset password</button>${m.avatarVer ? `<button class="btn btn-sm" id="d-photo-del">Hapus foto</button>` : ''}<button class="btn btn-sm ${m.active ? 'btn-danger' : ''}" id="d-active">${m.active ? 'Nonaktifkan' : 'Aktifkan'}</button></div>` : ''}
          </div>
          <hr class="divider" />
          <dl class="kv">
            <dt>UID</dt><dd class="small" style="font-family:monospace">${esc(m.uid)}</dd>
            <dt>Username</dt><dd>@${esc(m.username)}</dd>
            <dt>Kelas</dt><dd>${esc(m.kelas || '-')}</dd>
            <dt>Jabatan</dt><dd>${esc(m.jabatan || '-')}</dd>
            <dt>Bergabung</dt><dd>${esc(fmtDate(m.joinedAt))}</dd>
            ${m.role === 'officer' ? `<dt>Izin pengurus</dt><dd>${[m.permissions.editAttendance && 'Ubah kehadiran', m.permissions.announce && 'Pengumuman', m.permissions.exportReports && 'Laporan'].filter(Boolean).join(', ') || 'Belum ada izin tambahan'}</dd>` : ''}
          </dl>
        </div></div>
        <div class="panel" style="margin-top:18px"><div class="panel-head"><h2>Rekap kehadiran</h2><strong class="num">${esc(pct(t.percentage))}</strong></div>
          <div class="panel-body"><div class="mini-stats">${chips}</div></div></div>
        <div class="panel" style="margin-top:18px"><div class="panel-head"><h2>Riwayat absensi</h2></div><div class="panel-body panel-flush" style="padding-top:12px">${
          r.records.length
            ? `<div class="table-wrap"><table class="table stackable"><thead><tr><th>Pertemuan</th><th>Tanggal</th><th>Status</th><th>Metode</th><th>Diubah oleh</th></tr></thead><tbody>${r.records.map((x) => `<tr><td class="cell-primary"><strong>${esc(x.meetingName)}</strong>${x.note ? `<div class="small muted">${esc(x.note)}</div>` : ''}</td><td data-label="Tanggal">${esc(fmtDateShort(x.meetingDate))}</td><td data-label="Status">${statusBadge(x.status)}</td><td data-label="Metode">${x.method === 'qr' ? 'Scan QR' : x.method === 'auto' ? 'Otomatis' : 'Manual'}</td><td data-label="Diubah oleh">${esc(x.updatedByName || '-')}</td></tr>`).join('')}</tbody></table></div>`
            : `<div class="panel-body">${emptyState({ iconName: 'history', title: 'Belum ada riwayat absensi' })}</div>`
        }</div></div>`;
      container.querySelector('#d-edit')?.addEventListener('click', async () => { if (await openMemberForm(m)) load(); });
      container.querySelector('#d-photo-del')?.addEventListener('click', async () => { try { if (await removePhoto(m, { own: false })) load(); } catch (err) { toast(err.message, 'error'); } });
      container.querySelector('#d-pw')?.addEventListener('click', () => openResetPassword(m));
      container.querySelector('#d-active')?.addEventListener('click', async (e) => {
        try { if (await toggleActive(m)) load(); } catch (err) { toast(err.message, 'error'); }
      });
    } catch (e) {
      if (isStale()) return;
      container.innerHTML = `<p style="margin-bottom:12px"><a href="#/members" class="small">${icon('chevronLeft')} Kembali</a></p><div class="panel">${errorState(e.message)}</div>`;
      container.querySelector('#retry')?.addEventListener('click', load);
    }
  }
  await load();
}
