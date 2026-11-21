// Pengujian otomatis API. Berjalan melawan Firebase tiruan (lihat fake-google.js).
// Jalankan: cd backend && node --test test/
import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { createFake } from './fake-google.js';
import { resetRateLimits } from '../src/lib/ratelimit.js';
import { clearDashboardCache } from '../src/routes/dashboard.js';
import { encode, decode, encodeFields, decodeFields } from '../src/lib/firestore.js';
import { makeToken, verifyToken } from '../src/lib/qr-token.js';

const T0 = new Date('2026-11-19T03:00:00Z'); // 10:00 WIB
let fake;
let env;

async function api(method, path, { token, body } = {}) {
  const req = new Request('https://club.test' + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const res = await worker.fetch(req, env);
  return { status: res.status, data: await res.json() };
}

async function login(username, password = 'Passw0rd!') {
  const r = await api('POST', '/api/auth/login', { body: { username, password } });
  assert.equal(r.status, 200, `login ${username} gagal: ${JSON.stringify(r.data)}`);
  return r.data.idToken;
}

const meetingBody = (o = {}) => ({ name: 'Latihan Hiragana', description: 'Dasar hiragana', date: '2026-11-19', startTime: '10:00', endTime: '11:30', location: 'Ruang 3', ...o });

beforeEach(async () => {
  mock.timers.enable({ apis: ['Date'], now: T0 });
  fake = await createFake();
  env = fake.env;
  fake.install();
  resetRateLimits();
  clearDashboardCache();
  fake.seedUser({ uid: 'uidAdmin001', username: 'admin1', fullName: 'Admin Satu', role: 'admin' });
  fake.seedUser({ uid: 'uidOff00001', username: 'off1', fullName: 'Officer Satu', role: 'officer' });
  fake.seedUser({ uid: 'uidOff00002', username: 'off2', fullName: 'Officer Dua', role: 'officer', permissions: { editAttendance: true, announce: true, exportReports: true } });
  fake.seedUser({ uid: 'uidMem00001', username: 'mem1', fullName: 'Ani Member', role: 'member', kelas: 'X-1' });
  fake.seedUser({ uid: 'uidMem00002', username: 'mem2', fullName: 'Budi Member', role: 'member', kelas: 'X-1' });
  fake.seedUser({ uid: 'uidMem00003', username: 'mem3', fullName: 'Cici Member', role: 'member', kelas: 'X-2' });
  fake.seedUser({ uid: 'uidOld00001', username: 'old1', fullName: 'Dodi Nonaktif', role: 'member', active: false });
});

afterEach(() => {
  fake.uninstall();
  mock.timers.reset();
});

describe('Penyimpanan data', () => {
  test('encode/decode Firestore bolak-balik', () => {
    const obj = { a: 'x', b: 3, c: 1.5, d: true, e: null, f: new Date('2026-01-01T00:00:00Z'), g: [1, 'a'], h: { i: 1 } };
    assert.deepEqual(decodeFields(encodeFields(obj)), obj);
    assert.deepEqual(decode(encode([])), []);
  });
});

describe('Login & sesi', () => {
  test('login admin, officer, member berhasil dan role benar', async () => {
    for (const [u, role] of [['admin1', 'admin'], ['off1', 'officer'], ['mem1', 'member']]) {
      const r = await api('POST', '/api/auth/login', { body: { username: u, password: 'Passw0rd!' } });
      assert.equal(r.status, 200);
      assert.equal(r.data.user.role, role);
      assert.ok(r.data.idToken && r.data.refreshToken);
    }
  });

  test('password salah / username tidak ada -> pesan jelas 401', async () => {
    const a = await api('POST', '/api/auth/login', { body: { username: 'mem1', password: 'salah12345' } });
    const b = await api('POST', '/api/auth/login', { body: { username: 'tidakada', password: 'salah12345' } });
    assert.equal(a.status, 401);
    assert.equal(b.status, 401);
    assert.equal(a.data.error.message, b.data.error.message); // tidak membocorkan username mana yang ada
  });

  test('akun nonaktif tidak bisa login', async () => {
    const r = await api('POST', '/api/auth/login', { body: { username: 'old1', password: 'Passw0rd!' } });
    assert.equal(r.status, 403);
  });

  test('tanpa token / token sampah / token dipalsukan ditolak', async () => {
    assert.equal((await api('GET', '/api/me')).status, 401);
    assert.equal((await api('GET', '/api/me', { token: 'abc.def.ghi' })).status, 401);
    const good = await login('mem1');
    const [h, p, s] = good.split('.');
    // ganti UID di payload tanpa tanda tangan yang benar
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
    payload.sub = 'uidAdmin001';
    const forged = `${h}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${s}`;
    assert.equal((await api('GET', '/api/me', { token: forged })).status, 401);
  });

  test('refresh token menghasilkan token baru; akun nonaktif tidak bisa refresh', async () => {
    const r = await api('POST', '/api/auth/login', { body: { username: 'mem1', password: 'Passw0rd!' } });
    const rf = await api('POST', '/api/auth/refresh', { body: { refreshToken: r.data.refreshToken } });
    assert.equal(rf.status, 200);
    assert.ok(rf.data.idToken);
    const admin = await login('admin1');
    await api('POST', '/api/members/uidMem00001/active', { token: admin, body: { active: false } });
    const rf2 = await api('POST', '/api/auth/refresh', { body: { refreshToken: rf.data.refreshToken } });
    assert.equal(rf2.status, 403);
  });

  test('pembatasan percobaan login (brute force)', async () => {
    let last;
    for (let i = 0; i < 9; i++) last = await api('POST', '/api/auth/login', { body: { username: 'mem1', password: 'salah12345' } });
    assert.equal(last.status, 429);
  });

  test('ganti password: password lama wajib benar', async () => {
    const t = await login('mem1');
    const bad = await api('POST', '/api/me/password', { token: t, body: { currentPassword: 'salahsalah1', newPassword: 'BaruAman123' } });
    assert.equal(bad.status, 401);
    const ok = await api('POST', '/api/me/password', { token: t, body: { currentPassword: 'Passw0rd!', newPassword: 'BaruAman123' } });
    assert.equal(ok.status, 200);
    assert.equal((await api('POST', '/api/auth/login', { body: { username: 'mem1', password: 'Passw0rd!' } })).status, 401);
    assert.equal((await api('POST', '/api/auth/login', { body: { username: 'mem1', password: 'BaruAman123' } })).status, 200);
    const weak = await api('POST', '/api/me/password', { token: t, body: { currentPassword: 'BaruAman123', newPassword: 'pendek' } });
    assert.equal(weak.status, 400);
  });
});

describe('Hak akses per role', () => {
  test('member dilarang melakukan aksi pengurus/admin', async () => {
    const t = await login('mem1');
    const denied = [
      ['GET', '/api/members'],
      ['POST', '/api/members', { username: 'baru1', password: 'Passw0rd!', fullName: 'Baru' }],
      ['PATCH', '/api/members/uidMem00002', { role: 'admin' }],
      ['POST', '/api/members/uidMem00002/active', { active: false }],
      ['POST', '/api/meetings', meetingBody()],
      ['GET', '/api/reports'],
      ['PUT', '/api/settings', { clubName: 'X', defaultLateMinutes: 5 }],
      ['POST', '/api/announcements', { title: 'Halo', body: 'Isi' }],
      ['GET', '/api/members/uidMem00002/attendance'],
    ];
    for (const [m, p, b] of denied) {
      const r = await api(m, p, { token: t, body: b });
      assert.equal(r.status, 403, `${m} ${p} seharusnya 403, dapat ${r.status}`);
    }
  });

  test('member tidak bisa menaikkan role sendiri lewat PATCH', async () => {
    const t = await login('mem1');
    const r = await api('PATCH', '/api/members/uidMem00001', { token: t, body: { role: 'admin' } });
    assert.equal(r.status, 403);
    assert.equal(fake.getDoc('users/uidMem00001').role, 'member');
  });

  test('officer: boleh buat pertemuan & lihat anggota, tidak boleh urus akun/pengaturan', async () => {
    const t = await login('off1');
    assert.equal((await api('GET', '/api/members', { token: t })).status, 200);
    assert.equal((await api('POST', '/api/meetings', { token: t, body: meetingBody() })).status, 200);
    assert.equal((await api('POST', '/api/members', { token: t, body: { username: 'baru1', password: 'Passw0rd!', fullName: 'Baru Satu' } })).status, 403);
    assert.equal((await api('PUT', '/api/settings', { token: t, body: { clubName: 'X', defaultLateMinutes: 5 } })).status, 403);
    assert.equal((await api('GET', '/api/reports', { token: t })).status, 403);
    assert.equal((await api('POST', '/api/announcements', { token: t, body: { title: 'Halo', body: 'Isi' } })).status, 403);
  });
});

describe('Manajemen anggota', () => {
  test('admin membuat anggota baru; username unik; anggota baru bisa login', async () => {
    const admin = await login('admin1');
    const body = { fullName: 'Eko Baru', username: 'Eko.Baru', password: 'Passw0rd!', kelas: 'XI-1', jabatan: 'Anggota', role: 'member' };
    const r = await api('POST', '/api/members', { token: admin, body });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.member.username, 'eko.baru');
    assert.ok(fake.getDoc(`users/${r.data.member.uid}`));
    assert.equal(fake.getDoc('usernames/eko.baru').uid, r.data.member.uid);
    assert.equal((await api('POST', '/api/auth/login', { body: { username: 'eko.baru', password: 'Passw0rd!' } })).status, 200);

    const dup = await api('POST', '/api/members', { token: admin, body });
    assert.equal(dup.status, 409);
    const dupCase = await api('POST', '/api/members', { token: admin, body: { ...body, username: 'MEM1' } });
    assert.equal(dupCase.status, 409);
  });

  test('validasi input anggota', async () => {
    const admin = await login('admin1');
    const base = { fullName: 'Eko', username: 'eko1', password: 'Passw0rd!' };
    for (const bad of [
      { ...base, username: 'ab' },
      { ...base, username: '1eko' },
      { ...base, username: 'eko baru' },
      { ...base, password: 'pendek1' },
      { ...base, password: 'hurufsajaa' },
      { ...base, fullName: '' },
      { ...base, role: 'superadmin' },
      { ...base, fullName: 'Eko\u0000' },
    ]) {
      assert.equal((await api('POST', '/api/members', { token: admin, body: bad })).status, 400, JSON.stringify(bad));
    }
    assert.equal(fake.countDocs('usernames/'), 7);
  });

  test('jika penyimpanan gagal, akun Auth dibatalkan (tidak ada akun yatim)', async () => {
    const admin = await login('admin1');
    const before = fake.state.authUsers.size;
    fake.state.failNextCommitWith = { http: 500, status: 'INTERNAL' };
    const r = await api('POST', '/api/members', { token: admin, body: { fullName: 'Eko', username: 'eko1', password: 'Passw0rd!' } });
    assert.equal(r.status, 500);
    assert.equal(fake.state.authUsers.size, before);
  });

  test('nonaktifkan: sesi lama langsung mati, login & refresh ditolak, bisa diaktifkan lagi', async () => {
    const admin = await login('admin1');
    const mem = await login('mem1');
    assert.equal((await api('GET', '/api/me', { token: mem })).status, 200);
    assert.equal((await api('POST', '/api/members/uidMem00001/active', { token: admin, body: { active: false } })).status, 200);
    assert.equal((await api('GET', '/api/me', { token: mem })).status, 403); // token lama masih "valid" tapi akun nonaktif
    assert.equal((await api('POST', '/api/auth/login', { body: { username: 'mem1', password: 'Passw0rd!' } })).status, 403);
    assert.equal(fake.state.authUsers.get('uidMem00001').disabled, true);
    await api('POST', '/api/members/uidMem00001/active', { token: admin, body: { active: true } });
    assert.equal((await api('GET', '/api/me', { token: mem })).status, 200);
  });

  test('admin tidak bisa mengunci diri sendiri / menghapus admin terakhir', async () => {
    const admin = await login('admin1');
    assert.equal((await api('POST', '/api/members/uidAdmin001/active', { token: admin, body: { active: false } })).status, 400);
    assert.equal((await api('PATCH', '/api/members/uidAdmin001', { token: admin, body: { role: 'member' } })).status, 400);
  });

  test('ubah role/izin oleh admin, riwayat audit tercatat; reset password', async () => {
    const admin = await login('admin1');
    const r = await api('PATCH', '/api/members/uidOff00001', { token: admin, body: { permissions: { editAttendance: true } } });
    assert.equal(r.status, 200);
    assert.equal(r.data.member.permissions.editAttendance, true);
    assert.equal((await api('POST', '/api/members/uidMem00002/password', { token: admin, body: { newPassword: 'ResetBaru99' } })).status, 200);
    assert.equal((await api('POST', '/api/auth/login', { body: { username: 'mem2', password: 'ResetBaru99' } })).status, 200);
    assert.ok(fake.countDocs('audit/') >= 2);
  });
});

describe('QR dinamis & absensi', () => {
  async function openMeeting(startTime = '10:00') {
    const off = await login('off1');
    const created = await api('POST', '/api/meetings', { token: off, body: meetingBody({ startTime, endTime: '23:00' }) });
    assert.equal(created.status, 200, JSON.stringify(created.data));
    const id = created.data.meeting.id;
    return { off, id };
  }

  test('alur lengkap: buat -> buka -> QR -> pindai -> hadir; duplikasi tidak menggandakan', async () => {
    const { off, id } = await openMeeting();
    const closedQr = await api('GET', `/api/meetings/${id}/qr`, { token: off });
    assert.equal(closedQr.data.open, false);
    assert.equal(closedQr.data.token, null);

    assert.equal((await api('POST', `/api/meetings/${id}/open`, { token: off })).status, 200);
    const qr = await api('GET', `/api/meetings/${id}/qr`, { token: off });
    assert.equal(qr.data.open, true);
    assert.match(qr.data.token, /^JC1\./);
    assert.ok(qr.data.expiresAt > Date.now());

    const mem = await login('mem1');
    const s1 = await api('POST', '/api/attendance/scan', { token: mem, body: { token: qr.data.token } });
    assert.equal(s1.status, 200, JSON.stringify(s1.data));
    assert.equal(s1.data.status, 'hadir');
    assert.equal(s1.data.duplicate, false);

    const s2 = await api('POST', '/api/attendance/scan', { token: mem, body: { token: qr.data.token } });
    assert.equal(s2.status, 200);
    assert.equal(s2.data.duplicate, true);
    assert.equal(fake.countDocs('attendance/'), 1);

    const rec = fake.getDoc(`attendance/${id}_uidMem00001`);
    assert.equal(rec.uid, 'uidMem00001');
    assert.equal(rec.method, 'qr');
    assert.ok(rec.recordedAt instanceof Date);

    const live = await api('GET', `/api/meetings/${id}/qr`, { token: off });
    assert.equal(live.data.records.length, 1);
    assert.equal(live.data.records[0].memberName, 'Ani Member');
  });

  test('identitas dari body diabaikan: catatan selalu milik pemilik token login', async () => {
    const { off, id } = await openMeeting();
    await api('POST', `/api/meetings/${id}/open`, { token: off });
    const qr = await api('GET', `/api/meetings/${id}/qr`, { token: off });
    const mem = await login('mem2');
    const r = await api('POST', '/api/attendance/scan', { token: mem, body: { token: qr.data.token, uid: 'uidMem00001', status: 'izin' } });
    assert.equal(r.status, 200);
    assert.ok(fake.getDoc(`attendance/${id}_uidMem00002`));
    assert.equal(fake.getDoc(`attendance/${id}_uidMem00001`), null);
    assert.equal(fake.getDoc(`attendance/${id}_uidMem00002`).status, 'hadir');
  });

  test('terlambat otomatis setelah batas menit', async () => {
    const { off, id } = await openMeeting('09:30'); // mulai 09:30, sekarang 10:00 WIB, batas 15 mnt -> terlambat
    await api('POST', `/api/meetings/${id}/open`, { token: off });
    const qr = await api('GET', `/api/meetings/${id}/qr`, { token: off });
    const r = await api('POST', '/api/attendance/scan', { token: await login('mem1'), body: { token: qr.data.token } });
    assert.equal(r.data.status, 'terlambat');
  });

  test('QR kedaluwarsa ditolak (410), QR jendela sebelumnya masih ditoleransi', async () => {
    const { off, id } = await openMeeting();
    await api('POST', `/api/meetings/${id}/open`, { token: off });
    const mem1 = await login('mem1');
    const mem2 = await login('mem2');
    const qr = await api('GET', `/api/meetings/${id}/qr`, { token: off });

    mock.timers.tick(31000); // satu jendela berlalu -> masih diterima
    const ok = await api('POST', '/api/attendance/scan', { token: mem1, body: { token: qr.data.token } });
    assert.equal(ok.status, 200);

    mock.timers.tick(31000); // dua jendela berlalu -> kedaluwarsa
    const old = await api('POST', '/api/attendance/scan', { token: mem2, body: { token: qr.data.token } });
    assert.equal(old.status, 410);
    assert.equal(old.data.error.code, 'qr_expired');
    assert.equal(fake.getDoc(`attendance/${id}_uidMem00002`), null);
  });

  test('token dipalsukan / diubah / bukan QR klub ditolak', async () => {
    const { off, id } = await openMeeting();
    await api('POST', `/api/meetings/${id}/open`, { token: off });
    const mem = await login('mem1');
    const qr = await api('GET', `/api/meetings/${id}/qr`, { token: off });
    const parts = qr.data.token.split('.');
    const forgedSig = [...parts.slice(0, 3), 'A'.repeat(27)].join('.');
    const forgedWindow = [parts[0], parts[1], String(Number(parts[2]) + 1), parts[3]].join('.');
    const otherMeeting = [parts[0], 'ffffffffffffffffffff', parts[2], parts[3]].join('.');
    for (const bad of [forgedSig, forgedWindow, otherMeeting, 'JC1.x', 'https://contoh.com', 'abcdefghijklmnop']) {
      const r = await api('POST', '/api/attendance/scan', { token: mem, body: { token: bad } });
      assert.ok([400, 410].includes(r.status), `${bad} -> ${r.status}`);
    }
    assert.equal(fake.countDocs('attendance/'), 0);
    // rahasia server berbeda -> token tidak valid
    const other = await makeToken('z'.repeat(40), id, Date.now());
    await assert.rejects(verifyToken(env.QR_SECRET, other.token, Date.now()));
  });

  test('QR tidak berlaku setelah sesi ditutup; belum dibuka juga ditolak', async () => {
    const { off, id } = await openMeeting();
    const mem = await login('mem1');
    const pre = await makeToken(env.QR_SECRET, id, Date.now());
    const notOpen = await api('POST', '/api/attendance/scan', { token: mem, body: { token: pre.token } });
    assert.equal(notOpen.status, 409);
    assert.equal(notOpen.data.error.code, 'session_not_open');

    await api('POST', `/api/meetings/${id}/open`, { token: off });
    const qr = await api('GET', `/api/meetings/${id}/qr`, { token: off });
    assert.equal((await api('POST', `/api/meetings/${id}/close`, { token: off, body: {} })).status, 200);
    const after = await api('POST', '/api/attendance/scan', { token: mem, body: { token: qr.data.token } });
    assert.equal(after.status, 409);
    assert.equal(after.data.error.code, 'session_closed');
    const live = await api('GET', `/api/meetings/${id}/qr`, { token: off });
    assert.equal(live.data.open, false);
  });

  test('member tidak boleh mengambil QR atau membuka/menutup sesi', async () => {
    const { off, id } = await openMeeting();
    await api('POST', `/api/meetings/${id}/open`, { token: off });
    const mem = await login('mem1');
    assert.equal((await api('GET', `/api/meetings/${id}/qr`, { token: mem })).status, 403);
    assert.equal((await api('POST', `/api/meetings/${id}/close`, { token: mem })).status, 403);
    assert.equal((await api('POST', `/api/meetings/${id}/open`, { token: mem })).status, 403);
  });

  test('menutup sesi menandai Alfa hanya untuk anggota aktif yang belum hadir', async () => {
    const { off, id } = await openMeeting();
    await api('POST', `/api/meetings/${id}/open`, { token: off });
    const qr = await api('GET', `/api/meetings/${id}/qr`, { token: off });
    await api('POST', '/api/attendance/scan', { token: await login('mem1'), body: { token: qr.data.token } });
    const closed = await api('POST', `/api/meetings/${id}/close`, { token: off, body: {} });
    assert.equal(closed.status, 200);
    // tracked aktif: off1, off2, mem1, mem2, mem3 (admin & nonaktif tidak) -> 4 alfa
    assert.equal(closed.data.markedAbsent, 4);
    assert.equal(fake.getDoc(`attendance/${id}_uidMem00002`).status, 'alfa');
    assert.equal(fake.getDoc(`attendance/${id}_uidMem00001`).status, 'hadir');
    assert.equal(fake.getDoc(`attendance/${id}_uidAdmin001`), null);
    assert.equal(fake.getDoc(`attendance/${id}_uidOld00001`), null);
    // menutup dua kali tidak menggandakan
    assert.equal((await api('POST', `/api/meetings/${id}/close`, { token: off, body: {} })).data.markedAbsent, 0);
    assert.equal(fake.countDocs('attendance/'), 5);
  });

  test('buka kembali sesi: Alfa otomatis bisa ditingkatkan lewat QR, status manual tidak ditimpa', async () => {
    const { off, id } = await openMeeting();
    await api('POST', `/api/meetings/${id}/open`, { token: off });
    await api('POST', `/api/meetings/${id}/close`, { token: off, body: {} });
    const off2 = await login('off2');
    await api('PUT', `/api/meetings/${id}/attendance/uidMem00002`, { token: off2, body: { status: 'sakit' } });
    await api('POST', `/api/meetings/${id}/open`, { token: off });
    const qr = await api('GET', `/api/meetings/${id}/qr`, { token: off });
    const up = await api('POST', '/api/attendance/scan', { token: await login('mem1'), body: { token: qr.data.token } });
    assert.equal(up.data.duplicate, false);
    assert.equal(fake.getDoc(`attendance/${id}_uidMem00001`).status, 'hadir');
    const keep = await api('POST', '/api/attendance/scan', { token: await login('mem2'), body: { token: qr.data.token } });
    assert.equal(keep.data.duplicate, true);
    assert.equal(fake.getDoc(`attendance/${id}_uidMem00002`).status, 'sakit');
  });

  test('pembatasan pemindaian berulang (429)', async () => {
    const { off, id } = await openMeeting();
    await api('POST', `/api/meetings/${id}/open`, { token: off });
    const qr = await api('GET', `/api/meetings/${id}/qr`, { token: off });
    const mem = await login('mem1');
    let last;
    for (let i = 0; i < 17; i++) last = await api('POST', '/api/attendance/scan', { token: mem, body: { token: qr.data.token } });
    assert.equal(last.status, 429);
    assert.equal(fake.countDocs('attendance/'), 1);
  });
});

describe('Ubah status kehadiran & riwayat', () => {
  test('hanya pengurus berizin yang bisa; perubahan tercatat di audit dengan nama pengubah', async () => {
    const off = await login('off1');
    const id = (await api('POST', '/api/meetings', { token: off, body: meetingBody() })).data.meeting.id;
    const noPerm = await api('PUT', `/api/meetings/${id}/attendance/uidMem00001`, { token: off, body: { status: 'izin' } });
    assert.equal(noPerm.status, 403);

    const off2 = await login('off2');
    const r = await api('PUT', `/api/meetings/${id}/attendance/uidMem00001`, { token: off2, body: { status: 'izin', note: 'Ada acara keluarga' } });
    assert.equal(r.status, 200);
    assert.equal(r.data.record.status, 'izin');
    const r2 = await api('PUT', `/api/meetings/${id}/attendance/uidMem00001`, { token: off2, body: { status: 'sakit' } });
    assert.equal(r2.data.record.status, 'sakit');
    const rec = fake.getDoc(`attendance/${id}_uidMem00001`);
    assert.equal(rec.updatedBy, 'uidOff00002');
    assert.equal(rec.updatedByName, 'Officer Dua');
    assert.ok(rec.updatedAt instanceof Date);
    const audits = [...fake.state.docs.keys()].filter((k) => k.startsWith('audit/')).map((k) => fake.getDoc(k)).filter((a) => a.action === 'attendance.update');
    assert.deepEqual(audits.map((a) => a.detail).sort(), ['- -> izin', 'izin -> sakit']);

    assert.equal((await api('PUT', `/api/meetings/${id}/attendance/uidMem00001`, { token: off2, body: { status: 'bolos' } })).status, 400);
    assert.equal((await api('PUT', `/api/meetings/${id}/attendance/uidMem00001`, { token: await login('mem1'), body: { status: 'hadir' } })).status, 403);
  });

  test('riwayat & rekap anggota; member hanya melihat miliknya', async () => {
    const off = await login('off1');
    const off2 = await login('off2');
    for (const [i, st] of [[1, 'hadir'], [2, 'terlambat'], [3, 'alfa'], [4, 'izin']]) {
      const id = (await api('POST', '/api/meetings', { token: off, body: meetingBody({ name: `Pertemuan ${i}`, date: `2026-11-0${i}` }) })).data.meeting.id;
      await api('PUT', `/api/meetings/${id}/attendance/uidMem00001`, { token: off2, body: { status: st } });
    }
    const mem = await login('mem1');
    const h = await api('GET', '/api/members/uidMem00001/attendance', { token: mem });
    assert.equal(h.status, 200);
    assert.equal(h.data.records.length, 4);
    assert.equal(h.data.summary.percentage, 50);
    assert.equal(h.data.records[0].meetingDate, '2026-11-04'); // terbaru dulu
    assert.equal((await api('GET', '/api/members/uidMem00002/attendance', { token: mem })).status, 403);
    assert.equal((await api('GET', '/api/members/uidMem00001/attendance', { token: off })).status, 200);
  });
});

describe('Pertemuan', () => {
  test('validasi, ubah, hapus (hanya yang belum punya riwayat), daftar & detail', async () => {
    const off = await login('off1');
    const admin = await login('admin1');
    assert.equal((await api('POST', '/api/meetings', { token: off, body: meetingBody({ endTime: '09:00' }) })).status, 400);
    assert.equal((await api('POST', '/api/meetings', { token: off, body: meetingBody({ date: '2026-02-30' }) })).status, 400);
    assert.equal((await api('POST', '/api/meetings', { token: off, body: meetingBody({ name: 'ab' }) })).status, 400);
    const id = (await api('POST', '/api/meetings', { token: off, body: meetingBody() })).data.meeting.id;
    const upd = await api('PATCH', `/api/meetings/${id}`, { token: off, body: { location: 'Aula' } });
    assert.equal(upd.data.meeting.location, 'Aula');
    assert.equal(upd.data.meeting.name, 'Latihan Hiragana');

    const mem = await login('mem1');
    const list = await api('GET', '/api/meetings', { token: mem });
    assert.equal(list.data.meetings.length, 1);
    assert.equal(list.data.meetings[0].myStatus, null);
    const detail = await api('GET', `/api/meetings/${id}`, { token: off });
    assert.equal(detail.data.pending.length, 5); // off1, off2, mem1-3 (admin/nonaktif tidak)

    assert.equal((await api('DELETE', `/api/meetings/${id}`, { token: off })).status, 403);
    assert.equal((await api('DELETE', `/api/meetings/${id}`, { token: admin })).status, 200);
    const id2 = (await api('POST', '/api/meetings', { token: off, body: meetingBody() })).data.meeting.id;
    await api('POST', `/api/meetings/${id2}/open`, { token: off });
    assert.equal((await api('DELETE', `/api/meetings/${id2}`, { token: admin })).status, 409);
  });
});

describe('Pengumuman', () => {
  test('hak buat/ubah/hapus, jadwal publikasi, visibilitas member', async () => {
    const off2 = await login('off2');
    const mem = await login('mem1');
    const admin = await login('admin1');
    const now = await api('POST', '/api/announcements', { token: off2, body: { title: 'Rapat Pengurus', body: 'Jumat pukul 15.00' } });
    assert.equal(now.status, 200);
    const future = await api('POST', '/api/announcements', { token: off2, body: { title: 'Lomba Pidato', body: 'Segera', publishAt: '2026-12-01T00:00:00Z' } });
    assert.equal(future.status, 200);
    assert.equal(future.data.announcement.published, false);

    const memList = await api('GET', '/api/announcements', { token: mem });
    assert.deepEqual(memList.data.announcements.map((a) => a.title), ['Rapat Pengurus']);
    const staffList = await api('GET', '/api/announcements', { token: off2 });
    assert.equal(staffList.data.announcements.length, 2);
    assert.equal((await api('GET', `/api/announcements/${future.data.announcement.id}`, { token: mem })).status, 404);

    const edit = await api('PATCH', `/api/announcements/${now.data.announcement.id}`, { token: off2, body: { body: 'Pindah ke Sabtu' } });
    assert.equal(edit.data.announcement.body, 'Pindah ke Sabtu');
    assert.equal(edit.data.announcement.title, 'Rapat Pengurus');
    assert.equal((await api('PATCH', `/api/announcements/${now.data.announcement.id}`, { token: mem, body: { body: 'x' } })).status, 403);
    // officer biasa (tanpa izin) tidak bisa; officer berizin tidak bisa ubah milik orang lain
    fake.seedUser({ uid: 'uidOff00003', username: 'off3', fullName: 'Officer Tiga', role: 'officer', permissions: { announce: true } });
    const off3 = await login('off3');
    assert.equal((await api('DELETE', `/api/announcements/${now.data.announcement.id}`, { token: off3 })).status, 403);
    assert.equal((await api('DELETE', `/api/announcements/${now.data.announcement.id}`, { token: admin })).status, 200);
    assert.equal((await api('GET', '/api/announcements', { token: admin })).data.announcements.length, 1);
  });
});

describe('Laporan, dashboard, pengaturan', () => {
  async function seedAttendance() {
    const off = await login('off1');
    const off2 = await login('off2');
    const a = (await api('POST', '/api/meetings', { token: off, body: meetingBody({ name: 'Pertemuan A', date: '2026-11-05' }) })).data.meeting.id;
    const b = (await api('POST', '/api/meetings', { token: off, body: meetingBody({ name: 'Pertemuan B', date: '2026-11-12' }) })).data.meeting.id;
    const set = (id, uid, status) => api('PUT', `/api/meetings/${id}/attendance/${uid}`, { token: off2, body: { status } });
    await set(a, 'uidMem00001', 'hadir');
    await set(a, 'uidMem00002', 'terlambat');
    await set(a, 'uidMem00003', 'izin');
    await set(b, 'uidMem00001', 'hadir');
    await set(b, 'uidMem00002', 'alfa');
    await set(b, 'uidMem00003', 'sakit');
    return { a, b, off2 };
  }

  test('laporan: rekap, filter kelas/status/pertemuan, izin akses', async () => {
    const { a, off2 } = await seedAttendance();
    const all = await api('GET', '/api/reports?from=2026-11-01&to=2026-11-30', { token: off2 });
    assert.equal(all.status, 200);
    assert.deepEqual([all.data.summary.hadir, all.data.summary.terlambat, all.data.summary.izin, all.data.summary.sakit, all.data.summary.alfa], [2, 1, 1, 1, 1]);
    assert.equal(all.data.summary.percentage, 50);
    assert.equal(all.data.perMember.length, 3);
    assert.equal(all.data.perMeeting.length, 2);
    const kelas = await api('GET', '/api/reports?from=2026-11-01&to=2026-11-30&kelas=X-2', { token: off2 });
    assert.equal(kelas.data.rows.length, 2);
    const stat = await api('GET', '/api/reports?from=2026-11-01&to=2026-11-30&status=alfa', { token: off2 });
    assert.equal(stat.data.rows.length, 1);
    assert.equal(stat.data.rows[0].memberName, 'Budi Member');
    const per = await api('GET', `/api/reports?meetingId=${a}`, { token: off2 });
    assert.equal(per.data.rows.length, 3);
    const narrow = await api('GET', '/api/reports?from=2026-11-10&to=2026-11-30', { token: off2 });
    assert.equal(narrow.data.rows.length, 3);
    assert.equal((await api('GET', '/api/reports?from=2026-11-30&to=2026-11-01', { token: off2 })).status, 400);
    assert.equal((await api('GET', '/api/reports?from=2024-01-01&to=2026-11-01', { token: off2 })).status, 400);
    assert.equal((await api('GET', '/api/reports', { token: await login('off1') })).status, 403);
    assert.equal((await api('GET', '/api/reports?from=2026-11-01&to=2026-11-30', { token: await login('admin1') })).status, 200);
  });

  test('dashboard staff memakai data nyata; dashboard member pribadi', async () => {
    await seedAttendance();
    const admin = await login('admin1');
    const d = await api('GET', '/api/dashboard', { token: admin });
    assert.equal(d.status, 200);
    assert.equal(d.data.stats.activeMembers, 3);
    assert.equal(d.data.stats.officers, 2);
    assert.equal(d.data.stats.totalMeetings, 2);
    assert.equal(d.data.stats.monthAttendance, 3);
    assert.equal(d.data.stats.monthPercentage, 50);
    assert.equal(d.data.chart.length, 6);
    assert.equal(d.data.chart[5].month, '2026-11');
    assert.equal(d.data.chart[5].hadir, 2);
    assert.equal(d.data.monthStatus.alfa, 1);
    assert.ok(d.data.activity.length > 0);

    const mem = await api('GET', '/api/dashboard', { token: await login('mem1') });
    assert.equal(mem.data.role, 'member');
    assert.equal(mem.data.summary.hadir, 2);
    assert.equal(mem.data.summary.percentage, 100);
    assert.equal(mem.data.stats, undefined);
  });

  test('pengaturan klub: admin saja yang bisa mengubah; validasi', async () => {
    const admin = await login('admin1');
    assert.equal((await api('PUT', '/api/settings', { token: admin, body: { clubName: 'Nihongo Club', description: 'x', contact: '', defaultLateMinutes: 10 } })).status, 200);
    const g = await api('GET', '/api/settings', { token: await login('mem1') });
    assert.equal(g.data.settings.clubName, 'Nihongo Club');
    assert.equal((await api('PUT', '/api/settings', { token: admin, body: { clubName: 'N', defaultLateMinutes: 10 } })).status, 400);
    assert.equal((await api('PUT', '/api/settings', { token: admin, body: { clubName: 'Nihongo', defaultLateMinutes: 999 } })).status, 400);
  });
});

describe('Keamanan umum', () => {
  test('endpoint tak dikenal -> 404, metode salah -> 405, body bukan JSON -> 400', async () => {
    const admin = await login('admin1');
    assert.equal((await api('GET', '/api/tidak-ada', { token: admin })).status, 404);
    assert.equal((await api('DELETE', '/api/members', { token: admin })).status, 405);
    const res = await worker.fetch(new Request('https://club.test/api/members', { method: 'POST', headers: { authorization: 'Bearer ' + admin }, body: '{bukan json' }), env);
    assert.equal(res.status, 400);
  });

  test('error internal tidak membocorkan detail & kredensial tidak pernah ada di respons', async () => {
    const admin = await login('admin1');
    fake.state.failNextCommitWith = { http: 500, status: 'INTERNAL' };
    const spy = mock.method(console, 'error', () => {});
    const r = await api('POST', '/api/meetings', { token: admin, body: meetingBody() });
    spy.mock.restore();
    assert.equal(r.status, 500);
    assert.equal(JSON.stringify(r.data).includes('private_key'), false);
    assert.equal(r.data.error.message.includes('Firestore'), false);
  });

  test('semua panggilan Admin API memakai token service account yang sah', async () => {
    const admin = await login('admin1');
    await api('POST', '/api/members', { token: admin, body: { fullName: 'Eko', username: 'eko1', password: 'Passw0rd!' } });
    assert.equal(fake.state.stats.rejectedAdminCalls, 0);
  });

  test('CORS: origin asing tidak mendapat header; origin yang diizinkan mendapat', async () => {
    const mk = (origin) => worker.fetch(new Request('https://club.test/api/health', { headers: { origin } }), { ...env, ALLOWED_ORIGINS: 'http://localhost:3000' });
    assert.equal((await mk('https://jahat.example')).headers.get('access-control-allow-origin'), null);
    assert.equal((await mk('http://localhost:3000')).headers.get('access-control-allow-origin'), 'http://localhost:3000');
  });
});
