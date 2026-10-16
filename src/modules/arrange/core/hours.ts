// Active hours: for each hour of the day, the share of recent days (0–100)
// the student was on their laptop then. The Chrome extension learns them; it's
// optional, so until it has, plans use plain default hours: 8am to 11pm, with
// no hour preferred over another.

export const DEFAULT_START = 8;
export const DEFAULT_END = 23;
export const DEFAULT_HOURS: number[] = Array.from({ length: 24 }, (_, h) =>
  h >= DEFAULT_START && h < DEFAULT_END ? 50 : 0,
);

export interface Hours {
  hours: number[];
  learned: boolean;
}

export function hoursOf(saved: number[] | null | undefined): Hours {
  return saved?.length === 24
    ? { hours: saved, learned: true }
    : { hours: DEFAULT_HOURS, learned: false };
}
