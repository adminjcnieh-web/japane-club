// Notifikasi push (khusus admin, khusus aplikasi APK). Memakai plugin Capacitor "PushNotifications"
// yang dipanggil lewat jembatan native, sama seperti Filesystem/Share di utils.js.
// Bila plugin tidak ada di APK (belum dipasang), semua fungsi diam saja.
import * as api from './api.js';
import { isApp } from './utils.js';

const KEY = 'jc.pushToken';
let listening = false;

function cap() {
  const c = window.Capacitor;
  if (!isApp() || !c || typeof c.nativePromise !== 'function') return null;
  if (typeof c.isPluginAvailable === 'function' && !c.isPluginAvailable('PushNotifications')) return null;
  return c;
}

export const pushSupported = () => !!cap();

async function send(token) {
  try { localStorage.setItem(KEY, token); } catch { /* abaikan */ }
  try { await api.put('/api/push/token', { token }); } catch { /* coba lagi saat buka berikutnya */ }
}

/** Dipanggil setelah admin masuk. Meminta izin lalu mendaftarkan perangkat. */
export async function initPush(user) {
  const c = cap();
  if (!c || !user || user.role !== 'admin') return;
  try {
    if (!listening && typeof c.addListener === 'function') {
      listening = true;
      c.addListener('PushNotifications', 'registration', (t) => { if (t?.value) send(t.value); });
    }
    let p = await c.nativePromise('PushNotifications', 'checkPermissions', {});
    if (p?.receive === 'prompt' || p?.receive === 'prompt-with-rationale') p = await c.nativePromise('PushNotifications', 'requestPermissions', {});
    if (p?.receive !== 'granted') return;
    await c.nativePromise('PushNotifications', 'register', {});
  } catch { /* push tidak boleh mengganggu aplikasi */ }
}

/** Dipanggil sebelum keluar akun supaya HP ini tidak lagi menerima notifikasi admin. */
export async function stopPush() {
  let token = null;
  try { token = localStorage.getItem(KEY); localStorage.removeItem(KEY); } catch { /* abaikan */ }
  if (!token) return;
  try { await api.api('DELETE', '/api/push/token', { token }); } catch { /* abaikan */ }
}
