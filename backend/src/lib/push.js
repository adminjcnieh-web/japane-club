// Notifikasi push ke HP lewat Firebase Cloud Messaging (FCM v1). Memakai service account yang sama dengan Firestore.
// Token perangkat disimpan di koleksi "pushTokens/{sha256(token)}" = { uid, token, createdAt }.
import { getAccessToken } from './google.js';
import { op } from './firestore.js';

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export async function tokenId(token) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
}

/** Kirim ke semua perangkat admin. Token yang sudah tidak berlaku dihapus otomatis. Tidak pernah melempar galat. */
export async function sendPushToAdmins(env, fs, title, body) {
  const out = { sent: 0, removed: 0, failed: 0 };
  let devices;
  try { devices = await fs.list('pushTokens'); } catch { return out; }
  if (!devices.length) return out;
  const users = new Map((await fs.list('users')).map((u) => [u.id, u]));
  const targets = devices.filter((d) => { const u = users.get(d.uid); return u && u.active && u.role === 'admin'; });
  const stale = devices.filter((d) => !targets.includes(d));
  let access;
  try { access = await getAccessToken(env); } catch { out.failed = targets.length; return out; }
  const dead = [...stale];
  for (const d of targets) {
    try {
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/messages:send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${access}` },
        body: JSON.stringify({ message: { token: d.token, notification: { title, body }, android: { priority: 'HIGH' } } }),
      });
      if (res.ok) out.sent++;
      else if (res.status === 404 || res.status === 400 || res.status === 403) {
        const t = await res.text().catch(() => '');
        if (/UNREGISTERED|INVALID_ARGUMENT|NOT_FOUND|SENDER_ID_MISMATCH/.test(t) || res.status === 404) dead.push(d); else out.failed++;
      } else out.failed++;
    } catch { out.failed++; }
  }
  if (dead.length) {
    try { await fs.commit(dead.map((d) => op.delete(`pushTokens/${d.id}`))); out.removed = dead.length; } catch { /* abaikan */ }
  }
  return out;
}
