import "server-only";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { claude, SONNET, tally } from "@/lib/claude";
import type { Assignment } from "./feed";
import { check, type Interpretation } from "./reading";

// One assignment → what to hand in, key requirements, minutes and kind of work.
// Claude reads each assignment once, when it first comes in or its text changes,
// and fills a fixed schema. `check` drops what doesn't hold. Dates never go to
// the model.

const SYSTEM = `You read one Canvas assignment for a college student and pull out what they need to plan their time.

deliverable: One plain line naming what they hand in or do, with its size when stated, e.g. "1,200-word argument essay, PDF upload" or "20-question timed quiz in Canvas". Null if neither the title nor the text says what the work is.

requirements: What would cost points if missed: length, format, sources, required parts, where and how to submit. Only what the text states, most important first, at most 5, each a short instruction under 15 words. Empty if the text states none.

minutes: Total time a typical undergraduate needs to do it well, from reading the instructions to submitting, including any reading or watching the assignment depends on. Null if the title and text don't tell you what the work is.

work: "deep" when it needs sustained thinking (writing, problem sets, projects, exam prep); "light" when it is short or routine (a quick quiz, a discussion reply, a survey, an upload).

Use only what the title and text say; don't invent lengths, sources or rubric items. Skip boilerplate that comes with every assignment (honor code, late policy, navigation hints) unless it changes what to do.`;

const Reading = z.object({
  deliverable: z.string().nullable(),
  requirements: z.array(z.string()),
  minutes: z.number().int().nullable(),
  work: z.enum(["deep", "light"]),
});

export function message(
  assignment: Pick<Assignment, "course" | "title" | "text">,
): string {
  const text = assignment.text || "(The feed has no assignment text.)";
  return `Course: ${assignment.course ?? "unknown"}\nTitle: ${assignment.title}\n\n<assignment_text>\n${text}\n</assignment_text>`;
}

/** Null when the model's answer can't be used; the next import tries again. */
export async function interpret(
  assignment: Assignment,
): Promise<Interpretation | null> {
  try {
    const response = await claude().messages.parse({
      model: SONNET,
      max_tokens: 16000,
      output_config: { effort: "medium", format: zodOutputFormat(Reading) },
      system: [
        { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: message(assignment) }],
    });
    tally("read", SONNET, response.usage);
    if (response.stop_reason !== "end_turn" || !response.parsed_output)
      return null;
    return check(response.parsed_output);
  } catch (error) {
    console.error(
      `Skipped ${assignment.title}:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
