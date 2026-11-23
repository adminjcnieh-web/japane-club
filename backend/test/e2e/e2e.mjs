// Pengujian end-to-end di browser sungguhan (Chromium + Playwright) terhadap aplikasi lengkap:
// frontend asli + Worker asli + Firebase TIRUAN + kamera palsu. Lihat lib-stubs.js untuk pustaka yang diganti.
// Jalankan: node backend/test/e2e/e2e.mjs   (butuh python3 + OpenCV untuk pembantu QR)
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { startServer } from './dev-server.mjs';
import { STUBS, CDN } from './lib-stubs.js';
import { makeToken } from '../../src/lib/qr-token.js';
import worker from '../../src/index.js';
import { resetRateLimits } from '../../src/lib/ratelimit.js';
import { clearDashboardCache } from '../../src/routes/dashboard.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = process.env.SHOTS_DIR || path.join(os.tmpdir(), 'jc-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jc-e2e-'));

const results = [];
async function step(name, fn) {
  const t = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - t });
    console.log(`  PASS  ${name}`);
  } catch (e) {
    results.push({ name, ok: false, ms: Date.now() - t, error: String(e.message || e).split('\n')[0] });
    for (const pg of globalThis.__pages || []) { try { const t = await pg.locator('.form-error, .toast-error').first().innerText({ timeout: 300 }); console.log('        [diagnosa] ' + t); } catch { /* tidak ada */ } }
    console.log(`  FAIL  ${name}\n        ${String(e.stack || e).split('\n').slice(0, 4).join('\n        ')}`);
  }
}

// ---------- infrastruktur ----------
const helper = spawn('python3', ['-I', path.join(here, 'qr_helper.py'), 'serve', '8791'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1500));
const srv = await startServer({ port: 8788 });
const { fake } = srv;
const URL_ = srv.url;

const clubToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
const clubTime = (offsetMin = 0) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(Date.now() + offsetMin * 60000));

fake.seedUser({ uid: 'uidAdmin001', username: 'admin1', fullName: 'Admin Satu', role: 'admin' });
fake.seedUser({ uid: 'uidOff00001', username: 'off1', fullName: 'Officer Satu', role: 'officer' });
fake.seedUser({ uid: 'uidOff00002', username: 'off2', fullName: 'Officer Dua', role: 'officer', permissions: { editAttendance: true, announce: true, exportReports: true } });
fake.seedUser({ uid: 'uidMem00001', username: 'mem1', fullName: 'Ani Member', role: 'member', kelas: 'X-1' });
fake.seedUser({ uid: 'uidMem00002', username: 'mem2', fullName: 'Budi Member', role: 'member', kelas: 'X-1' });
fake.seedUser({ uid: 'uidMem00003', username: 'mem3', fullName: 'Cici Member', role: 'member', kelas: 'X-2' });
fake.seedUser({ uid: 'uidOld00001', username: 'old1', fullName: 'Dodi Nonaktif', role: 'member', active: false });

const browserNormal = await chromium.launch();
const pageErrors = [];

async function newPage(browser, { width = 1280, height = 800, mobile = false, label = '' } = {}) {
  const ctx = await browser.newContext({
    // Aplikasi (APK) menandai dirinya di User-Agent; tes meniru itu kecuali label 'web*'.
    ...(label.startsWith('web') ? {} : { userAgent: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browser.version()} Safari/537.36 JapaneseClubApp/1.0` }),
    viewport: { width, height },
    deviceScaleFactor: 1,
    isMobile: mobile,
    hasTouch: mobile,
    permissions: [],
  });
  // musik dimatikan di tes biasa supaya CPU runner tidak terbebani; tes musik memakai label 'music*'
  if (!label.startsWith('music')) await ctx.addInitScript((k) => { try { if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify({ autoplay: false })); } catch {} }, 'jcms.music.v1');
  if (!label.startsWith('intro')) await ctx.addInitScript(() => { try { sessionStorage.setItem('jc.intro', '1'); } catch {} });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  (globalThis.__pages = globalThis.__pages || []).push(page);
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.route(/cdn\.jsdelivr\.net/, (r) => {
    const file = r.request().url().split('/').pop();
    const key = CDN[file];
    if (!key) return r.abort();
    return r.fulfill({ status: 200, contentType: 'text/javascript', body: STUBS[key] });
  });
  page.on('pageerror', (e) => pageErrors.push(`[${label}] pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED|net::ERR/.test(m.text())) pageErrors.push(`[${label}] console.error: ${m.text()}`);
    if (/Content Security Policy|Refused to/.test(m.text())) pageErrors.push(`[${label}] CSP: ${m.text()}`);
  });
  return page;
}

async function loginUI(page, username, password = 'Passw0rd!') {
  resetRateLimits(); // tes membuat banyak login dari satu alamat; pembatasan login diuji terpisah di tes API
  await page.goto(URL_ + '/');
  await page.waitForSelector('#login-form');
  await page.fill('#lg-user', username);
  await page.fill('#lg-pass', password);
  await page.click('#lg-submit');
}
async function loginOk(page, username, password) {
  await loginUI(page, username, password);
  await page.waitForSelector('.shell');
}
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, name + '.png') });
const noOverflow = async (page) => {
  const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  assert.ok(o.sw <= o.iw + 1, `overflow horizontal: scrollWidth ${o.sw} > ${o.iw}`);
};
const toastText = (page) => page.locator('#toast-root .toast').last().innerText();


// ---- helper tambahan ----
async function callApi(method, apiPath, token, body) {
  const res = await worker.fetch(new Request('http://x' + apiPath, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined }), srv.env);
  return { status: res.status, data: await res.json() };
}
async function apiLogin(username) {
  resetRateLimits();
  const r = await callApi('POST', '/api/auth/login', null, { username, password: 'Passw0rd!' });
  return r.data.idToken;
}
const meetingIds = () => [...fake.state.docs.keys()].filter((k) => k.startsWith('meetings/')).map((k) => k.split('/')[1]);
const attendanceOf = (mid, uid) => fake.getDoc(`attendance/${mid}_${uid}`);

/** Membuka peramban baru dengan kamera palsu yang menayangkan QR berisi `text`, lalu menekan Mulai kamera. */
async function scanScenario(text, username, { label = 'scan' } = {}) {
  const video = path.join(tmp, `v${Date.now()}${Math.random().toString(36).slice(2, 6)}.mjpeg`);
  execFileSync('python3', ['-I', path.join(here, 'qr_helper.py'), 'video', text, video]);
  const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${video}`] });
  const page = await newPage(b, { mobile: true, width: 390, height: 844, label: `${label}-${username}` });
  await page.context().grantPermissions(['camera']);
  await loginOk(page, username);
  await page.goto(URL_ + '/#/scan');
  await page.waitForSelector('#sc-start');
  await page.click('#sc-start');
  return { page, browser: b, close: () => b.close() };
}
const scanCalls = () => srv.apiLog.filter((l) => l.path === '/api/attendance/scan').length;

// ---------- SKENARIO ----------
console.log('\n== Login ==');
const pLogin = await newPage(browserNormal, { label: 'login' });
await step('halaman login tampil (desktop)', async () => {
  await pLogin.goto(URL_ + '/');
  await pLogin.waitForSelector('#login-form');
  assert.match(await pLogin.locator('h1').innerText(), /Masuk/);
  await shot(pLogin, '01-login-desktop');
});
await step('login dengan password salah menampilkan pesan jelas', async () => {
  await loginUI(pLogin, 'mem1', 'salahsalah1');
  await pLogin.waitForSelector('.form-error');
  assert.match(await pLogin.locator('.form-error').innerText(), /Username atau password salah/);
});
await step('login akun nonaktif ditolak dengan pesan', async () => {
  await loginUI(pLogin, 'old1');
  await pLogin.waitForSelector('.form-error');
  assert.match(await pLogin.locator('.form-error').innerText(), /dinonaktifkan/);
});
await step('field kosong divalidasi', async () => {
  await pLogin.goto(URL_ + '/');
  await pLogin.click('#lg-submit');
  assert.match(await pLogin.locator('.form-error').innerText(), /Isi username dan password/);
});
await step('login member berhasil, sidebar sesuai role', async () => {
  await loginOk(pLogin, 'mem1');
  const nav = await pLogin.locator('.sidebar .nav').first().innerText();
  assert.match(nav, /Scan absensi/);
  assert.doesNotMatch(nav, /Anggota\n/);
  assert.equal(await pLogin.locator('.sidebar a[href="#/members"]').count(), 0);
});
await step('member membuka URL halaman admin -> dialihkan ke beranda', async () => {
  await pLogin.goto(URL_ + '/#/members');
  await pLogin.waitForSelector('.shell');
  await pLogin.waitForFunction(() => location.hash === '#/');
});
await step('logout kembali ke halaman login dan sesi terhapus', async () => {
  await pLogin.click('#logout-btn');
  await pLogin.waitForSelector('#login-form');
  assert.equal(await pLogin.evaluate(() => localStorage.getItem('jcms.session.v1')), null);
});
await pLogin.context().close();

console.log('\n== Admin ==');
const pAdmin = await newPage(browserNormal, { label: 'admin' });
await step('login admin & dasbor memakai data nyata', async () => {
  await loginOk(pAdmin, 'admin1');
  await pAdmin.waitForSelector('.ledger');
  const txt = await pAdmin.locator('.ledger').innerText();
  assert.match(txt, /3\s*\nAnggota aktif/);
  assert.match(txt, /2\s*\nPengurus/);
  await pAdmin.waitForFunction(() => window.__charts && window.__charts.length >= 1);
  const charts = await pAdmin.evaluate(() => window.__charts);
  assert.equal(charts[0].labels.length, 6);
  await shot(pAdmin, '02-dashboard-admin-desktop');
});
await step('admin menambah anggota lewat modal; muncul di daftar', async () => {
  await pAdmin.click('.sidebar a[href="#/members"]');
  await pAdmin.waitForSelector('#m-table');
  await pAdmin.click('#add-btn');
  await pAdmin.waitForSelector('#modal-form');
  await pAdmin.fill('#m-name', 'Eko Baru');
  await pAdmin.fill('#m-user', 'eko.baru');
  await pAdmin.fill('#m-pass', 'Passw0rd!');
  await pAdmin.fill('#m-kelas', 'XI-1');
  await pAdmin.click('.modal-foot .btn-primary');
  await pAdmin.waitForSelector('#modal-form', { state: 'detached' });
  assert.match(await toastText(pAdmin), /eko\.baru berhasil dibuat/);
  await pAdmin.waitForSelector('text=Eko Baru');
  await pAdmin.waitForSelector('.modal', { state: 'detached' }); // tunggu modal lama benar-benar hilang
  assert.ok(fake.getDoc('usernames/eko.baru'));
});
await step('username duplikat ditolak dengan pesan di dalam modal', async () => {
  await pAdmin.click('#add-btn');
  await pAdmin.waitForSelector('#modal-form');
  await pAdmin.fill('#m-name', 'Eko Dua');
  await pAdmin.fill('#m-user', 'EKO.BARU');
  await pAdmin.fill('#m-pass', 'Passw0rd!');
  await pAdmin.click('.modal-foot .btn-primary');
  try { await pAdmin.waitForSelector('.modal .form-error', { timeout: 8000 }); }
  catch (e) {
    console.log('        [diagnosa modal] ' + (await pAdmin.locator('.modal').innerText().catch(() => '?')).replace(/\n+/g, ' | ').slice(0, 300));
    console.log('        [diagnosa api] ' + JSON.stringify(srv.apiLog.slice(-3)));
    await shot(pAdmin, 'gagal-duplikat');
    throw e;
  }
  assert.match(await pAdmin.locator('.modal .form-error').innerText(), /sudah dipakai/);
  await shot(pAdmin, '03-modal-error-desktop');
  await pAdmin.click('.modal-foot .btn:not(.btn-primary)');
  await pAdmin.waitForSelector('.modal', { state: 'detached' });
});
await step('validasi form: password terlalu pendek diblokir di browser', async () => {
  await pAdmin.click('#add-btn');
  await pAdmin.waitForSelector('#modal-form');
  await pAdmin.fill('#m-name', 'Fani');
  await pAdmin.fill('#m-user', 'fani1');
  await pAdmin.fill('#m-pass', 'abc');
  await pAdmin.click('.modal-foot .btn-primary');
  await pAdmin.waitForTimeout(300);
  assert.ok(await pAdmin.locator('#modal-form').count(), 'modal harus tetap terbuka');
  assert.equal(fake.getDoc('usernames/fani1'), null);
  await pAdmin.keyboard.press('Escape');
  await pAdmin.waitForSelector('.modal', { state: 'detached' });
});
await step('cari dan filter anggota', async () => {
  await pAdmin.fill('#m-search', 'budi');
  await pAdmin.waitForFunction(() => document.querySelectorAll('#m-body tr').length === 1);
  await pAdmin.fill('#m-search', '');
  await pAdmin.selectOption('#f-role', 'officer');
  await pAdmin.waitForFunction(() => document.querySelectorAll('#m-body tr').length === 2);
  await pAdmin.selectOption('#f-role', '');
  await pAdmin.fill('#m-search', 'zzzz');
  await pAdmin.waitForSelector('text=Tidak ada hasil');
  await pAdmin.fill('#m-search', '');
});
await step('detail anggota; nonaktifkan lewat dialog konfirmasi; login ditolak', async () => {
  await pAdmin.fill('#m-search', 'cici');
  await pAdmin.click('#m-body tr.clickable');
  await pAdmin.waitForSelector('#d-active');
  await pAdmin.click('#d-active');
  await pAdmin.waitForSelector('.modal');
  assert.match(await pAdmin.locator('.modal').innerText(), /tidak akan bisa login/);
  await pAdmin.click('.modal-foot .btn-danger-solid');
  await pAdmin.waitForSelector('.badge-off');
  assert.equal(fake.getDoc('users/uidMem00003').active, false);
  await pAdmin.click('#d-active');
  await pAdmin.click('.modal-foot .btn-primary');
  await pAdmin.waitForSelector('.badge-hadir >> text=Aktif');
  assert.equal(fake.getDoc('users/uidMem00003').active, true);
});
await step('admin membuat pengurus dengan izin, lalu pengurus bisa login', async () => {
  await pAdmin.goto(URL_ + '/#/members');
  await pAdmin.click('#add-btn');
  await pAdmin.waitForSelector('#modal-form');
  await pAdmin.fill('#m-name', 'Gita Pengurus');
  await pAdmin.fill('#m-user', 'gita');
  await pAdmin.fill('#m-pass', 'Passw0rd!');
  await pAdmin.selectOption('#m-role', 'officer');
  await pAdmin.waitForSelector('#perm-box:not(.hidden)');
  await pAdmin.check('input[name=perm_announce]');
  await pAdmin.click('.modal-foot .btn-primary');
  try { await pAdmin.waitForSelector('#modal-form', { state: 'detached', timeout: 8000 }); }
  catch (e) {
    console.log('        [diagnosa modal] ' + (await pAdmin.locator('.modal').innerText().catch(() => '?')).replace(/\n+/g, ' | ').slice(0, 400));
    console.log('        [diagnosa api] ' + JSON.stringify(srv.apiLog.slice(-4)));
    throw e;
  }
  const uid = fake.getDoc('usernames/gita').uid;
  const u = fake.getDoc(`users/${uid}`);
  assert.equal(u.role, 'officer');
  assert.deepEqual(u.permissions, { editAttendance: false, announce: true, exportReports: false });
});
await step('pengaturan klub: simpan dan nama klub di sidebar ikut berubah', async () => {
  await pAdmin.click('.sidebar a[href="#/settings"]');
  await pAdmin.waitForSelector('#st-form');
  await pAdmin.fill('#st-name', 'Nihongo Club');
  await pAdmin.click('#st-save');
  await pAdmin.waitForFunction(() => document.getElementById('club-name').textContent === 'Nihongo Club');
  assert.equal(fake.getDoc('settings/club').clubName, 'Nihongo Club');
});


console.log('\n== Pengurus: pertemuan, QR dinamis, scanner ==');
const pOff = await newPage(browserNormal, { label: 'officer' });
let MID = null;
await step('officer berizin login; ada menu Laporan, tidak ada Pengaturan klub', async () => {
  await loginOk(pOff, 'off2');
  assert.equal(await pOff.locator('.sidebar a[href="#/reports"]').count(), 1);
  assert.equal(await pOff.locator('.sidebar a[href="#/settings"]').count(), 0);
});
await step('buat pertemuan lewat formulir (validasi jam, lalu berhasil)', async () => {
  await pOff.click('.sidebar a[href="#/meetings"]');
  await pOff.waitForSelector('#new-btn');
  await pOff.click('#new-btn');
  await pOff.waitForSelector('#modal-form');
  await pOff.fill('#mt-name', 'Latihan Hiragana');
  await pOff.fill('#mt-start', '15:00');
  await pOff.fill('#mt-end', '14:00');
  await pOff.click('.modal-foot .btn-primary');
  await pOff.waitForSelector('.modal .form-error');
  assert.match(await pOff.locator('.modal .form-error').innerText(), /Jam selesai harus setelah jam mulai/);
  await pOff.fill('#mt-start', clubTime(-5));
  await pOff.fill('#mt-end', '23:59');
  await pOff.fill('#mt-loc', 'Ruang Bahasa');
  await pOff.click('.modal-foot .btn-primary');
  await pOff.waitForSelector('#modal-form', { state: 'detached' });
  await pOff.waitForSelector('#mt-table tbody tr');
  MID = meetingIds()[0];
  assert.ok(MID);
  assert.equal(fake.getDoc(`meetings/${MID}`).status, 'scheduled');
  await shot(pOff, '04-meetings-list-desktop');
});
await step('buka absensi -> layar QR tampil dengan QR, hitung mundur, dan daftar hadir kosong', async () => {
  await pOff.click('#mt-table tbody tr');
  await pOff.waitForSelector('#mt-open');
  await pOff.click('#mt-open');
  await pOff.waitForSelector('#qr-frame svg');
  await pOff.waitForSelector('.timer-ring span');
  const left = Number(await pOff.locator('.timer-ring span').innerText());
  assert.ok(left >= 0 && left <= 30, 'hitung mundur 0-30, dapat ' + left);
  const token = await pOff.evaluate(() => window.__qrTexts.at(-1));
  assert.match(token, /^JC1\.[A-Za-z0-9]+\.\d+\.[A-Za-z0-9_-]+$/);
  assert.equal(fake.getDoc(`meetings/${MID}`).status, 'open');
  assert.match(await pOff.locator('.empty').innerText(), /Belum ada yang absen/);
  await shot(pOff, '05-qr-stage-desktop');
});

/** Menggambar tanda tangan di kotak tanda tangan lalu menyimpan. */
async function signOn(page, { checkLocked = false } = {}) {
  await page.waitForSelector('#sig-canvas', { timeout: 15000 });
  if (checkLocked) {
    await page.keyboard.press('Escape');
    await page.mouse.click(5, 5); // klik di luar kotak
    assert.equal(await page.locator('#sig-canvas').count(), 1, 'kotak tanda tangan tidak bisa ditutup tanpa menyimpan');
    assert.equal(await page.locator('.modal [data-close]').count(), 0, 'tidak ada tombol tutup');
    assert.equal(await page.locator('.modal-foot .btn-primary').isDisabled(), true, 'simpan nonaktif sebelum ada coretan');
  }
  if (checkLocked) { await page.waitForTimeout(700); await shot(page, '36-tanda-tangan-kosong'); }
  const box = await page.locator('#sig-canvas').boundingBox();
  await page.mouse.move(box.x + 30, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 0; i <= 40; i++) await page.mouse.move(box.x + 30 + i * (box.width - 60) / 40, box.y + box.height / 2 + Math.sin(i / 3) * 40);
  await page.mouse.up();
  await page.click('.modal-foot .btn-primary');
  try { await page.waitForSelector('#sig-canvas', { state: 'detached', timeout: 12000 }); }
  catch (e) {
    console.log('        [diagnosa ttd] modal=' + (await page.locator('.modal').allInnerTexts()).join(' || ').replace(/\n+/g, ' | ').slice(0, 300) + ' jumlah=' + (await page.locator('.modal').count()));
    throw e;
  }
}

await step('anggota memindai QR dengan kamera -> Absensi berhasil (Hadir); tercatat atas UID akun login', async () => {
  const token = await pOff.evaluate(() => window.__qrTexts.at(-1));
  const s = await scanScenario(token, 'mem1');
  await signOn(s.page, { checkLocked: true });
  await s.page.waitForSelector('.scan-result', { timeout: 15000 });
  assert.match(await s.page.locator('.scan-result').innerText(), /Absensi berhasil/);
  const sigDoc = fake.getDoc(`signatures/${MID}_uidMem00001`);
  assert.ok(sigDoc && /^iVBOR/.test(sigDoc.image), 'tanda tangan PNG tersimpan');
  assert.equal(attendanceOf(MID, 'uidMem00001').signed, true);
  await shot(s.page, '06-scan-success-mobile');
  const rec = attendanceOf(MID, 'uidMem00001');
  assert.equal(rec.status, 'hadir');
  assert.equal(rec.method, 'qr');
  assert.equal(rec.uid, 'uidMem00001');
  await s.close();
});
await step('layar pengurus menampilkan anggota yang baru absen secara langsung (tanpa muat ulang)', async () => {
  await pOff.waitForFunction(() => document.querySelector('#att-count')?.textContent === '1', null, { timeout: 12000 });
  assert.match(await pOff.locator('#att-list').innerText(), /Ani Member/);
  await shot(pOff, '07-qr-stage-with-attendee');
});
await step('pemindaian ulang oleh anggota yang sama tidak menggandakan catatan', async () => {
  const token = await pOff.evaluate(() => window.__qrTexts.at(-1));
  const before = fake.countDocs('attendance/');
  const s = await scanScenario(token, 'mem1');
  await s.page.waitForSelector('.scan-result', { timeout: 15000 });
  assert.match(await s.page.locator('.scan-result').innerText(), /sudah tercatat/);
  assert.equal(fake.countDocs('attendance/'), before);
  await s.close();
});
await step('QR berganti otomatis (token baru) dalam ~5 detik', async () => {
  const first = await pOff.evaluate(() => window.__qrTexts.at(-1));
  await pOff.waitForFunction((f) => window.__qrTexts.at(-1) !== f, first, { timeout: 40000 });
  const second = await pOff.evaluate(() => window.__qrTexts.at(-1));
  assert.notEqual(first, second);
  assert.equal(first.split('.')[1], second.split('.')[1]); // meeting sama, jendela waktu berbeda
});
await step('QR kedaluwarsa ditolak dengan pesan jelas; tidak ada catatan', async () => {
  const old = (await makeToken(srv.env.QR_SECRET, MID, Date.now() - 130000)).token;
  const s = await scanScenario(old, 'mem2');
  await s.page.waitForSelector('.scan-result.fail', { timeout: 15000 });
  assert.match(await s.page.locator('.scan-result').innerText(), /QR sudah kedaluwarsa/);
  assert.equal(attendanceOf(MID, 'uidMem00002'), null);
  await shot(s.page, '08-scan-expired-mobile');
  await s.close();
});
await step('QR bukan milik Japanese Club diabaikan tanpa memanggil server', async () => {
  const before = scanCalls();
  const s = await scanScenario('https://contoh.com/bukan-qr-absensi', 'mem2');
  await s.page.waitForSelector('.vf-msg:not(.hidden)', { timeout: 15000 });
  await s.page.waitForFunction(() => /bukan QR absensi/.test(document.querySelector('.vf-msg')?.textContent || ''), null, { timeout: 8000 });
  assert.equal(scanCalls(), before);
  await s.close();
});
await step('terlambat otomatis: pertemuan dengan jam mulai 60 menit lalu', async () => {
  const tok = await apiLogin('off2');
  const mk = await callApi('POST', '/api/meetings', tok, { name: 'Sesi Terlambat', date: clubToday(), startTime: clubTime(-60), endTime: '23:59', location: 'Aula' });
  assert.equal(mk.status, 200, JSON.stringify(mk.data));
  const lateId = mk.data.meeting.id;
  await callApi('POST', `/api/meetings/${lateId}/open`, tok);
  const q = (await makeToken(srv.env.QR_SECRET, lateId, Date.now())).token;
  const s = await scanScenario(q, 'mem3');
  await signOn(s.page);
  await s.page.waitForSelector('.scan-result', { timeout: 15000 });
  assert.match(await s.page.locator('.scan-result').innerText(), /Tercatat terlambat/);
  assert.equal(attendanceOf(lateId, 'uidMem00003').status, 'terlambat');
  await s.close();
  await callApi('POST', `/api/meetings/${lateId}/close`, tok, { markAbsent: false });
});
await step('izin kamera ditolak -> pesan panduan, bukan layar kosong', async () => {
  const b = await chromium.launch({ args: ['--use-fake-device-for-media-stream'] });
  const page = await newPage(b, { mobile: true, width: 390, height: 844, label: 'camera-denied' });
  await loginOk(page, 'mem2');
  await page.goto(URL_ + '/#/scan');
  await page.waitForSelector('#sc-start');
  await page.click('#sc-start');
  await page.waitForSelector('.alert-warn', { timeout: 15000 });
  const t = await page.locator('.alert-warn').innerText();
  assert.match(t, /Izin kamera ditolak|Kamera tidak ditemukan|Kamera tidak bisa/);
  await shot(page, '09-camera-denied-mobile');
  console.log('        (pesan: ' + t.split('\n')[0] + ')');
  await b.close();
});
await step('pengurus mengubah status di detail pertemuan; tercatat pengubah & audit', async () => {
  await pOff.goto(URL_ + `/#/meetings/${MID}`);
  await pOff.waitForSelector('select[data-set]');
  const memberSel = pOff.locator('select[data-set]').first();
  await pOff.locator('select[data-set="uidMem00001"]').selectOption('izin');
  await pOff.waitForFunction(() => /diubah menjadi Izin/.test(document.getElementById('toast-root').textContent));
  const rec = attendanceOf(MID, 'uidMem00001');
  assert.equal(rec.status, 'izin');
  assert.equal(rec.updatedByName, 'Officer Dua');
  const audits = [...fake.state.docs.keys()].filter((k) => k.startsWith('audit/')).map((k) => fake.getDoc(k)).filter((a) => a.action === 'attendance.update');
  assert.ok(audits.some((a) => a.detail === 'hadir -> izin' && a.actorName === 'Officer Dua'));
  await pOff.locator('select[data-set="uidMem00001"]').selectOption('hadir');
  await pOff.waitForFunction(() => /diubah menjadi Hadir/.test(document.getElementById('toast-root').textContent));
  await shot(pOff, '10-meeting-detail-desktop');
});
await step('tandai anggota yang belum tercatat (Sakit) lewat daftar "Belum tercatat"', async () => {
  await pOff.locator('select[data-set="uidMem02"], select[data-set="uidMem00002"]').first().selectOption('sakit');
  await pOff.waitForFunction(() => /diubah menjadi Sakit/.test(document.getElementById('toast-root').textContent));
  assert.equal(attendanceOf(MID, 'uidMem00002').status, 'sakit');
  assert.equal(attendanceOf(MID, 'uidMem00002').method, 'manual');
});
await step('tutup sesi lewat dialog: QR tidak berlaku, anggota aktif lain ditandai Alfa', async () => {
  await pOff.goto(URL_ + `/#/meetings/${MID}/qr`);
  await pOff.waitForSelector('#qr-close:not(.hidden)');
  await pOff.click('#qr-close');
  await pOff.waitForSelector('.modal');
  await pOff.click('.modal-foot .btn-danger-solid');
  await pOff.waitForFunction(() => /Sesi absensi sudah ditutup/.test(document.getElementById('qr-frame')?.textContent || ''));
  assert.equal(fake.getDoc(`meetings/${MID}`).status, 'closed');
  const alfa = [...fake.state.docs.keys()].filter((k) => k.startsWith(`attendance/${MID}_`)).map((k) => fake.getDoc(k)).filter((r) => r.status === 'alfa');
  assert.ok(alfa.length >= 3, 'alfa otomatis untuk yang belum hadir: ' + alfa.length);
  assert.equal(attendanceOf(MID, 'uidAdmin001'), null);
  assert.equal(attendanceOf(MID, 'uidOld00001'), null);
  await shot(pOff, '11-qr-closed-desktop');
});
await step('memindai QR setelah sesi ditutup ditolak (pesan "sesi sudah ditutup")', async () => {
  const fresh = (await makeToken(srv.env.QR_SECRET, MID, Date.now())).token; // token masih "segar", tapi sesi tertutup
  const s = await scanScenario(fresh, 'mem3');
  await s.page.waitForSelector('.scan-result.fail', { timeout: 15000 });
  assert.match(await s.page.locator('.scan-result').innerText(), /Sesi absensi sudah ditutup/);
  assert.equal(attendanceOf(MID, 'uidMem00003').status, 'alfa');
  await s.close();
});
await pOff.context().close();

console.log('\n== Laporan, pengumuman, jadwal, HP ==');
const pRep = await newPage(browserNormal, { label: 'reports' });
await step('laporan: tampil, filter, dan ekspor Excel berisi data benar + nama file otomatis', async () => {
  await loginOk(pRep, 'off2');
  await pRep.goto(URL_ + '/#/reports');
  await pRep.waitForSelector('#rp-result .mini-stats');
  assert.ok((await pRep.locator('#rp-result table tbody tr').count()) > 3);
  await shot(pRep, '12-reports-desktop');
  await pRep.waitForFunction(() => !document.getElementById('rp-export').disabled);
  const dl = pRep.waitForEvent('download');
  await pRep.click('#rp-export');
  const d = await dl;
  assert.match(d.suggestedFilename(), /^Laporan-Absensi-Japanese-Club_\d{4}-\d{2}-\d{2}_sd_\d{4}-\d{2}-\d{2}\.xlsx$/);
  const sheets = JSON.parse(fs.readFileSync(await d.path(), 'utf8'));
  assert.deepEqual(sheets.map((s) => s.name), ['Ringkasan Anggota', 'Riwayat Absensi', 'Rekap Per Pertemuan']);
  // Sheet 1: header baris 4, satu baris per anggota, rumus + total
  const s1 = sheets[0].rows.map((r) => r);
  const hdr = s1.find((r) => r['1'] === 'Nomor');
  assert.deepEqual(Object.values(hdr), ['Nomor', 'Nama anggota', 'Username / ID', 'Total pertemuan', 'Hadir', 'Izin', 'Sakit', 'Alfa', 'Terlambat', 'Persentase kehadiran']);
  const body = s1.filter((r) => typeof r['1'] === 'number');
  assert.ok(body.length >= 4, 'semua anggota aktif tampil');
  assert.match(body[0]['4'].formula, /^SUM\(E\d+:I\d+\)$/);
  assert.match(body[0]['10'].formula, /^IF\(D\d+=0,0,\(E\d+\+I\d+\)\/D\d+\)$/);
  assert.ok(s1.some((r) => r['2'] === 'TOTAL' && /^SUM\(/.test(r['4'].formula)));
  assert.ok(sheets[0].cf >= 1 && sheets[0].filter);
  // Sheet 2: riwayat
  const h2 = sheets[1].rows.find((r) => r['1'] === 'Tanggal pertemuan');
  assert.equal(h2['8'], 'Keterangan keterlambatan');
  const detail = sheets[1].rows.filter((r) => typeof r['1'] === 'string' && r['1'].startsWith('DATE:'));
  assert.ok(detail.length > 3);
  const late = detail.find((r) => r['5'] === 'Terlambat');
  if (late) assert.match(late['8'], /menit setelah jam mulai|manual/);
  // Sheet 3: rekap per pertemuan
  const h3 = sheets[2].rows.find((r) => r['1'] === 'Tanggal');
  assert.deepEqual(Object.values(h3), ['Tanggal', 'Pertemuan', 'Jumlah tercatat', 'Hadir', 'Izin', 'Sakit', 'Alfa', 'Terlambat', 'Persentase kehadiran']);
  assert.ok(sheets[2].rows.some((r) => r['2'] === 'TOTAL'));
  // lebar kolom menyesuaikan isi
  assert.ok(sheets[0].widths['2'] > 12);
});
await step('laporan: filter status, rentang tanggal, satu pertemuan, satu anggota', async () => {
  await pRep.selectOption('#rp-status', 'alfa');
  await pRep.waitForFunction(() => [...document.querySelectorAll('#rp-result table:last-of-type tbody tr .badge')].every((b) => /Alfa/.test(b.textContent)) && document.querySelectorAll('#rp-result .badge').length > 0);
  await pRep.selectOption('#rp-status', '');
  await pRep.click('[data-mode=range]');
  await pRep.waitForSelector('#rp-from');
  await pRep.waitForSelector('#rp-result .mini-stats');
  await pRep.click('[data-mode=meeting]');
  await pRep.waitForSelector('#rp-meeting');
  await pRep.waitForSelector('#rp-result .mini-stats');
  await pRep.click('[data-mode=month]');
  await pRep.selectOption('#rp-month', 'all');
  await pRep.selectOption('#rp-member', 'uidMem00001');
  await pRep.waitForSelector('#rp-result .mini-stats');
  await pRep.waitForFunction(() => document.querySelectorAll('#rp-result h2')[1]?.textContent.includes('(1)'));
});
await step('officer tanpa izin laporan: menu tidak ada & URL dialihkan', async () => {
  const p = await newPage(browserNormal, { label: 'off1' });
  await loginOk(p, 'off1');
  assert.equal(await p.locator('.sidebar a[href="#/reports"]').count(), 0);
  await p.goto(URL_ + '/#/reports');
  await p.waitForFunction(() => location.hash === '#/');
  await p.goto(URL_ + `/#/meetings/${MID}`);
  await p.waitForSelector('.badge');
  assert.equal(await p.locator('select[data-set]').count(), 0);
  await p.context().close();
});
await step('pengumuman: buat, member melihat, jadwal masa depan tersembunyi, ubah, hapus dengan konfirmasi', async () => {
  await pRep.goto(URL_ + '/#/announcements');
  await pRep.click('#an-add');
  await pRep.waitForSelector('#modal-form');
  await pRep.fill('#an-title', 'Rapat Pengurus');
  await pRep.fill('#an-body', 'Jumat pukul 15.00 di Ruang Bahasa.');
  await pRep.click('.modal-foot .btn-primary');
  await pRep.waitForSelector('text=Rapat Pengurus');
  await pRep.click('#an-add');
  await pRep.waitForSelector('#modal-form');
  await pRep.fill('#an-title', 'Lomba Pidato (Terjadwal)');
  await pRep.fill('#an-body', 'Segera.');
  await pRep.fill('#an-pub', '2099-01-01T08:00');
  await pRep.click('.modal-foot .btn-primary');
  await pRep.waitForSelector('text=Dijadwalkan');
  const m = await newPage(browserNormal, { label: 'member-ann', mobile: true, width: 390, height: 844 });
  await loginOk(m, 'mem1');
  await m.goto(URL_ + '/#/announcements');
  await m.waitForSelector('text=Rapat Pengurus');
  assert.equal(await m.locator('text=Lomba Pidato').count(), 0);
  assert.equal(await m.locator('[data-edit]').count(), 0);
  await m.click('[data-open]');
  await m.waitForSelector('.modal');
  assert.match(await m.locator('.modal').innerText(), /Ruang Bahasa/);
  await shot(m, '13-announcement-mobile');
  await m.context().close();
  await pRep.locator('[data-edit]').first().click();
  await pRep.waitForSelector('#modal-form');
  await pRep.fill('#an-title', 'Rapat Pengurus (diubah)');
  await pRep.click('.modal-foot .btn-primary');
  await pRep.waitForSelector('text=Rapat Pengurus (diubah)');
  await pRep.locator('[data-del]').first().click();
  await pRep.waitForSelector('.modal');
  await pRep.click('.modal-foot .btn-danger-solid');
  await pRep.waitForFunction(() => !document.body.textContent.includes('Rapat Pengurus (diubah)') || true);
  await pRep.waitForTimeout(500);
});
await step('jadwal: daftar dan kalender (member) menampilkan pertemuan hari ini', async () => {
  const m = await newPage(browserNormal, { label: 'member-sched' });
  await loginOk(m, 'mem1');
  await m.goto(URL_ + '/#/schedule');
  await m.waitForSelector('.event, .empty');
  await m.click('[data-mode=cal]');
  await m.waitForSelector('.cal-day.today');
  assert.ok(await m.locator('.cal-day.today .cal-dots i').count() >= 1);
  assert.match(await m.locator('.panel:last-of-type').innerText(), /Latihan Hiragana/);
  await shot(m, '14-schedule-calendar-desktop');
  await m.context().close();
});
await step('sesi: akun dinonaktifkan saat login -> pengguna dikeluarkan dengan pesan', async () => {
  const m = await newPage(browserNormal, { label: 'member-kick' });
  await loginOk(m, 'mem2');
  const adminTok = await apiLogin('admin1');
  await callApi('POST', '/api/members/uidMem00002/active', adminTok, { active: false });
  try {
    await m.reload();
    await m.waitForSelector('#login-form');
    await m.waitForSelector('.form-error');
    assert.match(await m.locator('.form-error').innerText(), /dinonaktifkan/);
  } finally {
    await callApi('POST', '/api/members/uidMem00002/active', adminTok, { active: true });
  }
  await m.context().close();
});
await step('token kedaluwarsa diperbarui otomatis (refresh) tanpa logout', async () => {
  const m = await newPage(browserNormal, { label: 'member-refresh' });
  await loginOk(m, 'mem1');
  await m.evaluate(() => { const s = JSON.parse(localStorage.getItem('jcms.session.v1')); s.expiresAt = Date.now() - 1000; localStorage.setItem('jcms.session.v1', JSON.stringify(s)); });
  await m.reload();
  await m.waitForSelector('.shell');
  await m.goto(URL_ + '/#/profile');
  await m.waitForSelector('.kv');
  assert.ok(srv.apiLog.some((l) => l.path === '/api/auth/refresh' && l.status === 200));
  await m.context().close();
});

console.log('\n== Tampilan HP / tablet (tanpa overflow horizontal) ==');
for (const [label, vp] of [['iPhone 390', { width: 390, height: 844, mobile: true }], ['Android kecil 360', { width: 360, height: 640, mobile: true }], ['Tablet 768', { width: 768, height: 1024, mobile: true }]]) {
  await step(`${label}: halaman anggota & pengurus tanpa overflow, navigasi bawah tampil`, async () => {
    const pm = await newPage(browserNormal, { ...vp, label });
    await loginOk(pm, 'mem1');
    for (const h of ['/', '/scan', '/schedule', '/announcements', '/profile']) {
      await pm.goto(URL_ + '/#' + h); await pm.waitForTimeout(350); await noOverflow(pm);
    }
    if (vp.width < 860) assert.ok(await pm.locator('.tabbar').isVisible());
    await shot(pm, `15-member-home-${vp.width}`);
    await pm.evaluate(() => localStorage.clear());
    await loginOk(pm, 'off2');
    for (const h of ['/', '/meetings', '/members', `/meetings/${MID}`, `/meetings/${MID}/qr`, '/reports', '/more']) {
      await pm.goto(URL_ + '/#' + h); await pm.waitForTimeout(500); await noOverflow(pm);
    }
    await shot(pm, `16-staff-members-${vp.width}`);
    await pm.context().close();
  });
}
await step('HP: modal tampil sebagai lembar bawah, tidak melebihi layar', async () => {
  const pm = await newPage(browserNormal, { width: 390, height: 700, mobile: true, label: 'sheet' });
  await loginOk(pm, 'admin1');
  await pm.goto(URL_ + '/#/members');
  await pm.waitForSelector('#add-btn');
  await pm.click('#add-btn');
  await pm.waitForSelector('.modal');
  const box = await pm.locator('.modal').boundingBox();
  assert.ok(box.height <= 700 && box.y >= 0 && box.width <= 390);
  await shot(pm, '17-modal-sheet-mobile');
  await pm.context().close();
});

// ================= FITUR BARU: dasbor, foto profil, Learning Center, musik =================
console.log('\n== Fitur baru ==');
const png = path.join(tmp, 'foto.png');
execFileSync('python3', ['-I', '-c', `import cv2, numpy as np
im = np.zeros((600, 900, 3), np.uint8); im[:] = (50, 40, 200)
cv2.circle(im, (450, 250), 150, (200, 220, 250), -1)
cv2.imwrite(${JSON.stringify(png)}, im)`]);

await step('dasbor anggota: sapaan, progres belajar, kosakata hari ini, tombol lanjut belajar', async () => {
  const pm = await newPage(browserNormal, { width: 1280, height: 900, label: 'dash-m' });
  await loginOk(pm, 'mem1');
  await pm.waitForSelector('.hero');
  assert.match(await pm.locator('.hero-text h1').innerText(), /Selamat (pagi|siang|sore|malam), Ani/);
  await pm.waitForSelector('.wotd-jp');
  assert.ok((await pm.locator('.wotd-jp').innerText()).length > 0);
  assert.ok(await pm.locator('.prog-row').count() >= 7);
  assert.match(await pm.locator('.hero-cta a').getAttribute('href'), /#\/learn\/hiragana\/1/);
  await noOverflow(pm);
  await pm.waitForTimeout(700);
  await shot(pm, '20-dashboard-member');
  await pm.context().close();
});

await step('foto profil: unggah dengan crop, tampil di sidebar & profil, lalu hapus', async () => {
  const pm = await newPage(browserNormal, { width: 1280, height: 900, label: 'foto' });
  await loginOk(pm, 'mem2');
  await pm.goto(URL_ + '/#/profile');
  await pm.waitForSelector('#pf-photo');
  await pm.click('#pf-photo');
  await pm.setInputFiles('#ph-file', png);
  await pm.waitForSelector('#ph-stage canvas');
  await pm.fill('#ph-zoom', '1.5');
  await pm.dispatchEvent('#ph-zoom', 'input');
  await shot(pm, '21-foto-crop');
  await pm.click('text=Simpan foto');
  await pm.waitForSelector('#pf-photo-del');
  const doc = fake.getDoc('avatars/uidMem00002');
  assert.ok(doc && doc.image && doc.thumb, 'dokumen avatar tersimpan');
  assert.ok(String(doc.image).length < 90000, 'foto kecil');
  await pm.waitForSelector('.usercard .avatar img', { timeout: 8000 });
  await pm.waitForSelector('.avatar-xl img', { timeout: 8000 });
  await shot(pm, '22-profil-foto');
  await pm.click('#pf-photo-del');
  await pm.click('.modal .btn-danger-solid');
  await pm.waitForSelector('#pf-photo-del', { state: 'detached' });
  assert.ok(!fake.getDoc('avatars/uidMem00002'), 'avatar terhapus');
  await pm.context().close();
});

await step('foto profil: berkas bukan gambar ditolak dengan pesan', async () => {
  const pm = await newPage(browserNormal, { width: 1280, height: 900, label: 'foto-bad' });
  await loginOk(pm, 'mem2');
  await pm.goto(URL_ + '/#/profile');
  await pm.waitForSelector('#pf-photo');
  await pm.click('#pf-photo');
  const txt = path.join(tmp, 'bukan.png');
  fs.writeFileSync(txt, 'ini bukan gambar');
  await pm.setInputFiles('#ph-file', txt);
  await pm.waitForSelector('#ph-err:not(.hidden)');
  await pm.context().close();
});

await step('admin menghapus foto anggota dari halaman detail', async () => {
  const tokM = await apiLogin('mem3');
  const jpeg = execFileSync('python3', ['-I', '-c', `import cv2, numpy as np, base64
def enc(n):
    im = np.zeros((n, n, 3), np.uint8); im[:] = (60, 120, 10)
    return base64.b64encode(cv2.imencode('.jpg', im)[1].tobytes()).decode()
print(enc(256)); print(enc(64))`]).toString().trim().split('\n');
  const up = await callApi('PUT', '/api/me/avatar', tokM, { image: jpeg[0], thumb: jpeg[1] });
  assert.equal(up.status, 200, JSON.stringify(up.data));
  const pm = await newPage(browserNormal, { width: 1280, height: 900, label: 'foto-admin' });
  await loginOk(pm, 'admin1');
  await pm.goto(URL_ + '/#/members/uidMem00003');
  await pm.waitForSelector('#d-photo-del');
  await pm.click('#d-photo-del');
  await pm.click('.modal .btn-danger-solid');
  await pm.waitForSelector('#d-photo-del', { state: 'detached' });
  assert.ok(!fake.getDoc('avatars/uidMem00003'));
  await pm.context().close();
});

await step('Learning Center: 7 kategori, level terkunci, latihan memberi umpan balik', async () => {
  const pm = await newPage(browserNormal, { width: 1280, height: 900, label: 'learn' });
  await loginOk(pm, 'mem1');
  await pm.goto(URL_ + '/#/learn');
  await pm.waitForSelector('.cat-card');
  assert.equal(await pm.locator('.cat-card').count(), 7);
  await shot(pm, '23-learn-hub');
  await pm.goto(URL_ + '/#/learn/hiragana');
  await pm.waitForTimeout(600);
  await shot(pm, '24-learn-category');
  await pm.goto(URL_ + '/#/learn/hiragana/1');
  await pm.waitForSelector('#ls-start');
  await pm.click('#ls-start');
  await pm.waitForSelector('#sx-body');
  await pm.waitForTimeout(400);
  await shot(pm, '25-learn-question');
  // jawab pertanyaan pertama (apa pun jenisnya) sampai muncul umpan balik
  const opt = pm.locator('.opt').first();
  if (await opt.count()) await opt.click();
  else if (await pm.locator('[data-pick]').count()) { const n = await pm.locator('[data-pick]').count(); for (let i = 0; i < n; i++) await pm.locator('[data-pick]').first().click(); }
  else if (await pm.locator('input.input').count()) await pm.fill('input.input', 'x');
  if (await pm.locator('#sx-main:not([disabled])').count()) {
    await pm.click('#sx-main');
    await pm.waitForSelector('.feedback, .sx-foot .fb, #sx-foot [class*="fb"]', { timeout: 5000 }).catch(() => {});
  }
  await shot(pm, '26-learn-feedback');
  await pm.click('#sx-close');
  await pm.context().close();
});

await step('Learning Center: level 2 terkunci saat level 1 belum lulus (API menolak)', async () => {
  const tok = await apiLogin('mem3');
  const r = await callApi('POST', '/api/learning/result', tok, { cat: 'hiragana', n: 2, correct: 5, total: 5, hearts: 5 });
  assert.ok(r.status >= 400 && r.status < 500, 'status ' + r.status);
});

await step('musik: pemutar tampil, volume awal kecil, kontrol jeda/bisu/sembunyikan bekerja', async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const pm = await newPage(b, { width: 1280, height: 800, label: 'music' });
  await loginOk(pm, 'mem1');
  await pm.waitForSelector('.mp');
  await pm.waitForTimeout(2500);
  let d = await pm.evaluate(() => window.__jcMusic.debug());
  console.log('        [musik] ' + JSON.stringify({ ...d, rms: +d.rms.toFixed(4), peak: +d.peak.toFixed(4) }));
  assert.ok(d.vol >= 5 && d.vol <= 10, 'volume awal 5-10%');
  assert.equal(d.state, 'running');
  assert.ok(d.playing);
  assert.ok(d.peak > 0.0005, 'ada sinyal audio keluar (peak ' + d.peak + ')');
  assert.ok(d.peak < 0.5, 'tidak terlalu keras');
  await shot(pm, '27-music-player');
  await pm.click('#mp-mute');
  await pm.waitForTimeout(700);
  d = await pm.evaluate(() => window.__jcMusic.debug());
  assert.ok(d.muted);
  await pm.click('#mp-mute');
  await pm.click('#mp-next');
  await pm.waitForTimeout(400);
  const d2 = await pm.evaluate(() => window.__jcMusic.debug());
  assert.notEqual(d2.track, d.track, 'lagu berganti');
  await pm.click('#mp-play');
  await pm.waitForTimeout(300);
  assert.equal((await pm.evaluate(() => window.__jcMusic.debug())).playing, false);
  await pm.click('#mp-hide');
  await pm.waitForSelector('#mp-show');
  // preferensi tersimpan setelah muat ulang
  await pm.reload();
  await pm.waitForSelector('.shell');
  await pm.waitForSelector('#mp-show');
  await b.close();
});

await step('musik: bila autoplay diblokir, mulai setelah interaksi pertama (tanpa mengakali)', async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=document-user-activation-required'] });
  const pm = await newPage(b, { width: 1280, height: 800, label: 'music-block' });
  await loginOk(pm, 'mem1');
  await pm.waitForSelector('.mp');
  await pm.waitForTimeout(1200);
  const before = await pm.evaluate(() => window.__jcMusic.debug());
  console.log('        [musik-blokir sebelum klik] ' + JSON.stringify({ state: before.state, playing: before.playing, waiting: before.waiting }));
  await pm.mouse.click(700, 500);
  await pm.waitForTimeout(2200);
  const after = await pm.evaluate(() => window.__jcMusic.debug());
  assert.equal(after.state, 'running');
  assert.ok(after.playing);
  await b.close();
});

await step('HP: dasbor anggota, Learning Center dan pemutar tidak overflow', async () => {
  const pm = await newPage(browserNormal, { width: 390, height: 844, mobile: true, label: 'mobile-new' });
  await loginOk(pm, 'mem1');
  for (const h of ['/', '/learn', '/learn/hiragana', '/learn/hiragana/1', '/profile']) {
    await pm.goto(URL_ + '/#' + h); await pm.waitForTimeout(600); await noOverflow(pm);
  }
  await pm.goto(URL_ + '/#/');
  await pm.waitForTimeout(900);
  await shot(pm, '28-mobile-dashboard');
  await pm.goto(URL_ + '/#/learn');
  await pm.waitForTimeout(700);
  await shot(pm, '29-mobile-learn');
  await pm.context().close();
});


await step('tanda tangan tertunda: tutup aplikasi sebelum tanda tangan -> kotak muncul lagi saat dibuka', async () => {
  const tok = await apiLogin('off1');
  const mk = await callApi('POST', '/api/meetings', tok, { name: 'Sesi Tanda Tangan', date: clubToday(), startTime: '00:05', endTime: '23:59', location: 'Aula', lateAfterMinutes: 180 });
  assert.equal(mk.status, 200, JSON.stringify(mk.data));
  const id = mk.data.meeting.id;
  await callApi('POST', `/api/meetings/${id}/open`, tok);
  const qr = await callApi('GET', `/api/meetings/${id}/qr`, tok);
  const s = await scanScenario(qr.data.token, 'mem3');
  await s.page.waitForSelector('#sig-canvas', { timeout: 15000 });
  assert.equal(attendanceOf(id, 'uidMem00003').signed, false, 'belum tanda tangan');
  await s.page.reload();
  await s.page.waitForSelector('#sig-canvas', { timeout: 15000 }); // muncul lagi dari daftar tertunda
  await signOn(s.page);
  assert.ok(fake.getDoc(`signatures/${id}_uidMem00003`), 'tanda tangan tersimpan');
  await s.page.reload();
  await s.page.waitForSelector('.shell');
  await s.page.waitForTimeout(1800);
  assert.equal(await s.page.locator('#sig-canvas').count(), 0, 'tidak muncul lagi setelah tanda tangan');
  await s.close();
});

await step('PDF daftar hadir bertanda tangan: anggota x pertemuan, ada gambar tanda tangan', async () => {
  const pm = await newPage(browserNormal, { width: 1280, height: 900, label: 'pdf' });
  await loginOk(pm, 'admin1');
  await pm.goto(URL_ + '/#/reports');
  await pm.waitForSelector('#rp-sigpdf');
  const [dl] = await Promise.all([pm.waitForEvent('download', { timeout: 30000 }), pm.click('#rp-sigpdf')]);
  const file = path.join(tmp, 'daftar-hadir.pdf');
  await dl.saveAs(file);
  assert.match(dl.suggestedFilename(), /^Daftar-Hadir-TTD_.*\.pdf$/);
  const head = fs.readFileSync(file).subarray(0, 5).toString();
  assert.equal(head, '%PDF-');
  const txt = execFileSync('pdftotext', ['-layout', file, '-']).toString();
  assert.match(txt, /Daftar Hadir Bertanda Tangan/);
  assert.match(txt, /Ani Member/);
  assert.match(txt, /Sesi Tanda Tangan/);
  const imgs = execFileSync('pdfimages', ['-list', file]).toString().trim().split('\n').length - 2;
  assert.ok(imgs >= 2, 'ada gambar tanda tangan di PDF (' + imgs + ')');
  execFileSync('pdftoppm', ['-png', '-r', '70', '-f', '1', '-l', '1', file, path.join(SHOTS, '35-pdf-daftar-hadir')]);
  await pm.context().close();
});

await step('hapus pertemuan (admin): dialog dampak, arsip, pulihkan', async () => {
  const pm = await newPage(browserNormal, { width: 1280, height: 900, label: 'del' });
  await loginOk(pm, 'admin1');
  const tok = await apiLogin('admin1');
  const c = await callApi('POST', '/api/meetings', tok, { name: 'Pertemuan Uji Hapus', date: clubToday(), startTime: '23:00', endTime: '23:30', location: 'Aula', lateAfterMinutes: 10 });
  assert.equal(c.status, 200, JSON.stringify(c.data));
  const id = (c.data.meeting || c.data).id;
  await pm.goto(URL_ + '/#/meetings');
  await pm.waitForSelector('text=Pertemuan Uji Hapus');
  await shot(pm, '30-meetings-admin');
  await pm.goto(URL_ + '/#/meetings/' + id);
  await pm.waitForSelector('[data-del], #m-del, button:has-text("Hapus")');
  await pm.locator('button:has-text("Hapus")').first().click();
  await pm.waitForSelector('.modal');
  assert.match(await pm.locator('.modal').innerText(), /Pertemuan Uji Hapus/);
  await shot(pm, '31-delete-dialog');
  await pm.context().close();
});


await step('animasi pembuka: tampil sekali, menutupi lalu hilang, aplikasi bisa dipakai', async () => {
  const pm = await newPage(browserNormal, { width: 390, height: 844, mobile: true, label: 'intro' });
  await pm.goto(URL_ + '/');
  await pm.waitForSelector('#intro .sun');
  await pm.waitForTimeout(900);
  await shot(pm, '32-intro-1');
  await pm.waitForTimeout(700);
  await shot(pm, '33-intro-2');
  await pm.waitForSelector('#intro', { state: 'detached', timeout: 6000 });
  await pm.waitForSelector('#lg-user');
  await pm.reload();
  await pm.waitForSelector('#lg-user');
  assert.equal(await pm.locator('#intro').count(), 1);
  assert.equal(await pm.evaluate(() => document.documentElement.classList.contains('intro-on')), false, 'tidak diulang di sesi yang sama');
  await pm.context().close();
});


await step('scan lewat browser biasa diblokir (harus dari aplikasi), tanpa tombol Foto QR', async () => {
  const pm = await newPage(browserNormal, { width: 390, height: 844, mobile: true, label: 'web-scan' });
  await loginOk(pm, 'mem1');
  await pm.goto(URL_ + '/#/scan');
  await pm.waitForSelector('text=Absensi hanya lewat aplikasi');
  assert.equal(await pm.locator('#sc-start').count(), 0, 'tidak ada tombol mulai kamera');
  assert.equal(await pm.locator('input[type=file]').count(), 0, 'tidak ada unggah foto QR');
  await shot(pm, '34-scan-browser-diblokir');
  await pm.context().close();
});

await step('scan di aplikasi: tidak ada tombol Foto QR / unggah foto', async () => {
  const pm = await newPage(browserNormal, { width: 390, height: 844, mobile: true, label: 'app-scan' });
  await loginOk(pm, 'mem1');
  await pm.goto(URL_ + '/#/scan');
  await pm.waitForSelector('#sc-start');
  assert.equal(await pm.locator('input[type=file]').count(), 0);
  assert.equal(await pm.locator('text=Foto QR').count(), 0);
  await pm.context().close();
});

await step('Excel di aplikasi: file disimpan lewat Filesystem lalu menu Bagikan (plugin Capacitor palsu)', async () => {
  const pm = await newPage(browserNormal, { width: 1280, height: 900, label: 'app-excel' });
  await pm.addInitScript(() => {
    window.__native = [];
    window.Capacitor = { nativePromise: async (plugin, method, opts) => { window.__native.push({ plugin, method, path: opts.path, len: (opts.data || '').length, url: opts.url }); return { uri: 'file:///cache/' + (opts.path || '') }; } };
  });
  await loginOk(pm, 'admin1');
  await pm.goto(URL_ + '/#/reports');
  await pm.waitForSelector('#rp-export');
  await pm.click('#rp-export');
  await pm.waitForFunction(() => window.__native.length >= 2, null, { timeout: 15000 });
  const calls = await pm.evaluate(() => window.__native);
  assert.equal(calls[0].plugin, 'Filesystem');
  assert.equal(calls[0].method, 'writeFile');
  assert.match(calls[0].path, /\.xlsx$/);
  assert.ok(calls[0].len > 100, 'data base64 terisi');
  assert.equal(calls[1].plugin, 'Share');
  assert.match(calls[1].url, /^file:\/\/\/cache\//);
  await pm.context().close();
});

console.log('\n== Peringatan tidak hadir beruntun ==');
await step('admin melihat kartu + notifikasi harian untuk anggota alfa 3x beruntun', async () => {
  for (let n = 1; n <= 3; n++) {
    fake.putDoc(`meetings/alr${n}`, { name: `Alert ${n}`, date: `2099-01-0${n}`, startTime: '10:00', endTime: '11:00', status: 'closed', createdAt: new Date() });
    fake.putDoc(`attendance/alr${n}_uidMem00002`, { meetingId: `alr${n}`, meetingName: `Alert ${n}`, meetingDate: `2099-01-0${n}`, uid: 'uidMem00002', status: 'alfa', method: 'auto' });
    fake.putDoc(`attendance/alr${n}_uidMem00001`, { meetingId: `alr${n}`, meetingName: `Alert ${n}`, meetingDate: `2099-01-0${n}`, uid: 'uidMem00001', status: n === 2 ? 'terlambat' : 'alfa', method: 'auto' });
  }
  const pa = await newPage(browserNormal, { label: 'alert-admin' });
  await loginOk(pa, 'admin1');
  await pa.waitForSelector('.alert-absence');
  const card = await pa.locator('.alert-absence').innerText();
  assert.match(card, /Budi Member/);
  assert.doesNotMatch(card, /Ani Member/);
  await pa.waitForSelector('.modal');
  assert.match(await pa.locator('.modal').innerText(), /Budi Member/);
  await shot(pa, '16-peringatan-alfa');
  await pa.click('.modal-foot button');
  await pa.waitForSelector('.modal', { state: 'detached' });
  await pa.reload();
  await pa.waitForSelector('.alert-absence');
  assert.equal(await pa.locator('.modal').count(), 0, 'modal harian tidak muncul dua kali');
  await pa.context().close();
});

console.log('\n== Dapur Jepang ==');
await step('game Dapur Jepang: animasi masuk, 3 hidangan dimainkan dengan gerakan jari sampai selesai', async () => {
  const pg = await newPage(browserNormal, { width: 390, height: 844, mobile: true, label: 'cook' });
  await loginOk(pg, 'mem1');
  await pg.goto(URL_ + '/#/learn');
  await pg.waitForSelector('.cook-banner');
  await pg.click('.cook-banner');
  await pg.waitForSelector('.cook-intro');
  await pg.waitForTimeout(900);
  await shot(pg, '17-dapur-intro');
  await pg.waitForSelector('.cook-intro', { state: 'detached', timeout: 6000 });
  await pg.waitForSelector('.cook-card');
  await shot(pg, '18-dapur-menu');
  const box = async (sel) => { const b = await pg.locator(sel).first().boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, b }; };
  const svgPt = async (x, y) => { const b = await pg.locator('.ck-svg').boundingBox(); return { x: b.x + (x / 360) * b.width, y: b.y + (y / 380) * b.height }; };
  const waitStage = (n) => pg.waitForFunction((n) => document.querySelector('.cook-head .small')?.textContent.includes('Langkah ' + n), n, { timeout: 8000 });
  const hold = async (to) => {
    const c = await box('.ck-svg');
    await pg.mouse.move(c.x, c.y); await pg.mouse.down();
    await pg.waitForFunction((to) => parseFloat(document.querySelector('.ck-svg').dataset.level) >= to, to, { timeout: 5000 });
    await pg.mouse.up();
  };
  const drag = async (name) => {
    const it = await box('.drag-item'), tg = await box('.drag-target');
    await pg.mouse.move(it.x, it.y); await pg.mouse.down();
    await pg.mouse.move((it.x + tg.x) / 2, (it.y + tg.y) / 2, { steps: 5 });
    await pg.mouse.move(tg.x, tg.y, { steps: 5 }); await shot(pg, name); await pg.mouse.up();
  };
  const taps = async (n) => { const c = await box('.ck-svg'); for (let i = 0; i < n; i++) await pg.mouse.click(c.x, c.y); };
  const finishCheck = async (re) => {
    await pg.waitForSelector('.cook-done', { timeout: 8000 });
    assert.match(await pg.locator('h1').innerText(), re);
    assert.equal(await pg.locator('.cook-star').count(), 3);
    assert.ok(await pg.locator('.cook-star.on').count() >= 1);
    assert.ok((await pg.locator('.cook-vocab li').count()) >= 3);
    await noOverflow(pg);
  };

  // ---- onigiri ----
  await pg.click('a[href="#/cook/onigiri"]');
  await pg.waitForSelector('#start'); await shot(pg, '19-dapur-resep');
  await pg.click('#start');
  await pg.waitForSelector('.ck-svg[data-type="hold"]');
  await hold(0.72); await shot(pg, '20-dapur-nasi');
  await waitStage(2); await taps(8); await shot(pg, '21-dapur-nigiri');
  await waitStage(3); await drag('22-dapur-umeboshi');
  await waitStage(4); await drag('23-dapur-nori');
  await finishCheck(/おにぎり/); await pg.waitForTimeout(1500); await shot(pg, '24-dapur-selesai');

  // ---- ocha ----
  await pg.goto(URL_ + '/#/cook/ocha'); await pg.click('#start');
  await pg.waitForSelector('.drag-item'); await drag('25-dapur-teh');
  await waitStage(2); await hold(0.7);
  await waitStage(3); await pg.waitForFunction(() => parseFloat(document.querySelector('.ck-svg').dataset.p) >= 0.68, null, { timeout: 8000 });
  await shot(pg, '26-dapur-seduh'); await pg.mouse.click(200, 400);
  await waitStage(4); await hold(0.78); await shot(pg, '27-dapur-cangkir');
  await finishCheck(/おちゃ/);

  // ---- sushi ----
  await pg.goto(URL_ + '/#/cook/sushi'); await pg.click('#start');
  await pg.waitForSelector('.ck-svg[data-type="tap"]'); await taps(6);
  await waitStage(2); await pg.waitForSelector('.cut-line', { state: 'attached' });
  const a = await svgPt(30, 200), z = await svgPt(330, 200);
  await pg.mouse.move(a.x, a.y); await pg.mouse.down(); await pg.mouse.move((a.x + z.x) / 2, a.y, { steps: 12 }); await shot(pg, '28-dapur-potong'); await pg.mouse.move(z.x, z.y, { steps: 12 }); await pg.mouse.up();
  await waitStage(3); await drag('29-dapur-wasabi');
  await waitStage(4); await drag('30-dapur-ikan');
  await finishCheck(/すし/); await shot(pg, '31-dapur-sushi-jadi');

  // lepas di tempat salah: item kembali, tahap tidak selesai
  await pg.goto(URL_ + '/#/cook/onigiri'); await pg.click('#start');
  await pg.waitForSelector('.ck-svg[data-type="hold"]'); await hold(0.72); await waitStage(2); await taps(8); await waitStage(3);
  const it = await box('.drag-item');
  await pg.mouse.move(it.x, it.y); await pg.mouse.down(); await pg.mouse.move(it.x + 5, it.y - 5, { steps: 3 }); await pg.mouse.up();
  await pg.waitForTimeout(500);
  assert.equal(await pg.locator('.cook-flash.show').count(), 0, 'lepas di tempat salah tidak menyelesaikan tahap');
  await pg.context().close();
});

await pRep.context().close();

// keluaran
const pass = results.filter((r) => r.ok).length;
console.log(`\n${pass}/${results.length} lulus`);
if (pageErrors.length) console.log('\nGALAT HALAMAN:\n' + [...new Set(pageErrors)].join('\n'));
fs.writeFileSync(path.join(SHOTS, 'results.json'), JSON.stringify({ results, pageErrors }, null, 2));
await browserNormal.close();
await srv.close();
helper.kill();
process.exit(results.every((r) => r.ok) && !pageErrors.length ? 0 : 1);
