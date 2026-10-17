import "server-only";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { claude, SONNET } from "@/lib/claude";
import type { createClient } from "@/lib/supabase/server";
import { addMinutes, minutesBetween, zoned } from "@/lib/time";
import { bodyClockOf, describe } from "@/modules/arrange/core/body-clock";
import {
  ADVICE_SYSTEM,
  type AdviceContext,
  adviceMessage,
  checkAdvice,
} from "./advice";

// The one-line advice on What's wrong: read the day, ask Sonnet 5.5 (medium
// effort), keep the line only if it holds. Runs beside the reschedule.

type Client = Awaited<ReturnType<typeof createClient>>;

const Advice = z.object({ advice: z.string() });

export async function advise(
  supabase: Client,
  nowDate: Date,
  options: { answer?: string; dismiss?: string },
): Promise<string | null> {
  const answer = options.answer?.trim() ?? "";
  if (!answer) return null;

  const [settingsResult, blocksResult, tasksResult] = await Promise.all([
    supabase.from("settings").select("time_zone, nights, clock").maybeSingle(),
    supabase.from("blocks").select("id, kind, start, minutes, task_id, title"),
    supabase.from("tasks").select("id, title, course"),
  ]);
  for (const r of [settingsResult, blocksResult, tasksResult])
    if (r.error) throw r.error;
  const settings = settingsResult.data;
  const now = zoned(nowDate, settings?.time_zone ?? "UTC");
  const bodyClock = bodyClockOf(settings ?? {});
  const tasks = new Map((tasksResult.data ?? []).map((t) => [t.id, t]));
  const today = (blocksResult.data ?? [])
    .map((b) => {
      const start = zoned(b.start, now.timeZoneId);
      return { ...b, start, end: addMinutes(start, b.minutes) };
    })
    .filter((b) => b.start.toPlainDate().equals(now.toPlainDate()))
    .sort((a, b) => a.start.epochMilliseconds - b.start.epochMilliseconds);
  const from = today.find((b) => b.id === options.dismiss);
  const what = (b: (typeof today)[number]) =>
    b.kind === "session"
      ? (tasks.get(b.task_id ?? "")?.title ?? "a session")
      : b.kind === "break"
        ? "a break"
        : (b.title ?? "an event");

  const context: AdviceContext = {
    answer,
    now,
    alertness: bodyClock.hours[now.hour],
    clock: describe(bodyClock),
    workedToday: today
      .filter((b) => b.kind === "session" && b !== from)
      .reduce(
        (sum, b) =>
          sum + Math.max(0, Math.min(b.minutes, minutesBetween(b.start, now))),
        0,
      ),
    rest: today
      .filter(
        (b) => b !== from && b.end.epochMilliseconds > now.epochMilliseconds,
      )
      .map((b) => ({ start: b.start, end: b.end, what: what(b) })),
    session: from?.task_id
      ? {
          title: what(from),
          course: tasks.get(from.task_id)?.course ?? null,
        }
      : null,
  };

  const response = await claude().messages.parse({
    model: SONNET,
    max_tokens: 8000,
    output_config: { effort: "medium", format: zodOutputFormat(Advice) },
    system: [
      {
        type: "text",
        text: ADVICE_SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: adviceMessage(context) }],
  });
  if (response.stop_reason !== "end_turn" || !response.parsed_output)
    return null;
  return checkAdvice(response.parsed_output.advice);
}
