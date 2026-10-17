import { hhmm, type Zoned } from "@/lib/time";

// What's wrong, answered with one practical line: a student who's sick at 1am
// or out of food may not think of the options they have. Sonnet 5.5 writes the
// line in context (the owner's call); code keeps it only if it's one short
// line, and nothing shows otherwise. It runs beside the reschedule and isn't
// saved.

export const ADVICE_MAX = 140; // characters
const ADVICE_WORDS = 24;

export const ADVICE_SYSTEM = `A college student pressed Reschedule on their study plan and told us what's wrong. Their plan is being rearranged separately; you don't need to mention it. Your job is one short, practical line they can act on now, pointing to an option they may have forgotten they have.

Think about who they are, what's left of their day and the hour. A good line names one concrete next step, such as: going to sleep instead of pushing on, eating a real meal, the campus health center or a nurse line, emailing the professor or TA to ask for an extension, office hours, asking a classmate for notes.

Rules:
- One sentence of at most 18 words, plain words, no emoji.
- Don't diagnose, don't cheer them on, and don't say their plan moved.
- If it could be an emergency (chest pain, trouble breathing, a serious injury, thoughts of hurting themselves), point to emergency help: their local emergency number, or 988 in the US for a crisis.
- If their words are vague, or there's nothing useful to add, return an empty string.`;

export interface AdviceContext {
  answer: string;
  now: Zoned;
  alertness: number; // this hour, from the body clock: 0 asleep, 100 sharpest
  clock: string; // the body clock in words: "Up around 9:45am, asleep around 1:45am · Late type · …"
  workedToday: number; // minutes
  /** What's still ahead today: sessions, events and breaks. */
  rest: { start: Zoned; end: Zoned; what: string }[];
  /** The session the student rescheduled from, if any. */
  session: { title: string; course: string | null } | null;
}

/** The model's message: the context first, the student's words last. */
export function adviceMessage(context: AdviceContext): string {
  const { now } = context;
  const weekday = now.toLocaleString("en-US", { weekday: "long" });
  const lines = [
    `It's ${weekday}, ${hhmm(now)}. Alertness this hour: ${context.alertness} (0 asleep, 100 sharpest).`,
    `Body clock: ${context.clock}.`,
    `Worked today: ${context.workedToday} min.`,
  ];
  if (context.session)
    lines.push(
      `Rescheduling from a session: ${context.session.title}${context.session.course ? ` (${context.session.course})` : ""}.`,
    );
  lines.push(
    context.rest.length
      ? `Still today: ${context.rest.map((r) => `${hhmm(r.start)}–${hhmm(r.end)} ${r.what}`).join(" · ")}.`
      : "Nothing else planned today.",
    "",
    `What's wrong, in their words:\n<answer>\n${context.answer.trim().slice(0, 500)}\n</answer>`,
  );
  return lines.join("\n");
}

/** One line of at most ADVICE_MAX characters, or nothing. */
export function checkAdvice(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const line = raw.trim();
  if (!line || /[\r\n]/.test(line) || line.length > ADVICE_MAX) return null;
  // The prompt asks for 18 words; a few over is fine, a paragraph isn't.
  if (line.split(/\s+/).length > ADVICE_WORDS) return null;
  return line;
}
