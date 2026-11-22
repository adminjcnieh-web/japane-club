// Serializer: memilih field yang boleh dikirim ke browser + perhitungan rekap.
import { STATUSES } from './validate.js';

export function userOut(u) {
  return {
    uid: u.id,
    fullName: u.fullName,
    username: u.username,
    kelas: u.kelas || '',
    jabatan: u.jabatan || '',
    role: u.role,
    active: !!u.active,
    countsAttendance: u.countsAttendance !== false,
    permissions: {
      editAttendance: !!u.permissions?.editAttendance,
      announce: !!u.permissions?.announce,
      exportReports: !!u.permissions?.exportReports,
    },
    joinedAt: u.joinedAt || '',
    avatarVer: u.avatarVer || null,
  };
}

export function meetingOut(m) {
  return {
    id: m.id,
    name: m.name,
    description: m.description || '',
    date: m.date,
    startTime: m.startTime,
    endTime: m.endTime,
    location: m.location || '',
    status: m.status,
    lateAfterMinutes: m.lateAfterMinutes,
    createdBy: m.createdBy,
    createdByName: m.createdByName,
    createdAt: m.createdAt,
    openedAt: m.openedAt || null,
    closedAt: m.closedAt || null,
    deletedAt: m.deletedAt || null,
    deletedByName: m.deletedByName || '',
  };
}

export function recordOut(r) {
  return {
    id: r.id,
    meetingId: r.meetingId,
    meetingName: r.meetingName,
    meetingDate: r.meetingDate,
    uid: r.uid,
    memberName: r.memberName,
    username: r.username,
    kelas: r.kelas || '',
    status: r.status,
    method: r.method,
    recordedAt: r.recordedAt,
    updatedAt: r.updatedAt,
    updatedByName: r.updatedByName || '',
    note: r.note || '',
    signRequired: r.signRequired === true,
    signed: !!r.signed,
  };
}

export function announcementOut(a, now) {
  return {
    id: a.id,
    title: a.title,
    body: a.body,
    publishAt: a.publishAt,
    published: a.publishAt <= now,
    createdBy: a.createdBy,
    createdByName: a.createdByName,
    updatedAt: a.updatedAt,
  };
}

export function auditOut(a) {
  return {
    id: a.id,
    action: a.action,
    actorName: a.actorName,
    targetName: a.targetName || '',
    meetingName: a.meetingName || '',
    detail: a.detail || '',
    at: a.at,
  };
}

export function emptyTally() {
  return { hadir: 0, terlambat: 0, izin: 0, sakit: 0, alfa: 0, total: 0, percentage: 0 };
}

/** Persentase kehadiran = (hadir + terlambat) / seluruh catatan x 100. */
export function tally(records) {
  const t = emptyTally();
  for (const r of records) {
    if (STATUSES.includes(r.status)) {
      t[r.status]++;
      t.total++;
    }
  }
  t.percentage = t.total ? Math.round(((t.hadir + t.terlambat) / t.total) * 1000) / 10 : 0;
  return t;
}
