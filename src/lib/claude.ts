import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// Sonnet 5.5 at medium effort for the thinking: reading assignments, What's
// wrong, the plan, the advice and the nature suggestions (the owner's call)…
export const SONNET = "claude-sonnet-5-5";
// …and Haiku 5.5 with no thinking for the one call a page waits on: Lockdown's
// "is this site a distraction?".
export const MODEL = "claude-haiku-5-5";

let client: Anthropic | undefined;

/** The SDK reads ANTHROPIC_API_KEY from the server's environment. */
export function claude(): Anthropic {
  // Imports run many calls at once; a few more retries ride out rate limits.
  client ??= new Anthropic({ maxRetries: 4 });
  return client;
}

// Dollars per million tokens (thinking counts as output).
const PRICE: Record<
  string,
  { input: number; output: number; cacheRead: number; cacheWrite: number }
> = {
  [SONNET]: { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  [MODEL]: { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};

interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

/** One line per model call in the server log: what it read, wrote and cost. */
export function tally(what: string, model: string, usage: Usage): void {
  const price = PRICE[model];
  const read = usage.cache_read_input_tokens ?? 0;
  const wrote = usage.cache_creation_input_tokens ?? 0;
  const dollars = price
    ? (usage.input_tokens * price.input +
        read * price.cacheRead +
        wrote * price.cacheWrite +
        usage.output_tokens * price.output) /
      1e6
    : 0;
  console.info(
    `claude ${what}: in ${usage.input_tokens} + cached ${read} + cache-write ${wrote}, out ${usage.output_tokens} (incl. thinking) ≈ $${dollars.toFixed(4)}`,
  );
}
