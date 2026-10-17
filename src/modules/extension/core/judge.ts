import "server-only";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { claude, MODEL, tally } from "@/lib/claude";
import { Answer, check, message, SYSTEM, type Verdict } from "./site";

/** Haiku, no thinking: one word for one site. Null when the call fails, so nothing is kept. */
export async function judgeSite(host: string): Promise<Verdict | null> {
  try {
    const response = await claude().messages.parse({
      model: MODEL,
      max_tokens: 1024,
      thinking: { type: "disabled" },
      output_config: { effort: "low", format: zodOutputFormat(Answer) },
      system: [
        { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: message(host) }],
    });
    tally("site", MODEL, response.usage);
    if (response.stop_reason !== "end_turn") return null;
    return check(response.parsed_output);
  } catch (error) {
    console.error(
      `site ${host}:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
