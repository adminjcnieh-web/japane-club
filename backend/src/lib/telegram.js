// Kirim pesan ke Telegram lewat bot. Token dan chat id disimpan sebagai rahasia Cloudflare (bukan di kode).
import { HttpError } from './http.js';

export const telegramConfigured = (env) => !!(env.TELEGRAM_BOT_TOKEN && String(env.TELEGRAM_CHAT_ID || '').trim());

/** Teks polos (tanpa format) supaya nama anggota tidak bisa merusak pesan. */
export async function sendTelegram(env, text) {
  if (!telegramConfigured(env)) throw new HttpError(400, 'Telegram belum diatur. Isi TELEGRAM_BOT_TOKEN dan TELEGRAM_CHAT_ID di Cloudflare.', 'telegram_not_configured');
  const ids = String(env.TELEGRAM_CHAT_ID).split(',').map((s) => s.trim()).filter(Boolean);
  for (const chat_id of ids) {
    let res;
    try {
      res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id, text, disable_web_page_preview: true }),
      });
    } catch {
      throw new HttpError(502, 'Tidak bisa menghubungi Telegram. Coba lagi nanti.', 'telegram_unreachable');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      // Pesan galat Telegram aman ditampilkan (tidak berisi token).
      throw new HttpError(502, `Telegram menolak pesan: ${data.description || res.status}`, 'telegram_error');
    }
  }
}
