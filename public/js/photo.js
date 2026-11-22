// Unggah foto profil: pilih file -> validasi -> crop (geser + zoom) -> pratinjau -> kompres -> simpan.
// Hasil selalu JPEG: 256x256 (maks 55 KB) dan 64x64 (maks 7 KB). Disimpan lewat API, bukan Firebase Storage.
import * as api from './api.js';
import { icon } from './icons.js';
import { openModal, toast, confirmDialog } from './ui.js';
import { refreshAvatar } from './avatar.js';

const MAX_FILE = 8 * 1024 * 1024; // 8 MB sebelum dikompres
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const S = 300; // ukuran kanvas crop

function toJpegB64(canvas, maxBytes) {
  let q = 0.9;
  for (let i = 0; i < 8; i++) {
    const b64 = canvas.toDataURL('image/jpeg', q).split(',')[1];
    if (Math.ceil((b64.length * 3) / 4) <= maxBytes) return b64;
    q -= 0.1;
  }
  throw new Error('Foto terlalu rumit untuk dikompres. Pilih foto lain.');
}

function render(bmp, canvas, st) {
  const ctx = canvas.getContext('2d');
  const scale = (S / Math.min(bmp.width, bmp.height)) * st.zoom;
  const w = bmp.width * scale, h = bmp.height * scale;
  const maxX = Math.max(0, (w - S) / 2), maxY = Math.max(0, (h - S) / 2);
  st.ox = Math.min(maxX, Math.max(-maxX, st.ox));
  st.oy = Math.min(maxY, Math.max(-maxY, st.oy));
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, S, S);
  ctx.drawImage(bmp, S / 2 - w / 2 + st.ox, S / 2 - h / 2 + st.oy, w, h);
}

function outputCanvas(bmp, st, size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const k = size / S;
  const scale = (S / Math.min(bmp.width, bmp.height)) * st.zoom * k;
  const w = bmp.width * scale, h = bmp.height * scale;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size, size);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, size / 2 - w / 2 + st.ox * k, size / 2 - h / 2 + st.oy * k, w, h);
  return c;
}

/** Membuka dialog ganti foto. Mengembalikan pengguna terbaru, atau null bila dibatalkan. */
export function openPhotoEditor(user) {
  return new Promise((resolve) => {
    let result = null, bmp = null;
    const st = { zoom: 1, ox: 0, oy: 0 };
    const m = openModal({
      title: 'Foto profil',
      html: `<div class="crop-wrap" id="ph-body">
        <p class="muted small" style="text-align:center">Pilih foto JPG, PNG, atau WebP (maksimal 8 MB). Foto akan dipotong persegi dan dikecilkan otomatis.</p>
        <label class="btn btn-primary" for="ph-file">${icon('camera')} Pilih foto</label>
        <input id="ph-file" type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" />
        <div class="form-error hidden" id="ph-err" role="alert"></div>
      </div>`,
      footer: [{ label: 'Batal', value: null }, { label: 'Simpan foto', kind: 'primary', close: false, onClick: save }],
      onClose: () => resolve(result),
    });
    const saveBtn = m.buttons[1];
    saveBtn.disabled = true;
    const body = m.body.querySelector('#ph-body');
    const err = (t) => { const e = body.querySelector('#ph-err'); e.textContent = t; e.classList.toggle('hidden', !t); };

    body.querySelector('#ph-file').addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      err('');
      if (!TYPES.includes(file.type)) return err('Jenis file tidak didukung. Pakai JPG, PNG, atau WebP.');
      if (file.size > MAX_FILE) return err(`File terlalu besar (${(file.size / 1048576).toFixed(1)} MB). Maksimal 8 MB.`);
      try {
        bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(file));
      } catch { return err('File ini bukan gambar yang bisa dibaca.'); }
      if (bmp.width < 64 || bmp.height < 64) return err('Gambar terlalu kecil (minimal 64 x 64 piksel).');
      showCrop();
    });

    function showCrop() {
      body.innerHTML = `
        <div class="crop-stage" id="ph-stage"><canvas width="${S}" height="${S}"></canvas></div>
        <div class="crop-zoom"><label class="small muted" for="ph-zoom">Perbesar</label><input id="ph-zoom" type="range" min="1" max="3" step="0.01" value="1" /></div>
        <div class="crop-preview"><canvas id="ph-prev" width="64" height="64"></canvas><span>Pratinjau. Geser foto untuk mengatur posisi.</span></div>
        <div class="form-error hidden" id="ph-err" role="alert"></div>
        <label class="btn btn-quiet btn-sm" for="ph-file2">Ganti pilihan</label><input id="ph-file2" type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" />`;
      const canvas = body.querySelector('#ph-stage canvas');
      const prev = body.querySelector('#ph-prev');
      const paint = () => {
        render(bmp, canvas, st);
        const pc = prev.getContext('2d');
        pc.clearRect(0, 0, 64, 64);
        pc.drawImage(canvas, 0, 0, 64, 64);
      };
      paint();
      saveBtn.disabled = false;
      body.querySelector('#ph-zoom').addEventListener('input', (e) => { st.zoom = Number(e.target.value); paint(); });
      const stage = body.querySelector('#ph-stage');
      let drag = null;
      stage.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; stage.setPointerCapture(e.pointerId); });
      stage.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const k = S / stage.getBoundingClientRect().width;
        st.ox += (e.clientX - drag.x) * k; st.oy += (e.clientY - drag.y) * k;
        drag = { x: e.clientX, y: e.clientY };
        paint();
      });
      const end = () => { drag = null; };
      stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
      body.querySelector('#ph-file2').addEventListener('change', async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        if (!TYPES.includes(f.type) || f.size > MAX_FILE) return err('File tidak sesuai (JPG/PNG/WebP, maksimal 8 MB).');
        try { bmp = await createImageBitmap(f, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(f)); st.zoom = 1; st.ox = st.oy = 0; showCrop(); } catch { err('File ini bukan gambar yang bisa dibaca.'); }
      });
    }

    async function save() {
      if (!bmp) return false;
      m.setBusy(saveBtn, true, 'Menyimpan');
      try {
        const image = toJpegB64(outputCanvas(bmp, st, 256), 55000);
        const thumb = toJpegB64(outputCanvas(bmp, st, 64), 7000);
        const r = await api.put('/api/me/avatar', { image, thumb });
        result = r.user;
        api.updateUser(r.user);
        refreshAvatar(r.user);
        toast('Foto profil diperbarui.');
        m.close(result);
      } catch (e) {
        m.setBusy(saveBtn, false);
        err(e.message || 'Foto gagal disimpan. Coba lagi.');
      }
      return false;
    }
  });
}

export async function removePhoto(user, { own = true } = {}) {
  const ok = await confirmDialog({ title: 'Hapus foto profil?', message: own ? 'Foto dihapus dan diganti avatar inisial. Kamu bisa mengunggah lagi kapan saja.' : `Foto profil ${user.fullName} akan dihapus.`, confirmLabel: 'Hapus foto', danger: true });
  if (!ok) return null;
  const r = own ? await api.del('/api/me/avatar') : await api.del(`/api/members/${user.uid}/avatar`);
  const updated = own ? r.user : { ...user, avatarVer: null };
  if (own) api.updateUser(updated);
  refreshAvatar(updated);
  toast('Foto profil dihapus.');
  return updated;
}
