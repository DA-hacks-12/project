import "server-only";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { claude, SONNET } from "@/lib/claude";
import {
  checkNature,
  freeGaps,
  NATURE_SYSTEM,
  type NatureInput,
  natureMessage,
  type Outing,
  Suggestions,
} from "./nature";

/**
 * Sonnet 5.5 (medium effort) picks one outing a day where one fits; code
 * keeps the picks that hold. Nothing on failure: the plan stands without them.
 */
export async function pickNature(input: NatureInput): Promise<Outing[]> {
  const days = input.days.filter(
    (d) => freeGaps(d, input.hours, input.now).length > 0,
  );
  if (input.places.length === 0 || days.length === 0) return [];
  const asked = { ...input, days };
  try {
    const response = await claude().messages.parse({
      model: SONNET,
      max_tokens: 16000,
      output_config: { effort: "medium", format: zodOutputFormat(Suggestions) },
      system: [
        {
          type: "text",
          text: NATURE_SYSTEM,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: natureMessage(asked) }],
    });
    if (response.stop_reason !== "end_turn" || !response.parsed_output)
      return [];
    return checkNature(response.parsed_output.suggestions, asked);
  } catch (error) {
    console.error(
      "nature suggestions",
      error instanceof Error ? error.message : error,
    );
    return [];
  }
}
