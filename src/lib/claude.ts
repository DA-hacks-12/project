import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// Haiku 5.5 for every model call (a presentation project; see CLAUDE.md).
export const MODEL = "claude-haiku-5-5";

let client: Anthropic | undefined;

/** The SDK reads ANTHROPIC_API_KEY from the server's environment. */
export function claude(): Anthropic {
  // Imports run many calls at once; a few more retries ride out rate limits.
  client ??= new Anthropic({ maxRetries: 4 });
  return client;
}
