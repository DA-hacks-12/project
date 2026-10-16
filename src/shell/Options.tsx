"use client";

import { Button, Flex, Heading, Separator, Text } from "@radix-ui/themes";
import { useState } from "react";
import {
  DEFAULT_END,
  DEFAULT_START,
  hoursOf,
} from "@/modules/arrange/core/hours";
import {
  activeHoursFromExtension,
  useExtension,
} from "@/modules/extension/ui/bridge";
import { placesOf } from "@/modules/planner/core/queries";
import {
  signOut,
  useFindPlaces,
  usePlannerData,
  useSaveActiveHours,
} from "@/modules/planner/ui/planner";
import { Feeds } from "./Feeds";
import styles from "./options.module.css";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

/** Options, as its own page: schools, active hours, places and the account. */
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
      <Section title="Hours">
        <ActiveHours />
      </Section>
      <Separator size="4" />
      <Section title="Places">
        <Places />
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

/**
 * The optional extension learns active hours from the browser. Without it,
 * plans use default hours (8am to 11pm, none preferred), shown the same way.
 */
function ActiveHours() {
  const planner = usePlannerData();
  const save = useSaveActiveHours();
  const extension = useExtension();
  const [checking, setChecking] = useState(false);
  const { hours, learned } = hoursOf(planner.settings?.active_hours);

  return (
    <Flex direction="column" gap="2">
      <div className={styles.bars} role="img" aria-label="Active hours">
        {HOURS.map((hour) => (
          <span
            key={hour}
            className={`${styles.bar} ${learned ? "" : styles.quiet}`}
            style={{ height: `${Math.max(2, hours[hour])}%` }}
          />
        ))}
      </div>
      <Flex gap="3" align="center" justify="between">
        <Text size="2" color="gray">
          {learned
            ? "Learned from your browser"
            : `Default, ${DEFAULT_START}am to ${DEFAULT_END - 12}pm`}
        </Text>
        <Text size="2" color="gray">
          {extension === null
            ? ""
            : extension
              ? "Extension connected"
              : "Extension not connected"}
        </Text>
      </Flex>
      {extension && (
        <Flex>
          <Button
            variant="soft"
            loading={checking}
            onClick={async () => {
              setChecking(true);
              const found = await activeHoursFromExtension();
              setChecking(false);
              if (found) save.mutate({ hours: found });
            }}
          >
            Refresh
          </Button>
        </Flex>
      )}
    </Flex>
  );
}

function Places() {
  const planner = usePlannerData();
  const find = useFindPlaces();
  const [denied, setDenied] = useState(false);
  const places = placesOf(planner.settings).slice(0, 3);

  return (
    <Flex direction="column" gap="2">
      {places.map((p) => (
        <Text key={p.name} size="2">
          {p.name} <Text color="gray">· {p.km} km</Text>
        </Text>
      ))}
      <Flex gap="3" align="center">
        <Button
          variant="soft"
          loading={find.isPending}
          onClick={() =>
            navigator.geolocation.getCurrentPosition(
              (position) => {
                setDenied(false);
                find.mutate({
                  lat: position.coords.latitude,
                  lon: position.coords.longitude,
                });
              },
              () => setDenied(true),
            )
          }
        >
          {places.length ? "Find again" : "Find near me"}
        </Button>
        {denied && (
          <Text size="2" color="gray">
            Location is off.
          </Text>
        )}
        {find.isError && (
          <Text size="2" color="red">
            {find.error.message}
          </Text>
        )}
      </Flex>
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
