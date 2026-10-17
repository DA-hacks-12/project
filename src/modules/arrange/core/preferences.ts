// How the student likes to work, set in Options. Each preference is a pair of
// opposite choices; unset means no preference. A choice reaches the planner as
// one line of its prompt, and outranks the research guidelines but never the
// hard rules. A new preference is one more entry here.

export const PREFERENCES = {
  sessions: {
    label: "Chunking",
    choices: {
      short: {
        label: "25–45 min",
        rule: "Small chunks: sessions of 25 to 45 minutes, more of them.",
      },
      long: {
        label: "60–90 min",
        rule: "Big chunks: sessions of 60 to 90 minutes, fewer of them.",
      },
    },
  },
  start: {
    label: "Start with",
    choices: {
      easy: {
        label: "Easy work",
        rule: "Easy first: start each day with light work, then the deep work.",
      },
      hard: {
        label: "Hard work",
        rule: "Hard first: start each day with the deep work, then the light work.",
      },
    },
  },
  breaks: {
    label: "Breaks",
    choices: {
      short: {
        label: "10 min",
        rule: "Short breaks: about 10 minutes between sessions.",
      },
      long: {
        label: "30 min",
        rule: "Long breaks: about 30 minutes between sessions.",
      },
    },
  },
  courses: {
    label: "Courses a day",
    choices: {
      few: {
        label: "One or two",
        rule: "Few courses a day: keep each day to one or two courses.",
      },
      many: {
        label: "Several",
        rule: "Variety: spread several courses through each day.",
      },
    },
  },
  finish: {
    label: "Finish",
    choices: {
      early: {
        label: "Early",
        rule: "Finish early: get each task done well before it's due, front-loading the week.",
      },
      late: {
        label: "Near due",
        rule: "Near the due date: spread each task out up to its due date.",
      },
    },
  },
  weekends: {
    label: "Weekends",
    choices: {
      light: {
        label: "Lighter",
        rule: "Lighter weekends: put less work on Saturday and Sunday.",
      },
      full: {
        label: "Full",
        rule: "Weekends like weekdays: use Saturday and Sunday as fully as other days.",
      },
    },
  },
} as const;

type Registry = typeof PREFERENCES;
export type PreferenceKey = keyof Registry;
export type Preferences = {
  [K in PreferenceKey]?: keyof Registry[K]["choices"];
};

/** The saved preferences, keeping only real choices. */
export function preferencesOf(saved: unknown): Preferences {
  if (!saved || typeof saved !== "object") return {};
  const kept: Record<string, string> = {};
  for (const [key, entry] of Object.entries(PREFERENCES)) {
    const value = (saved as Record<string, unknown>)[key];
    if (typeof value === "string" && value in entry.choices) kept[key] = value;
  }
  return kept as Preferences;
}

/** The planner's lines for the chosen preferences. */
export function preferenceRules(preferences: Preferences): string[] {
  return Object.entries(PREFERENCES).flatMap(([key, entry]) => {
    const value = preferences[key as PreferenceKey];
    const choices: Record<string, { rule: string }> = entry.choices;
    return value ? [choices[value].rule] : [];
  });
}
