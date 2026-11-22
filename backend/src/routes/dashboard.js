import { isStaff } from '../lib/guard.js';
import { announcementOut, auditOut, meetingOut, recordOut, tally, emptyTally } from '../lib/models.js';
import { STATUSES } from '../lib/validate.js';
import { localDate, monthStartBack, tzOffset } from '../lib/time.js';

// Cache singkat per isolate agar dashboard yang sering dibuka tidak menghabiskan kuota baca Firestore.
const CACHE_MS = 60000;
const cache = new Map();

export function clearDashboardCache() {
  cache.clear();
}

async function cached(key, now, build) {
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_MS) return hit.data;
  const data = await build();
  cache.set(key, { at: now, data });
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return data;
}

function nextMeetingOf(meetings, today) {
  return (
    meetings
      .filter((m) => m.status !== 'closed' && m.date >= today)
      .sort((a, b) => (a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date)))[0] || null
  );
}

async function latestAnnouncements(ctx, n = 3) {
  const all = await ctx.fs.query('announcements', { orderBy: ['publishAt', 'DESC'], limit: 20 });
  return all.filter((a) => a.publishAt <= ctx.now).slice(0, n).map((a) => announcementOut(a, ctx.now));
}

export async function get(ctx) {
  const nowMs = ctx.now.getTime();
  const today = localDate(nowMs, tzOffset(ctx.env));
  const month = today.slice(0, 7);

  if (!isStaff(ctx.auth.user)) {
    let [records, meetings, announcements] = await Promise.all([
      ctx.fs.query('attendance', { where: [['uid', '==', ctx.auth.uid]] }),
      ctx.fs.query('meetings', { where: [['date', '>=', today]] }),
      latestAnnouncements(ctx),
    ]);
    records = records.filter((r) => !r.meetingDeleted);
    meetings = meetings.filter((m) => !m.deletedAt);
    records.sort((a, b) => (a.meetingDate < b.meetingDate ? 1 : -1));
    const open = meetings.find((m) => m.status === 'open');
    const next = nextMeetingOf(meetings, today);
    return {
      role: 'member',
      summary: tally(records),
      monthSummary: tally(records.filter((r) => r.meetingDate.startsWith(month))),
      recent: records.slice(0, 8).map(recordOut),
      nextMeeting: next ? meetingOut(next) : null,
      openMeeting: open ? meetingOut(open) : null,
      announcements,
    };
  }

  return cached('staff', nowMs, async () => {
    let [users, meetings, records, activity, announcements] = await Promise.all([
      ctx.fs.list('users'),
      ctx.fs.list('meetings'),
      ctx.fs.query('attendance', { where: [['meetingDate', '>=', monthStartBack(today, 5)]] }),
      ctx.fs.query('audit', { orderBy: ['at', 'DESC'], limit: 10 }),
      latestAnnouncements(ctx),
    ]);

    meetings = meetings.filter((m) => !m.deletedAt);
    records = records.filter((r) => !r.meetingDeleted);
    const active = users.filter((u) => u.active);
    const tracked = active.filter((u) => u.countsAttendance !== false);

    // Grafik 6 bulan terakhir
    const months = [];
    for (let i = 5; i >= 0; i--) months.push(monthStartBack(today, i).slice(0, 7));
    const chart = months.map((m) => ({ month: m, ...tally(records.filter((r) => r.meetingDate.startsWith(m))) }));

    const monthRecords = records.filter((r) => r.meetingDate.startsWith(month));
    const monthTally = tally(monthRecords);
    const openMeeting = meetings.filter((m) => m.status === 'open').sort((a, b) => (a.date < b.date ? 1 : -1))[0] || null;

    let notYetPresent = null;
    if (openMeeting) {
      const present = new Set(records.filter((r) => r.meetingId === openMeeting.id).map((r) => r.uid));
      notYetPresent = tracked.filter((u) => !present.has(u.id)).length;
    }

    return {
      role: 'staff',
      stats: {
        activeMembers: active.filter((u) => u.role === 'member').length,
        officers: active.filter((u) => u.role === 'officer').length,
        totalMeetings: meetings.length,
        closedMeetings: meetings.filter((m) => m.status === 'closed').length,
        monthMeetings: meetings.filter((m) => m.date.startsWith(month)).length,
        monthAttendance: monthTally.hadir + monthTally.terlambat,
        monthPercentage: monthTally.percentage,
        notYetPresent,
      },
      monthStatus: Object.fromEntries(STATUSES.map((s) => [s, monthTally[s]])),
      chart,
      openMeeting: openMeeting ? meetingOut(openMeeting) : null,
      nextMeeting: nextMeetingOf(meetings, today) ? meetingOut(nextMeetingOf(meetings, today)) : null,
      activity: activity.map(auditOut),
      announcements,
      generatedAt: ctx.now,
    };
  });
}
