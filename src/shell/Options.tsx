"use client";

import {
  Button,
  Flex,
  Heading,
  SegmentedControl,
  Separator,
  Switch,
  Text,
} from "@radix-ui/themes";
import { useState } from "react";
import {
  bodyClockOf,
  type Clock,
  describe,
} from "@/modules/arrange/core/body-clock";
import {
  PREFERENCES,
  type PreferenceKey,
  preferencesOf,
} from "@/modules/arrange/core/preferences";
import {
  activityFromExtension,
  syncLockdown,
  useExtension,
} from "@/modules/extension/ui/bridge";
import {
  signOut,
  usePlannerData,
  useSaveActivity,
  useSaveClock,
  useSaveFocusSettings,
  useSavePreferences,
} from "@/modules/planner/ui/planner";
import { Classes } from "./Classes";
import { Feeds } from "./Feeds";
import { Location } from "./Location";
import styles from "./options.module.css";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

/** Options, as its own page: schools, classes, where walks start, the body clock, preferences, focus and the account. */
export function Options() {
  return (
    <Flex direction="column" gap="5" className={styles.page}>
      <Heading size="8" className={styles.big}>
        Options
      </Heading>
      <Section title="Canvas">
        <Feeds />
      </Section>
      <Separator size="4" />
      <Section title="Classes">
        <Classes />
      </Section>
      <Separator size="4" />
      <Section title="Location">
        <Location />
      </Section>
      <Separator size="4" />
      <Section title="Body clock">
        <BodyClock />
      </Section>
      <Separator size="4" />
      <Section title="Preferences">
        <Preferences />
      </Section>
      <Separator size="4" />
      <Section title="Focus">
        <FocusSettings />
      </Section>
      <Separator size="4" />
      <Section title="Account">
        <Account />
      </Section>
    </Flex>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Flex direction="column" gap="2">
      <Heading size="3">{title}</Heading>
      {children}
    </Flex>
  );
}

const CLOCKS = [
  { value: "morning", label: "Morning" },
  { value: "any", label: "Any" },
  { value: "night", label: "Night" },
] as const;

const SOURCE = {
  learned: (nights: number) => `From your browser, ${nights} nights`,
  set: () => "Set by you",
  default: () => "Default",
};

/**
 * The body clock: when the student sleeps, their chronotype and their
 * alertness through the day. Learned by the optional extension, or set here
 * as a morning or night person, which wins; otherwise a default.
 */
function BodyClock() {
  const planner = usePlannerData();
  const saveActivity = useSaveActivity();
  const saveClock = useSaveClock();
  const extension = useExtension();
  const [checking, setChecking] = useState(false);
  const clock = bodyClockOf(planner.settings ?? {});
  const [first, end] = clock.sharpest;
  const sharp = (hour: number) =>
    first < end ? hour >= first && hour < end : hour >= first || hour < end;

  return (
    <Flex direction="column" gap="3">
      <Text size="2">{describe(clock)}</Text>
      <div className={styles.bars} role="img" aria-label="Alertness by hour">
        {HOURS.map((hour) => (
          <span
            key={hour}
            className={`${styles.bar} ${sharp(hour) ? styles.sharp : ""}`}
            style={{ height: `${clock.hours[hour]}%` }}
          />
        ))}
      </div>
      <div className={styles.ticks} aria-hidden>
        {[0, 6, 12, 18].map((hour) => (
          <span key={hour} style={{ gridColumn: hour + 1 }}>
            {hour % 12 || 12}
            {hour < 12 ? "am" : "pm"}
          </span>
        ))}
      </div>
      <Flex align="center" justify="between" gap="4">
        <Text size="2" color="gray">
          {SOURCE[clock.source](clock.nights)}
        </Text>
        <SegmentedControl.Root
          aria-label="Body clock"
          value={planner.settings?.clock ?? "any"}
          onValueChange={(value) =>
            saveClock.mutate({
              clock: value === "any" ? null : (value as Clock),
            })
          }
          className={styles.pair}
        >
          {CLOCKS.map((c) => (
            <SegmentedControl.Item key={c.value} value={c.value}>
              {c.label}
            </SegmentedControl.Item>
          ))}
        </SegmentedControl.Root>
      </Flex>
      {extension !== null && (
        <Flex align="center" justify="between" gap="4">
          <Text size="2" color="gray">
            {extension ? "Extension connected" : "Extension not connected"}
          </Text>
          {extension && (
            <Button
              variant="soft"
              loading={checking}
              onClick={async () => {
                setChecking(true);
                const found = await activityFromExtension();
                setChecking(false);
                if (found) saveActivity.mutate(found);
              }}
            >
              Refresh
            </Button>
          )}
        </Flex>
      )}
    </Flex>
  );
}

/** Each preference is a pair of opposites with "Any" between them. */
function Preferences() {
  const planner = usePlannerData();
  const save = useSavePreferences();
  const chosen: Record<string, string> = preferencesOf(
    planner.settings?.preferences,
  );

  return (
    <div className={styles.preferences}>
      {Object.entries(PREFERENCES).map(([key, entry]) => {
        const [first, second] = Object.entries(entry.choices);
        const choose = (value: string) => {
          const { [key]: _, ...rest } = chosen;
          save.mutate({
            preferences: value === "any" ? rest : { ...rest, [key]: value },
          });
        };
        return (
          <Flex key={key} align="center" justify="between" gap="4">
            <Text size="2" id={`preference-${key}`}>
              {entry.label}
            </Text>
            <SegmentedControl.Root
              aria-labelledby={`preference-${key}`}
              value={chosen[key as PreferenceKey] ?? "any"}
              onValueChange={choose}
              className={styles.pair}
            >
              <SegmentedControl.Item value={first[0]}>
                {first[1].label}
              </SegmentedControl.Item>
              <SegmentedControl.Item value="any">Any</SegmentedControl.Item>
              <SegmentedControl.Item value={second[0]}>
                {second[1].label}
              </SegmentedControl.Item>
            </SegmentedControl.Root>
          </Flex>
        );
      })}
    </div>
  );
}

const FOCUS_LENGTHS = [25, 50, 90];
const BREAK_LENGTHS = [5, 10, 15];

/**
 * Lockdown (only here): with it on and the extension installed, distracting
 * sites are blocked whenever a session is under way or focus mode is running.
 * And the pomodoro: how long each focus and each break lasts.
 */
function FocusSettings() {
  const planner = usePlannerData();
  const save = useSaveFocusSettings();
  const extension = useExtension();
  const settings = planner.settings;

  return (
    <div className={styles.preferences}>
      <Flex align="center" justify="between" gap="4">
        <Text as="label" size="2" htmlFor="lockdown">
          Lockdown
        </Text>
        <Flex align="center" gap="3">
          {extension === false && (
            <Text size="2" color="gray">
              Needs the extension
            </Text>
          )}
          <Switch
            id="lockdown"
            checked={settings?.lockdown ?? false}
            onCheckedChange={(lockdown) => {
              // Ask the extension once the setting is saved, not before.
              save.mutate(
                { lockdown },
                { onSettled: () => void syncLockdown() },
              );
            }}
          />
        </Flex>
      </Flex>
      <Length
        label="Work"
        value={settings?.focus_minutes ?? 25}
        options={FOCUS_LENGTHS}
        onChange={(focus_minutes) => save.mutate({ focus_minutes })}
      />
      <Length
        label="Break"
        value={settings?.break_minutes ?? 5}
        options={BREAK_LENGTHS}
        onChange={(break_minutes) => save.mutate({ break_minutes })}
      />
    </div>
  );
}

function Length({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: number;
  options: number[];
  onChange: (minutes: number) => void;
}) {
  const id = `length-${label.toLowerCase()}`;
  return (
    <Flex align="center" justify="between" gap="4">
      <Text size="2" id={id}>
        {label}
      </Text>
      <SegmentedControl.Root
        aria-labelledby={id}
        value={String(value)}
        onValueChange={(v) => onChange(Number(v))}
        className={styles.pair}
      >
        {options.map((minutes) => (
          <SegmentedControl.Item key={minutes} value={String(minutes)}>
            {minutes} min
          </SegmentedControl.Item>
        ))}
      </SegmentedControl.Root>
    </Flex>
  );
}

function Account() {
  const planner = usePlannerData();
  const [leaving, setLeaving] = useState(false);
  return (
    <Flex gap="3" align="center" justify="between">
      <Text size="2">{planner.email}</Text>
      <Button
        variant="soft"
        color="gray"
        loading={leaving}
        onClick={() => {
          setLeaving(true);
          void signOut();
        }}
      >
        Sign out
      </Button>
    </Flex>
  );
}
