"use client";

import { Flex, Text } from "@radix-ui/themes";
import styles from "./feeds.module.css";

/** "Reading 9 of 15" with a bar that grows as the model's readings land. */
export function Reading({
  done,
  total,
  label = true,
}: {
  done: number;
  total: number;
  label?: boolean;
}) {
  return (
    <Flex direction="column" gap="1">
      {label && (
        <Text size="1" color="gray">
          Reading {done} of {total}
        </Text>
      )}
      <div
        className={styles.track}
        role="progressbar"
        aria-label="Reading assignments"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
      >
        <span
          className={styles.bar}
          style={{ transform: `scaleX(${total ? done / total : 0})` }}
        />
      </div>
    </Flex>
  );
}
