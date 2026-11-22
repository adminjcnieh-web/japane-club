// Foto profil: avatar inisial sebagai bawaan; foto dimuat belakangan lewat API (butuh login),
// disimpan sebagai blob URL di memori. URL berversi (?v=) sehingga cache browser berlaku 1 tahun.
import * as api from './api.js';
import { esc, initials } from './utils.js';

const cache = new Map(); // "uid|ver|size" -> Promise<blobUrl|null>
let observer = null;

/** HTML avatar. size: sm | md | lg | xl | hero. */
export function avatar(u, { size = 'md', full = false } = {}) {
  const uid = u.uid || u.id;
  const cls = size === 'md' ? '' : ` avatar-${size}`;
  const attrs = ` data-av-id="${esc(uid)}" data-av-size="${full ? 'full' : 'thumb'}"${u.avatarVer ? ` data-av-uid="${esc(uid)}" data-av-ver="${esc(u.avatarVer)}"` : ''}`;
  return `<span class="avatar${cls}"${attrs} aria-hidden="true">${esc(initials(u.fullName || u.name || '?'))}</span>`;
}

function load(uid, ver, size) {
  const key = `${uid}|${ver}|${size}`;
  if (!cache.has(key)) {
    cache.set(key, api.blob(`/api/avatars/${encodeURIComponent(uid)}?v=${encodeURIComponent(ver)}${size === 'thumb' ? '&size=thumb' : ''}`).then((b) => URL.createObjectURL(b)).catch(() => null));
  }
  return cache.get(key);
}

export function hydrate(root = document) {
  root.querySelectorAll?.('[data-av-uid]:not([data-av-done])').forEach(async (el) => {
    const { avUid, avVer, avSize } = el.dataset;
    el.dataset.avDone = avVer;
    const url = await load(avUid, avVer, avSize);
    if (!url || !el.isConnected || el.dataset.avDone !== avVer) return;
    const img = new Image();
    img.alt = '';
    img.decoding = 'async';
    img.onload = () => { el.textContent = ''; el.appendChild(img); };
    img.src = url;
  });
}

/** Pasang pengamat sekali: setiap avatar baru di halaman otomatis memuat fotonya. */
export function initAvatars() {
  if (observer) return;
  observer = new MutationObserver((muts) => {
    for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) { if (n.matches?.('[data-av-uid]')) hydrate(n.parentNode); hydrate(n); }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  hydrate(document);
}

/** Setelah foto berubah/dihapus: lupakan cache pengguna itu dan perbarui semua avatar yang tampil. */
export function refreshAvatar(user) {
  const uid = user.uid;
  for (const k of [...cache.keys()]) if (k.startsWith(uid + '|')) cache.delete(k);
  document.querySelectorAll(`[data-av-id="${CSS.escape(uid)}"]`).forEach((el) => {
    el.removeAttribute('data-av-done');
    el.textContent = initials(user.fullName);
    if (user.avatarVer) { el.dataset.avUid = uid; el.dataset.avVer = user.avatarVer; }
    else { delete el.dataset.avUid; delete el.dataset.avVer; }
  });
  hydrate(document);
}
