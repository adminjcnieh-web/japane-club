// Halaman login + dialog ganti password.
import * as api from './api.js';
import { icon } from './icons.js';
import { esc } from './utils.js';
import { formModal, toast } from './ui.js';

export function renderLogin(root, { onSuccess, notice = '' }) {
  root.innerHTML = `
    <main class="login">
      <section class="login-art" aria-hidden="true">
        <div class="login-wordmark"><span class="brand-mark" style="background:#fff;box-shadow:0 0 0 4px rgba(255,255,255,.25)"></span>Japanese Club</div>
        <div class="login-kanji" lang="ja">日本語部</div>
        <p class="login-art-foot">Absensi dengan QR dinamis, daftar anggota, dan jadwal kegiatan dalam satu tempat.</p>
      </section>
      <section class="login-panel">
        <div class="login-box">
          <h1>Masuk</h1>
          <p>Gunakan username dan password dari admin Japanese Club.</p>
          <div id="login-notice">${notice ? `<div class="form-error" role="alert">${icon('alert')}<span>${esc(notice)}</span></div>` : ''}</div>
          <form id="login-form" novalidate>
            <div class="field">
              <label for="lg-user">Username</label>
              <input class="input" id="lg-user" name="username" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required />
            </div>
            <div class="field">
              <label for="lg-pass">Password</label>
              <div class="input-group">
                <input class="input" id="lg-pass" name="password" type="password" autocomplete="current-password" required />
                <button type="button" class="btn btn-quiet btn-icon" id="lg-toggle" aria-label="Tampilkan password">${icon('eye')}</button>
              </div>
            </div>
            <button class="btn btn-primary btn-block" id="lg-submit" type="submit">Masuk</button>
          </form>
          <p class="login-note">Belum punya akun? Anggota tidak mendaftar sendiri. Minta admin Japanese Club membuatkan akunmu.</p>
        </div>
      </section>
    </main>`;

  const form = root.querySelector('#login-form');
  const pass = root.querySelector('#lg-pass');
  const toggle = root.querySelector('#lg-toggle');
  const submit = root.querySelector('#lg-submit');
  const notice$ = root.querySelector('#login-notice');

  toggle.addEventListener('click', () => {
    const show = pass.type === 'password';
    pass.type = show ? 'text' : 'password';
    toggle.innerHTML = icon(show ? 'eyeOff' : 'eye');
    toggle.setAttribute('aria-label', show ? 'Sembunyikan password' : 'Tampilkan password');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = form.username.value.trim();
    const password = form.password.value;
    const showError = (msg) => {
      notice$.innerHTML = `<div class="form-error" role="alert">${icon('alert')}<span>${esc(msg)}</span></div>`;
    };
    if (!username || !password) return showError('Isi username dan password terlebih dahulu.');
    submit.disabled = true;
    submit.innerHTML = '<span class="spinner"></span> Memeriksa';
    try {
      const user = await api.login(username, password);
      onSuccess(user);
    } catch (err) {
      showError(err.message);
      submit.disabled = false;
      submit.textContent = 'Masuk';
      form.password.focus();
    }
  });
  root.querySelector('#lg-user').focus();
}

export function openChangePassword() {
  return formModal({
    title: 'Ganti password',
    submitLabel: 'Ganti password',
    html: `
      <div class="field"><label for="pw-cur">Password saat ini</label><input class="input" id="pw-cur" name="currentPassword" type="password" autocomplete="current-password" required /></div>
      <div class="field"><label for="pw-new">Password baru</label><input class="input" id="pw-new" name="newPassword" type="password" autocomplete="new-password" minlength="8" required /><span class="hint">Minimal 8 karakter, berisi huruf dan angka.</span></div>
      <div class="field"><label for="pw-new2">Ulangi password baru</label><input class="input" id="pw-new2" name="confirm" type="password" autocomplete="new-password" required /></div>
      <p class="small muted">Setelah berhasil, kamu akan diminta login ulang.</p>`,
    onSubmit: async (v) => {
      if (v.newPassword !== v.confirm) throw new Error('Password baru dan ulangannya tidak sama.');
      await api.post('/api/me/password', { currentPassword: v.currentPassword, newPassword: v.newPassword });
      toast('Password berhasil diganti. Silakan login ulang.');
      return true;
    },
  });
}
