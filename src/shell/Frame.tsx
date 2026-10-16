"use client";

import { PlusIcon } from "@radix-ui/react-icons";
import { Button, Flex, IconButton } from "@radix-ui/themes";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { focusTarget } from "@/modules/planner/core/items";
import { useNow, usePlannerData } from "@/modules/planner/ui/planner";
import { AddDialog } from "./AddDialog";
import type { View } from "./App";
import styles from "./frame.module.css";

export function Frame({
  view,
  children,
}: {
  view: View;
  children: React.ReactNode;
}) {
  const planner = usePlannerData();
  const { now } = useNow();
  const params = useSearchParams();
  const keep = params.toString() ? `?${params.toString()}` : "";
  const target = focusTarget(planner, now);

  return (
    <div className={styles.app}>
      <nav className={styles.sidebar}>
        <Flex direction="column" gap="1">
          <Button
            asChild
            variant={view === "day" ? "soft" : "ghost"}
            className={styles.item}
          >
            <Link href={`/day${keep}`}>Day</Link>
          </Button>
          <Button
            asChild
            variant={view === "week" ? "soft" : "ghost"}
            className={styles.item}
          >
            <Link href={`/week${keep}`}>Week</Link>
          </Button>
          {target ? (
            <Button asChild variant="ghost" className={styles.item}>
              <Link href={`/focus/${target.id}${keep}`}>Focus</Link>
            </Button>
          ) : (
            <Button variant="ghost" disabled className={styles.item}>
              Focus
            </Button>
          )}
          <Button
            asChild
            variant={view === "options" ? "soft" : "ghost"}
            className={styles.item}
          >
            <Link href={`/options${keep}`}>Options</Link>
          </Button>
        </Flex>
        <AddDialog>
          <IconButton
            variant="soft"
            aria-label="Add block"
            className={styles.add}
          >
            <PlusIcon />
          </IconButton>
        </AddDialog>
      </nav>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
