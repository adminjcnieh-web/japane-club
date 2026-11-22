// Komponen UI bersama: toast, modal, dialog konfirmasi, kondisi kosong, lencana.
import { icon } from './icons.js';
import { esc, STATUS_LABEL, ROLE_LABEL, MEETING_STATUS_LABEL } from './utils.js';

// ---------- Toast ----------
export function toast(message, type = 'success') {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.innerHTML = `${icon(type === 'error' ? 'alert' : 'check')}<div>${esc(message)}</div>`;
  root.appendChild(el);
  setTimeout(() => el.remove(), type === 'error' ? 6500 : 3500);
}

// ---------- Modal ----------
let openCount = 0;

/**
 * Membuka modal. Mengembalikan { el, close, body, setBusy }.
 * opts: { title, html, wide, footer:[{label, kind, onClick, close}], onClose }
 */
export function openModal({ title, html = '', wide = false, footer = [], onClose, labelledBy = 'modal-title' }) {
  const root = document.getElementById('modal-root');
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  const previouslyFocused = document.activeElement;
  overlay.innerHTML = `
    <div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="${labelledBy}">
      <div class="modal-head">
        <h2 id="${labelledBy}">${esc(title)}</h2>
        <button type="button" class="btn btn-quiet btn-icon btn-sm" data-close aria-label="Tutup">${icon('x')}</button>
      </div>
      <div class="modal-body">${html}</div>
      ${footer.length ? `<div class="modal-foot"></div>` : ''}
    </div>`;
  root.appendChild(overlay);
  openCount++;
  document.body.style.overflow = 'hidden';

  const modal = overlay.querySelector('.modal');
  const body = overlay.querySelector('.modal-body');
  let closed = false;

  const close = (result) => {
    if (closed) return;
    closed = true;
    overlay.remove();
    openCount--;
    if (openCount <= 0) document.body.style.overflow = '';
    document.removeEventListener('keydown', onKey, true);
    try { previouslyFocused?.focus?.(); } catch { /* abaikan */ }
    onClose?.(result);
  };

  const buttons = [];
  const foot = overlay.querySelector('.modal-foot');
  for (const f of footer) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `btn ${f.kind ? 'btn-' + f.kind : ''}`;
    b.textContent = f.label;
    b.addEventListener('click', async () => {
      if (b.getAttribute('aria-busy') === 'true') return;
      if (f.onClick) {
        const r = await f.onClick(api);
        if (r === false) return;
      }
      if (f.close !== false) close(f.value);
    });
    foot.appendChild(b);
    buttons.push(b);
  }

  const focusables = () => [...modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled && x.offsetParent !== null);
  function onKey(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    } else if (e.key === 'Tab') {
      const f = focusables();
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  document.addEventListener('keydown', onKey, true);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('[data-close]').addEventListener('click', () => close());

  const api = {
    el: overlay,
    body,
    close,
    buttons,
    setBusy(btn, busy, label) {
      btn.setAttribute('aria-busy', busy ? 'true' : 'false');
      btn.disabled = !!busy;
      if (busy) { btn.dataset.label = btn.textContent; btn.innerHTML = `<span class="spinner"></span> ${esc(label || btn.textContent)}`; }
      else if (btn.dataset.label) btn.textContent = btn.dataset.label;
    },
    showError(msg) {
      let box = body.querySelector('.form-error');
      if (!box) {
        box = document.createElement('div');
        box.className = 'form-error';
        box.setAttribute('role', 'alert');
        body.prepend(box);
      }
      box.innerHTML = `${icon('alert')}<span>${esc(msg)}</span>`;
      body.scrollTop = 0;
    },
    clearError() { body.querySelector('.form-error')?.remove(); },
  };
  // fokus awal ke kolom pertama, kecuali pengguna sudah mengetuk/mengisi kolom lain (jangan merebut fokus)
  setTimeout(() => { if (modal.contains(document.activeElement) && document.activeElement !== modal) return; (modal.querySelector('input:not([type=hidden]), select, textarea') || buttons[buttons.length - 1] || modal.querySelector('[data-close]'))?.focus(); }, 30);
  return api;
}

/** Dialog konfirmasi. Mengembalikan Promise<boolean>. */
export function confirmDialog({ title, message, confirmLabel = 'Ya, lanjutkan', danger = false, cancelLabel = 'Batal' }) {
  return new Promise((resolve) => {
    let answer = false;
    openModal({
      title,
      html: `<p>${esc(message)}</p>`,
      footer: [
        { label: cancelLabel, value: false },
        { label: confirmLabel, kind: danger ? 'danger-solid' : 'primary', onClick: () => { answer = true; } },
      ],
      onClose: () => resolve(answer),
    });
  });
}

/**
 * Modal berisi formulir. onSubmit(values, modal) harus melempar error untuk ditampilkan di dalam modal.
 * Mengembalikan Promise yang selesai dengan hasil onSubmit (atau null bila dibatalkan).
 */
export function formModal({ title, html, submitLabel = 'Simpan', wide = false, onSubmit, onOpen }) {
  return new Promise((resolve) => {
    let result = null;
    const m = openModal({
      title,
      wide,
      html: `<form id="modal-form" novalidate>${html}</form>`,
      footer: [
        { label: 'Batal', value: null },
        {
          label: submitLabel,
          kind: 'primary',
          close: false,
          onClick: async (mod) => {
            const form = mod.body.querySelector('form');
            if (!form.reportValidity()) return false;
            mod.clearError();
            const btn = mod.buttons[1];
            mod.setBusy(btn, true, 'Menyimpan');
            try {
              const values = {};
              for (const el of form.elements) {
                if (!el.name || el.disabled) continue;
                if (el.type === 'checkbox') values[el.name] = el.checked;
                else if (el.type === 'radio') { if (el.checked) values[el.name] = el.value; }
                else values[el.name] = el.value;
              }
              result = await onSubmit(values, mod);
              mod.close(result);
            } catch (e) {
              mod.setBusy(btn, false);
              mod.showError(e.message || 'Terjadi kesalahan. Coba lagi.');
            }
            return false;
          },
        },
      ],
      onClose: () => resolve(result),
    });
    m.body.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      m.buttons[1].click();
    });
    onOpen?.(m);
  });
}

// ---------- Elemen kecil ----------
export const statusBadge = (s) => `<span class="badge badge-${esc(s)}">${esc(STATUS_LABEL[s] || s)}</span>`;
export const roleBadge = (r) => `<span class="badge badge-plain badge-role-${esc(r)}">${esc(ROLE_LABEL[r] || r)}</span>`;
export const meetingBadge = (s) => `<span class="badge badge-${esc(s)}">${esc(MEETING_STATUS_LABEL[s] || s)}</span>`;

export function emptyState({ iconName = 'calendar', title, text = '', action = '' }) {
  return `<div class="empty"><div class="empty-mark">${icon(iconName)}</div><h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}${action}</div>`;
}

export const loadingBlock = (text = 'Memuat data') => `<div class="loading-line" role="status"><span class="spinner"></span>${esc(text)}</div>`;

export function skeletonPage() {
  return `<div class="stack" aria-busy="true" aria-label="Memuat">
    <div class="skeleton" style="width:38%;height:28px"></div>
    <div class="skeleton skeleton-block"></div>
    <div class="grid-main"><div class="skeleton skeleton-block" style="height:260px"></div><div class="skeleton skeleton-block" style="height:260px"></div></div>
  </div>`;
}

export function errorState(message, retryId = 'retry') {
  return `<div class="empty"><div class="empty-mark" style="background:var(--bad-bg);color:var(--bad)">${icon('alert')}</div><h3>Data tidak bisa dimuat</h3><p>${esc(message)}</p><button class="btn" id="${retryId}">${icon('refresh')} Coba lagi</button></div>`;
}

export function pageHead({ title, subtitle = '', actions = '' }) {
  return `<div class="page-head"><div><h1>${esc(title)}</h1>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div>${actions ? `<div class="page-actions">${actions}</div>` : ''}</div>`;
}

/** Tombol yang menjalankan aksi async dengan indikator sibuk. */
export async function withBusy(btn, label, fn) {
  const original = btn.innerHTML;
  btn.setAttribute('aria-busy', 'true');
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> ${esc(label)}`;
  try {
    return await fn();
  } finally {
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
    btn.innerHTML = original;
  }
}
