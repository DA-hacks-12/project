// Lockdown runs while the student's Lockdown setting is on and either a
// session is under way by the plan, or focus mode is running (perhaps on a
// task ahead of its time). The extension keeps the focus part; the server
// answers the rest: the setting, and the session covering now.

export interface SessionNow {
  id: string; // the session's block, for its focus page
  until: string; // when it ends
  left: number; // seconds until then, so a pinned demo clock still counts down
  title: string;
  course: string | null;
}

interface SessionRow {
  id: string;
  start: string;
  minutes: number;
  done: boolean;
  task_id: string | null;
}

interface TaskRow {
  id: string;
  title: string;
  course: string | null;
  done: boolean;
}

/**
 * The session under way at `now`: started, not yet over, and neither it nor
 * its task marked done. When two touch or overlap, the one ending last.
 */
export function sessionCovering(
  sessions: SessionRow[],
  tasks: TaskRow[],
  now: number,
): SessionNow | null {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  let best: { id: string; end: number; task: TaskRow } | null = null;
  for (const s of sessions) {
    const start = Date.parse(s.start);
    const end = start + s.minutes * 60_000;
    const task = s.task_id ? byId.get(s.task_id) : undefined;
    if (s.done || !task || task.done) continue;
    if (!(start <= now && now < end)) continue;
    if (!best || end > best.end) best = { id: s.id, end, task };
  }
  if (!best) return null;
  return {
    id: best.id,
    until: new Date(best.end).toISOString(),
    left: Math.round((best.end - now) / 1000),
    title: best.task.title,
    course: best.task.course,
  };
}
