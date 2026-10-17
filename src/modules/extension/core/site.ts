import { z } from "zod";

// Lockdown asks, once per site, whether a site is for study or a distraction.
// The extension sends only the site's address (its hostname); the model
// picks one word from a fixed list, and code keeps it only if it's one of them.
// When in doubt the answer is "unsure", and an unsure site stays open.

export const SYSTEM = `A college student has turned on Lockdown for a focus session and just opened a website. From its address alone, say what the site is mainly for.

study: mainly for studying or work: course sites and learning platforms, references and encyclopedias, documentation, research and library sites, school email, writing, coding and office tools, search engines.
distraction: mainly entertainment or idle browsing: video and streaming, social media, games, shopping, sports, gossip and memes.
unsure: you don't know the site, or it serves both about equally.

Judge the site as a whole, not what one page on it might show. When in doubt, answer unsure.`;

export const Answer = z.object({
  verdict: z.enum(["study", "distraction", "unsure"]),
});

export type Verdict = z.infer<typeof Answer>["verdict"];

/** The model's answer if it's one of the three words, else unsure. */
export function check(output: unknown): Verdict {
  const parsed = Answer.safeParse(output);
  return parsed.success ? parsed.data.verdict : "unsure";
}

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * A plain hostname ("youtube.com"), lowercased and without "www.", or null
 * when it isn't one: no scheme, port, path or spaces, at least one dot.
 */
export function plainHost(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const host = input
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");
  if (host.length > 253) return null;
  const labels = host.split(".");
  return labels.length >= 2 && labels.every((l) => LABEL.test(l)) ? host : null;
}

export function message(host: string): string {
  return `<site>${host}</site>`;
}
