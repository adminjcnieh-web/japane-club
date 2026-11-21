import { HttpError } from '../lib/http.js';
import * as v from '../lib/validate.js';
import { op } from '../lib/firestore.js';
import { auditOp } from '../lib/audit.js';
import { createAuthUser, deleteAuthUser, updateAuthUser } from '../lib/google.js';
import { isStaff, requireRole } from '../lib/guard.js';
import { userOut, recordOut, tally } from '../lib/models.js';
import { FirestoreError } from '../lib/firestore.js';
import { localDate } from '../lib/time.js';
import { tzOffset } from '../lib/time.js';

const byName = (a, b) => a.fullName.localeCompare(b.fullName, 'id');

export async function list(ctx) {
  if (!isStaff(ctx.auth.user)) throw new HttpError(403, 'Hanya pengurus yang boleh melihat daftar anggota', 'forbidden');
  const users = await ctx.fs.list('users');
  return { members: users.sort(byName).map(userOut) };
}

export async function detail(ctx) {
  const { uid } = ctx.params;
  if (uid !== ctx.auth.uid && !isStaff(ctx.auth.user)) throw new HttpError(403, 'Kamu hanya boleh melihat profilmu sendiri', 'forbidden');
  const user = await ctx.fs.get(`users/${uid}`);
  if (!user) throw new HttpError(404, 'Anggota tidak ditemukan', 'not_found');
  return { member: userOut(user) };
}

export async function history(ctx) {
  const { uid } = ctx.params;
  if (uid !== ctx.auth.uid && !isStaff(ctx.auth.user)) throw new HttpError(403, 'Kamu hanya boleh melihat riwayatmu sendiri', 'forbidden');
  const user = await ctx.fs.get(`users/${uid}`);
  if (!user) throw new HttpError(404, 'Anggota tidak ditemukan', 'not_found');
  const records = (await ctx.fs.query('attendance', { where: [['uid', '==', uid]] }))
    .sort((a, b) => (a.meetingDate < b.meetingDate ? 1 : -1));
  return { member: userOut(user), summary: tally(records), records: records.map(recordOut) };
}

export async function create(ctx) {
  requireRole(ctx, 'admin');
  const b = await ctx.json();
  const username = v.username(b.username);
  const data = {
    fullName: v.str(b.fullName, { name: 'Nama lengkap', min: 2, max: 80 }),
    username,
    usernameLower: username,
    kelas: v.str(b.kelas, { name: 'Kelas', max: 20 }),
    jabatan: v.str(b.jabatan, { name: 'Jabatan', max: 40 }),
    role: v.oneOf(b.role || 'member', v.ROLES, 'Role'),
    active: true,
    joinedAt: b.joinedAt ? v.dateStr(b.joinedAt, 'Tanggal bergabung') : localDate(ctx.now.getTime(), tzOffset(ctx.env)),
    permissions: v.permissions(b.permissions),
  };
  data.countsAttendance = b.countsAttendance === undefined ? data.role !== 'admin' : v.bool(b.countsAttendance, 'Ikut absensi');
  const password = v.password(b.password);

  // Cek cepat (UX); keunikan sebenarnya dijamin oleh Firebase Auth dan dokumen usernames/.
  if (await ctx.fs.get(`usernames/${username}`)) throw new HttpError(409, 'Username sudah dipakai', 'username_taken');

  const uid = await createAuthUser(ctx.env, { username, password, displayName: data.fullName });
  try {
    await ctx.fs.commit([
      op.create(`usernames/${username}`, { uid, createdAt: ctx.now }),
      op.create(`users/${uid}`, { ...data, createdAt: ctx.now, updatedAt: ctx.now, createdBy: ctx.auth.uid }),
      auditOp({ action: 'member.create', actor: ctx.auth, targetUid: uid, targetName: data.fullName, detail: `role ${data.role}` }, ctx.now),
    ]);
  } catch (e) {
    await deleteAuthUser(ctx.env, uid); // batalkan agar tidak ada akun yatim
    if (e instanceof FirestoreError && e.code === 'ALREADY_EXISTS') throw new HttpError(409, 'Username sudah dipakai', 'username_taken');
    throw e;
  }
  return { member: userOut({ id: uid, ...data }) };
}

async function activeAdminCount(ctx, exceptUid) {
  const admins = await ctx.fs.query('users', { where: [['role', '==', 'admin']] });
  return admins.filter((u) => u.active && u.id !== exceptUid).length;
}

export async function update(ctx) {
  requireRole(ctx, 'admin');
  const { uid } = ctx.params;
  const target = await ctx.fs.get(`users/${uid}`);
  if (!target) throw new HttpError(404, 'Anggota tidak ditemukan', 'not_found');
  const b = await ctx.json();
  const patch = {};
  if (b.fullName !== undefined) patch.fullName = v.str(b.fullName, { name: 'Nama lengkap', min: 2, max: 80 });
  if (b.kelas !== undefined) patch.kelas = v.str(b.kelas, { name: 'Kelas', max: 20 });
  if (b.jabatan !== undefined) patch.jabatan = v.str(b.jabatan, { name: 'Jabatan', max: 40 });
  if (b.joinedAt !== undefined) patch.joinedAt = v.dateStr(b.joinedAt, 'Tanggal bergabung');
  if (b.permissions !== undefined) patch.permissions = v.permissions(b.permissions);
  if (b.countsAttendance !== undefined) patch.countsAttendance = v.bool(b.countsAttendance, 'Ikut absensi');
  if (b.role !== undefined) {
    patch.role = v.oneOf(b.role, v.ROLES, 'Role');
    if (target.role === 'admin' && patch.role !== 'admin') {
      if (uid === ctx.auth.uid) throw new HttpError(400, 'Kamu tidak bisa menurunkan role dirimu sendiri', 'self_demote');
      if ((await activeAdminCount(ctx, uid)) < 1) throw new HttpError(400, 'Harus ada minimal satu admin aktif', 'last_admin');
    }
  }
  if (Object.keys(patch).length === 0) throw new HttpError(400, 'Tidak ada data yang diubah', 'validation');
  patch.updatedAt = ctx.now;

  const writes = [op.update(`users/${uid}`, patch)];
  if (patch.fullName && patch.fullName !== target.fullName) {
    await updateAuthUser(ctx.env, uid, { displayName: patch.fullName });
  }
  const changed = Object.keys(patch).filter((k) => k !== 'updatedAt').join(', ');
  writes.push(auditOp({ action: 'member.update', actor: ctx.auth, targetUid: uid, targetName: patch.fullName || target.fullName, detail: changed }, ctx.now));
  await ctx.fs.commit(writes);
  return { member: userOut({ ...target, ...patch }) };
}

export async function setActive(ctx) {
  requireRole(ctx, 'admin');
  const { uid } = ctx.params;
  const b = await ctx.json();
  const active = v.bool(b.active, 'Status aktif');
  const target = await ctx.fs.get(`users/${uid}`);
  if (!target) throw new HttpError(404, 'Anggota tidak ditemukan', 'not_found');
  if (!active) {
    if (uid === ctx.auth.uid) throw new HttpError(400, 'Kamu tidak bisa menonaktifkan akunmu sendiri', 'self_disable');
    if (target.role === 'admin' && (await activeAdminCount(ctx, uid)) < 1) {
      throw new HttpError(400, 'Harus ada minimal satu admin aktif', 'last_admin');
    }
  }
  await updateAuthUser(ctx.env, uid, { disableUser: !active });
  await ctx.fs.commit([
    op.update(`users/${uid}`, { active, updatedAt: ctx.now }),
    auditOp({ action: active ? 'member.activate' : 'member.deactivate', actor: ctx.auth, targetUid: uid, targetName: target.fullName }, ctx.now),
  ]);
  return { member: userOut({ ...target, active }) };
}

export async function resetPassword(ctx) {
  requireRole(ctx, 'admin');
  const { uid } = ctx.params;
  const b = await ctx.json();
  const password = v.password(b.newPassword, 'Password baru');
  const target = await ctx.fs.get(`users/${uid}`);
  if (!target) throw new HttpError(404, 'Anggota tidak ditemukan', 'not_found');
  await updateAuthUser(ctx.env, uid, { password });
  await ctx.fs.commit([
    auditOp({ action: 'member.password_reset', actor: ctx.auth, targetUid: uid, targetName: target.fullName }, ctx.now),
  ]);
  return { ok: true };
}
