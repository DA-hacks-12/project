import "server-only";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { claude, SONNET, tally } from "@/lib/claude";
import { type CheckedClass, checkClasses } from "./reading";

// A class schedule (a screenshot or PDF from the school's portal) → the
// student's weekly class meetings. Sonnet 5.5 at medium effort reads it into
// a fixed schema; `checkClasses` keeps what holds. The model never does date
// math: it copies days, times and any term dates as shown.

const SYSTEM = `You read a college student's class schedule, a screenshot or PDF from their school's portal, and list their weekly class meetings.

Only meetings that repeat every week at set times: lectures, labs, discussions, sections, studios. Leave out online or asynchronous classes with no meeting time, final exams, holidays, and anything shown without days and times.

For each meeting:
- title: the course code and the kind of meeting as shown, e.g. "PHYS 2A Lecture" or "BIOL 11 Lab", at most 40 characters.
- days: the weekdays it meets, as numbers: Sunday 0, Monday 1, Tuesday 2, Wednesday 3, Thursday 4, Friday 5, Saturday 6. Portals abbreviate them: M, T or Tu, W, R or Th, F, S or Sa, U or Su; "TTh" is Tuesday and Thursday.
- start and end: as shown, as HH:MM on a 24-hour clock ("1:30 PM" is "13:30").
- place: building and room, short, or null.
- from and until: the first and last day of the term as YYYY-MM-DD, only if the schedule shows them; otherwise null.

A course that meets at different times on different days is one entry per time. If the file isn't a class schedule, return no meetings.`;

const Schedule = z.object({
  classes: z.array(
    z.object({
      title: z.string(),
      days: z.array(z.number().int()),
      start: z.string(),
      end: z.string(),
      place: z.string().nullable(),
      from: z.string().nullable(),
      until: z.string().nullable(),
    }),
  ),
});

export type ScheduleFile =
  | {
      kind: "image";
      mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
      data: string; // base64
    }
  | { kind: "pdf"; data: string };

/** The meetings that hold; empty when nothing in the file reads as a class schedule. */
export async function readSchedule(
  file: ScheduleFile,
): Promise<CheckedClass[]> {
  const content =
    file.kind === "pdf"
      ? ({
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: file.data,
          },
        } as const)
      : ({
          type: "image",
          source: {
            type: "base64",
            media_type: file.mediaType,
            data: file.data,
          },
        } as const);
  const response = await claude().messages.parse({
    model: SONNET,
    max_tokens: 16000,
    output_config: { effort: "medium", format: zodOutputFormat(Schedule) },
    system: [
      { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
    ],
    messages: [
      {
        role: "user",
        content: [content, { type: "text", text: "My class schedule." }],
      },
    ],
  });
  tally("classes", SONNET, response.usage);
  if (response.stop_reason !== "end_turn" || !response.parsed_output) return [];
  return checkClasses(response.parsed_output.classes);
}
