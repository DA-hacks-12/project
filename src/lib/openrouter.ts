import "server-only";
import { z } from "zod";

// Reschedule → Week runs on an open model through OpenRouter (the owner's
// call, so a replan on stage takes seconds, not 30–40 of Sonnet's thinking).
// Same prompt, same fixed answer shape, same code checks after. Pinned to one
// provider; if it fails or is slow, the caller falls back to Claude.

export const FAST_MODEL = "qwen/qwen3.8-27b";
const PROVIDER = "modelrun/fp4";
const URL = "https://openrouter.ai/api/v1/chat/completions";
const TIMEOUT_MS = 45_000;

/** The model's answer in `schema`'s shape, or null when it can't be had or doesn't hold. */
export async function fastAnswer<T extends z.ZodType>(
  name: string,
  schema: T,
  system: string,
  user: string,
): Promise<z.infer<T> | null> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null;
  const started = Date.now();
  const response = await fetch(URL, {
    method: "POST",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: FAST_MODEL,
      provider: {
        order: [PROVIDER],
        allow_fallbacks: false,
        require_parameters: true,
      },
      reasoning: { enabled: false },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name, strict: true, schema: z.toJSONSchema(schema) },
      },
      usage: { include: true },
    }),
  });
  if (!response.ok)
    throw new Error(
      `openrouter ${response.status}: ${(await response.text()).slice(0, 200)}`,
    );
  const body = await response.json();
  console.info(
    `openrouter ${name}: in ${body.usage?.prompt_tokens}, out ${body.usage?.completion_tokens}, ${Date.now() - started}ms ≈ $${body.usage?.cost ?? "?"}`,
  );
  const text = body.choices?.[0]?.message?.content;
  if (typeof text !== "string") return null;
  try {
    const parsed = schema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
