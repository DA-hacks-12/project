// What the model reads from an assignment, and the checks its answer must pass.

export type Work = "deep" | "light";

export interface Interpretation {
  deliverable: string | null;
  requirements: string[];
  minutes: number | null;
  work: Work;
}

const MAX_REQUIREMENTS = 5;
const MAX_LINE = 160;
const MINUTES = { min: 5, max: 40 * 60 };

/** Keep only fields that hold; never fill a gap with a guess. */
export function check(reading: Interpretation): Interpretation {
  const requirements: string[] = [];
  for (const raw of reading.requirements) {
    const line = tidy(raw);
    if (line && !requirements.includes(line)) requirements.push(line);
  }
  const minutes = reading.minutes;
  return {
    deliverable: tidy(reading.deliverable),
    requirements: requirements.slice(0, MAX_REQUIREMENTS),
    minutes:
      minutes !== null && minutes >= MINUTES.min && minutes <= MINUTES.max
        ? minutes
        : null,
    work: reading.work,
  };
}

function tidy(text: string | null): string | null {
  if (text === null) return null;
  const line = text.split(/\s+/).filter(Boolean).join(" ");
  return line.length > 0 && line.length <= MAX_LINE ? line : null;
}
