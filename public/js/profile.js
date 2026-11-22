// Profil pribadi (+ riwayat kehadiran), menu "Lainnya" untuk HP, dan pengaturan klub (admin).
import * as api from './api.js';
import { icon } from './icons.js';
import { esc, initials, fmtDate, fmtDateShort, STATUS_KEYS, STATUS_LABEL, ROLE_LABEL, pct } from './utils.js';
import { pageHead, toast, emptyState, errorState, skeletonPage, statusBadge, roleBadge, formModal, loadingBlock } from './ui.js';
import { openChangePassword } from './auth.js';
import { avatar } from './avatar.js';
import { openPhotoEditor, removePhoto } from './photo.js';

export async function profileView({ container, user, isStale }) {
  container.innerHTML = skeletonPage();
  async function load() {
    try {
      const r = await api.get(`/api/members/${user.uid}/attendance`);
      if (isStale()) return;
      const m = r.member, t = r.summary;
      const me = { ...user, ...(api.getSession()?.user || {}) };
      container.innerHTML = pageHead({ title: 'Profil saya' }) + `
        <div class="panel"><div class="panel-body">
          <div class="row" style="gap:18px;align-items:center">
            ${avatar(me, { size: 'xl', full: true })}
            <div class="grow"><h2 style="font-size:1.35rem">${esc(m.fullName)}</h2><div class="row" style="margin-top:6px">${roleBadge(m.role)}<span class="muted small">@${esc(m.username)}</span></div>
              <div class="row" style="margin-top:10px;gap:8px"><button class="btn btn-sm" id="pf-photo">${icon('camera')} Ganti foto</button>${me.avatarVer ? `<button class="btn btn-sm btn-danger" id="pf-photo-del">Hapus foto</button>` : ''}</div></div>
          </div>
          <hr class="divider" />
          <dl class="kv"><dt>Kelas</dt><dd>${esc(m.kelas || '-')}</dd><dt>Jabatan</dt><dd>${esc(m.jabatan || '-')}</dd><dt>Bergabung</dt><dd>${esc(fmtDate(m.joinedAt))}</dd></dl>
          <div class="page-actions" style="margin-top:18px"><button class="btn" id="pf-pw">${icon('lock')} Ganti password</button><button class="btn btn-danger" id="pf-out">${icon('logout')} Keluar</button></div>
        </div></div>
        <div class="panel" style="margin-top:18px"><div class="panel-head"><h2>Rekap kehadiranku</h2><strong class="num">${esc(pct(t.percentage))}</strong></div><div class="panel-body"><div class="mini-stats">${STATUS_KEYS.map((k) => `<div><strong>${t[k]}</strong><span>${STATUS_LABEL[k]}</span></div>`).join('')}</div></div></div>
        <div class="panel" style="margin-top:18px"><div class="panel-head"><h2>Riwayat kehadiran</h2></div><div class="panel-body panel-flush" style="padding-top:12px">${
          r.records.length
            ? `<div class="table-wrap"><table class="table stackable"><thead><tr><th>Pertemuan</th><th>Tanggal</th><th>Status</th><th>Metode</th></tr></thead><tbody>${r.records.map((x) => `<tr><td class="cell-primary"><strong>${esc(x.meetingName)}</strong>${x.note ? `<div class="small muted">${esc(x.note)}</div>` : ''}</td><td data-label="Tanggal">${esc(fmtDateShort(x.meetingDate))}</td><td data-label="Status">${statusBadge(x.status)}</td><td data-label="Metode">${x.method === 'qr' ? 'Scan QR' : x.method === 'auto' ? 'Otomatis' : 'Diinput pengurus'}</td></tr>`).join('')}</tbody></table></div>`
            : `<div class="panel-body">${emptyState({ iconName: 'history', title: 'Belum ada riwayat', text: 'Kehadiranmu akan muncul di sini setelah pertemuan pertama.' })}</div>`
        }</div></div>`;
      container.querySelector('#pf-photo').addEventListener('click', async () => { if (await openPhotoEditor(me)) load(); });
      container.querySelector('#pf-photo-del')?.addEventListener('click', async () => { if (await removePhoto(me)) load(); });
      container.querySelector('#pf-pw').addEventListener('click', async () => {
        if (await openChangePassword()) { api.logout(); window.dispatchEvent(new CustomEvent('jcms:logout', { detail: { reason: 'Password sudah diganti. Silakan login dengan password baru.' } })); }
      });
      container.querySelector('#pf-out').addEventListener('click', () => { api.logout(); window.dispatchEvent(new CustomEvent('jcms:logout', { detail: { reason: '' } })); });
    } catch (e) {
      if (isStale()) return;
      container.innerHTML = pageHead({ title: 'Profil saya' }) + `<div class="panel">${errorState(e.message)}</div>`;
      container.querySelector('#retry')?.addEventListener('click', load);
    }
  }
  await load();
}

export async function moreView({ container, user }, { navFor, doLogout }) {
  const nav = navFor(user);
  const items = [...nav.side, ...(nav.extra || [])].filter(([href]) => !['/', '/meetings', '/members', '/announcements'].includes(href));
  container.innerHTML = pageHead({ title: 'Menu' }) + `
    <div class="panel"><div class="panel-body panel-flush" style="padding:6px 0">
      ${items.map(([href, label, ic]) => `<a class="event" href="#${href}" style="padding:14px 20px;text-decoration:none;color:inherit;align-items:center">${icon(ic)}<span class="grow" style="font-weight:700">${esc(label)}</span>${icon('chevronRight')}</a>`).join('')}
      <button class="event" id="more-out" style="padding:14px 20px;width:100%;background:none;border:0;border-top:1px solid var(--line-soft);text-align:left;align-items:center;cursor:pointer;color:var(--bad)">${icon('logout')}<span class="grow" style="font-weight:700">Keluar</span></button>
    </div></div>`;
  container.querySelector('#more-out').addEventListener('click', () => doLogout());
}

export async function settingsView({ container, isStale }) {
  container.innerHTML = pageHead({ title: 'Pengaturan klub' }) + `<div class="panel">${loadingBlock()}</div>`;
  try {
    const { settings: s } = await api.get('/api/settings');
    if (isStale()) return;
    container.innerHTML = pageHead({ title: 'Pengaturan klub', subtitle: 'Informasi ini tampil di aplikasi dan menjadi nilai bawaan pertemuan baru.' }) + `
      <div class="panel"><div class="panel-body"><form id="st-form" novalidate style="max-width:560px">
        <div class="field"><label for="st-name">Nama klub</label><input class="input" id="st-name" name="clubName" maxlength="60" minlength="2" required value="${esc(s.clubName)}" /></div>
        <div class="field"><label for="st-desc">Deskripsi singkat</label><textarea class="textarea" id="st-desc" name="description" maxlength="300" style="min-height:80px">${esc(s.description)}</textarea></div>
        <div class="field"><label for="st-contact">Kontak pembina atau pengurus</label><input class="input" id="st-contact" name="contact" maxlength="100" value="${esc(s.contact)}" /></div>
        <div class="field"><label for="st-late">Batas terlambat bawaan (menit)</label><input class="input" id="st-late" name="defaultLateMinutes" type="number" min="0" max="180" inputmode="numeric" required value="${esc(s.defaultLateMinutes)}" /><span class="hint">Dipakai bila pertemuan baru tidak mengatur batas sendiri.</span></div>
        <div class="field"><label for="st-hearts">Jumlah nyawa di Learning Center</label><input class="input" id="st-hearts" name="learningHearts" type="number" min="1" max="10" inputmode="numeric" required value="${esc(s.learningHearts)}" /><span class="hint">Berapa kali boleh salah dalam satu level (1 sampai 10).</span></div>
        <div id="st-err"></div>
        <button class="btn btn-primary" type="submit" id="st-save">Simpan pengaturan</button>
      </form></div></div>`;
    const form = container.querySelector('#st-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      const btn = container.querySelector('#st-save');
      btn.disabled = true;
      container.querySelector('#st-err').innerHTML = '';
      try {
        const r = await api.put('/api/settings', { clubName: form.clubName.value.trim(), description: form.description.value.trim(), contact: form.contact.value.trim(), defaultLateMinutes: Number(form.defaultLateMinutes.value), learningHearts: Number(form.learningHearts.value) });
        for (const id of ['club-name', 'club-name-m']) { const el = document.getElementById(id); if (el) el.textContent = r.settings.clubName; }
        toast('Pengaturan disimpan.');
      } catch (err) {
        container.querySelector('#st-err').innerHTML = `<div class="form-error" role="alert">${icon('alert')}<span>${esc(err.message)}</span></div>`;
      } finally { btn.disabled = false; }
    });
  } catch (e) {
    if (isStale()) return;
    container.innerHTML = pageHead({ title: 'Pengaturan klub' }) + `<div class="panel">${errorState(e.message)}</div>`;
    container.querySelector('#retry')?.addEventListener('click', () => location.reload());
  }
}
