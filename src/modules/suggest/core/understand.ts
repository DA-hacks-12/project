import "server-only";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { claude, SONNET, tally } from "@/lib/claude";
import { hhmm, shortDate, type Zoned } from "@/lib/time";
import type { Window } from "@/modules/arrange/core/plan";
import { type Changes, checkChanges } from "./changes";
import { lastNap } from "./rest";

// Reschedule asks "What's wrong?" first. Claude turns the answer into a few
// fixed kinds of change (a lighter day, busy time, a break now); code checks
// them. The model never writes text the student sees, apart from a short busy
// title taken from their own words. Vague or empty answers change nothing.

const SYSTEM = `A college student pressed Reschedule on their study plan and said what's wrong. Turn their words into changes to the plan. Only what they said; if the answer is vague, change nothing.

lighter: days that should carry less work. "I feel sick today" → today, at most 60 minutes, no deep work. "I'm wiped, nothing tonight" → today, 0 minutes. minutes is the most work that day; deep says whether hard thinking is still fine.

busy: times they can't work. "My brother's wedding from 3 to 9 on Saturday" → that day, 15:00 to 21:00, title "Brother's wedding". Start and end as HH:MM, 24-hour. The title uses their own words, at most 5 words. Their workload stays; it just moves around the busy time.

rest: one break to take right now, only if their words call for it.
- nap, 10 to 20 minutes: sleepy or drained, especially in the early-afternoon dip. Short naps refresh without grogginess. Not after the nap cutoff given: a nap close to bedtime pushes sleep later.
- walk, 10 to 30 minutes: can't focus, restless, stressed or mentally worn out. Time outside, ideally near trees or water, restores attention.
- eat, 15 to 40 minutes: hungry, shaky, or hasn't eaten in a while.
- move, 5 to 15 minutes: stiff, bored, or has been sitting too long.

Use the day numbers given. Leave lists empty and rest null when nothing calls for them. Don't guess.`;

const Raw = z.object({
  lighter: z.array(
    z.object({
      day: z.number().int(),
      minutes: z.number().int(),
      deep: z.boolean(),
    }),
  ),
  busy: z.array(
    z.object({
      day: z.number().int(),
      start: z.string(),
      end: z.string(),
      title: z.string(),
    }),
  ),
  rest: z
    .object({
      kind: z.enum(["nap", "walk", "eat", "move"]),
      minutes: z.number().int(),
    })
    .nullable(),
});

export interface Understand {
  answer: string;
  now: Zoned;
  days: Window[];
  restStart: Zoned;
  activeShare: number;
  asleep: number; // when they usually fall asleep, minutes from midnight
  day?: number; // the day being rescheduled, when it isn't today
  workedToday: number;
  lastBreakEnd: Zoned | null;
  session: { title: string; work: string } | null;
}

export async function understand(input: Understand): Promise<Changes | null> {
  const answer = input.answer.trim().slice(0, 500);
  if (!answer) return null;
  const days = input.days.map(
    (day, d) =>
      `${d} · ${shortDate(day.end.subtract({ days: 1 }))}${d === 0 ? " (today)" : ""}`,
  );
  const text = [
    `It's ${hhmm(input.now)}. Alertness this hour: ${input.activeShare} (0 asleep, 100 sharpest). No naps after ${clockOf(lastNap(input.asleep))}: they usually fall asleep around ${clockOf(input.asleep)}.`,
    `Worked today: ${input.workedToday} min. Last break: ${input.lastBreakEnd ? `ended ${hhmm(input.lastBreakEnd)}` : "none yet"}.`,
    input.session
      ? `Rescheduling from a session: ${input.session.title} (${input.session.work} work).`
      : "",
    "",
    "Days (this week and next):",
    ...days,
    input.day
      ? `Rescheduling day ${input.day}: unless they name another day, what they describe is on that day.`
      : "",
    "",
    `What's wrong, in their words:\n<answer>\n${answer}\n</answer>`,
  ]
    .filter((line) => line !== "")
    .join("\n");
  const response = await claude().messages.parse({
    model: SONNET,
    max_tokens: 16000,
    output_config: { effort: "medium", format: zodOutputFormat(Raw) },
    system: [
      { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: text }],
  });
  tally("whats-wrong", SONNET, response.usage);
  if (response.stop_reason !== "end_turn" || !response.parsed_output)
    return null;
  return checkChanges(
    response.parsed_output,
    input.days,
    input.now,
    input.restStart,
    input.asleep,
  );
}

/** "18:30" from minutes after midnight. */
function clockOf(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
