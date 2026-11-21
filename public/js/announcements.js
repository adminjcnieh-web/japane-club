// Pengumuman: daftar, detail, buat/ubah/hapus (dengan izin), jadwal publikasi.
import * as api from './api.js';
import { icon } from './icons.js';
import { esc, fmtDateTime, fmtDateShort } from './utils.js';
import { pageHead, formModal, confirmDialog, openModal, toast, emptyState, errorState, loadingBlock } from './ui.js';

// WIB = UTC+7 tetap. Mengubah <input type=datetime-local> (WIB) <-> ISO UTC.
const WIB_MS = 7 * 3600000;
const toLocalInput = (iso) => new Date(new Date(iso).getTime() + WIB_MS).toISOString().slice(0, 16);
const fromLocalInput = (s) => new Date(new Date(s + ':00Z').getTime() - WIB_MS).toISOString();

export function openAnnouncement(a) {
  if (!a) return;
  openModal({
    title: a.title,
    html: `<p class="small muted" style="margin-bottom:12px">${esc(fmtDateTime(a.publishAt))} oleh ${esc(a.createdByName)}${a.published ? '' : ' &middot; <span class="badge badge-izin">Belum terbit</span>'}</p><p style="white-space:pre-wrap;line-height:1.7">${esc(a.body)}</p>`,
    footer: [{ label: 'Tutup', kind: 'primary' }],
  });
}

function form(a) {
  return `
    <div class="field"><label for="an-title">Judul</label><input class="input" id="an-title" name="title" maxlength="120" minlength="3" required value="${esc(a?.title || '')}" /></div>
    <div class="field"><label for="an-body">Isi pengumuman</label><textarea class="textarea" id="an-body" name="body" maxlength="5000" required style="min-height:160px">${esc(a?.body || '')}</textarea></div>
    <div class="field"><label for="an-pub">Tanggal dan jam terbit (WIB)</label><input class="input" id="an-pub" name="publishAt" type="datetime-local" value="${a ? esc(toLocalInput(a.publishAt)) : esc(toLocalInput(new Date().toISOString()))}" required /><span class="hint">Atur ke waktu mendatang untuk menjadwalkan. Anggota baru melihatnya setelah waktu itu.</span></div>`;
}

export function openAnnouncementForm(a) {
  return formModal({
    title: a ? 'Ubah pengumuman' : 'Buat pengumuman',
    submitLabel: a ? 'Simpan perubahan' : 'Terbitkan',
    wide: true,
    html: form(a),
    onSubmit: async (v) => {
      const body = { title: v.title.trim(), body: v.body.trim(), publishAt: fromLocalInput(v.publishAt) };
      const r = a ? await api.patch(`/api/announcements/${a.id}`, body) : await api.post('/api/announcements', body);
      toast(a ? 'Pengumuman diperbarui.' : 'Pengumuman dibuat.');
      return r.announcement;
    },
  });
}

export async function announcementsView({ container, user, can, isStale }) {
  const canWrite = can('announce');
  let list = [];
  container.innerHTML = pageHead({ title: 'Pengumuman' }) + `<div class="panel">${loadingBlock()}</div>`;

  const mine = (a) => user.role === 'admin' || a.createdBy === user.uid;

  async function add() { if (await openAnnouncementForm(null)) await load(); }

  function paint() {
    container.innerHTML = pageHead({
      title: 'Pengumuman',
      subtitle: 'Informasi terbaru dari pengurus Japanese Club.',
      actions: canWrite ? `<button class="btn btn-primary" id="an-add">${icon('plus')} Buat pengumuman</button>` : '',
    }) + `<div class="panel"><div class="panel-body">${
      list.length
        ? list.map((a) => `
          <article class="event" style="align-items:flex-start">
            <div class="grow">
              <button class="note-item" data-open="${esc(a.id)}" style="padding:0;border:0"><h3>${esc(a.title)}</h3><p style="margin-top:4px">${esc(a.body)}</p></button>
              <div class="small muted" style="margin-top:6px">${esc(fmtDateTime(a.publishAt))} &middot; ${esc(a.createdByName)} ${a.published ? '' : '<span class="badge badge-izin" style="margin-left:6px">Dijadwalkan</span>'}</div>
            </div>
            ${canWrite && mine(a) ? `<div class="row" style="flex:none"><button class="btn btn-sm btn-icon" data-edit="${esc(a.id)}" aria-label="Ubah ${esc(a.title)}">${icon('edit')}</button><button class="btn btn-sm btn-icon btn-danger" data-del="${esc(a.id)}" aria-label="Hapus ${esc(a.title)}">${icon('trash')}</button></div>` : ''}
          </article>`).join('')
        : emptyState({ iconName: 'megaphone', title: 'Belum ada pengumuman', text: canWrite ? 'Tulis pengumuman pertama untuk anggota.' : 'Pengumuman dari pengurus akan tampil di sini.', action: canWrite ? '<button class="btn btn-primary" data-add>Buat pengumuman</button>' : '' })
    }</div></div>`;
    container.querySelector('#an-add')?.addEventListener('click', add);
    container.querySelector('[data-add]')?.addEventListener('click', add);
    container.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openAnnouncement(list.find((a) => a.id === b.dataset.open))));
    container.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', async () => { if (await openAnnouncementForm(list.find((a) => a.id === b.dataset.edit))) await load(); }));
    container.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      const a = list.find((x) => x.id === b.dataset.del);
      const ok = await confirmDialog({ title: 'Hapus pengumuman?', message: `"${a.title}" akan dihapus permanen dan tidak bisa dikembalikan.`, confirmLabel: 'Hapus', danger: true });
      if (!ok) return;
      try { await api.del(`/api/announcements/${a.id}`); toast('Pengumuman dihapus.'); await load(); } catch (e) { toast(e.message, 'error'); }
    }));
  }

  async function load() {
    try {
      const r = await api.get('/api/announcements');
      if (isStale()) return;
      list = r.announcements;
      paint();
    } catch (e) {
      if (isStale()) return;
      container.innerHTML = pageHead({ title: 'Pengumuman' }) + `<div class="panel">${errorState(e.message)}</div>`;
      container.querySelector('#retry')?.addEventListener('click', load);
    }
  }
  await load();
}
