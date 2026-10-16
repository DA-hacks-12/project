"use client";

import { Button, Flex, Text } from "@radix-ui/themes";
import { useState } from "react";

/** A question on the button that asked it, with the safe choice focused. */
export function AskInPlace({
  question,
  yes,
  onYes,
  children,
}: {
  question: string;
  yes: string;
  onYes: () => void;
  children: React.ReactNode;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Button variant="soft" color="gray" onClick={() => setAsking(true)}>
        {children}
      </Button>
    );
  }
  return (
    <Flex gap="2" align="center">
      <Text size="2">{question}</Text>
      <Button color="red" onClick={onYes}>
        {yes}
      </Button>
      <Button
        variant="soft"
        color="gray"
        autoFocus
        onClick={() => setAsking(false)}
      >
        Keep
      </Button>
    </Flex>
  );
}
