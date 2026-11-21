// Jejak audit: setiap perubahan penting dicatat (siapa, kapan, apa).
// Juga dipakai untuk "Aktivitas terbaru" di dashboard.
import { op, newId } from './firestore.js';

/**
 * Mengembalikan operasi tulis yang bisa digabung ke commit lain agar atomik.
 * entry: { action, actor:{uid,user}, targetUid?, targetName?, meetingId?, meetingName?, detail? }
 */
export function auditOp(entry, now) {
  return op.create(`audit/${newId()}`, {
    action: entry.action,
    actorUid: entry.actor.uid,
    actorName: entry.actor.user.fullName,
    targetUid: entry.targetUid || null,
    targetName: entry.targetName || '',
    meetingId: entry.meetingId || null,
    meetingName: entry.meetingName || '',
    detail: entry.detail || '',
    at: now,
  });
}
