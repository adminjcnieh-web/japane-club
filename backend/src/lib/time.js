// Helper waktu. Indonesia tidak memakai DST, jadi offset tetap (WIB = 420 menit).

export function tzOffset(env) {
  const n = Number(env.TZ_OFFSET_MINUTES);
  return Number.isFinite(n) ? n : 420;
}

/** Waktu mulai pertemuan (epoch ms) dari tanggal + jam lokal klub. */
export function localToMs(date, time, offsetMin) {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return Date.UTC(y, m - 1, d, hh, mm) - offsetMin * 60000;
}

/** Tanggal lokal klub (YYYY-MM-DD) untuk sebuah waktu. */
export function localDate(nowMs, offsetMin) {
  return new Date(nowMs + offsetMin * 60000).toISOString().slice(0, 10);
}

export function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Awal bulan (YYYY-MM-01) sebanyak `back` bulan sebelum bulan pada dateStr. */
export function monthStartBack(dateStr, back) {
  const [y, m] = dateStr.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 - back, 1));
  return d.toISOString().slice(0, 10);
}
