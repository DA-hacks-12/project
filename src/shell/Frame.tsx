"use client";

import { PlusIcon } from "@radix-ui/react-icons";
import { Button, Flex, IconButton } from "@radix-ui/themes";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
  const params = useSearchParams();
  const keep = params.toString() ? `?${params.toString()}` : "";

  return (
    <div className={styles.app}>
      <nav className={styles.sidebar}>
        <Flex direction="column" gap="1">
          <Button asChild variant="ghost" className={styles.item}>
            <Link
              href={`/day${keep}`}
              aria-current={view === "day" ? "page" : undefined}
            >
              Day
            </Link>
          </Button>
          <Button asChild variant="ghost" className={styles.item}>
            <Link
              href={`/week${keep}`}
              aria-current={view === "week" ? "page" : undefined}
            >
              Week
            </Link>
          </Button>
          <Button asChild variant="ghost" className={styles.item}>
            <Link
              href={`/options${keep}`}
              aria-current={view === "options" ? "page" : undefined}
            >
              Options
            </Link>
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
