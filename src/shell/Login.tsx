"use client";

import { Button, Flex, Heading, Text, TextField } from "@radix-ui/themes";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import styles from "./login.module.css";

// An email identifies the student: new or returning, they type it and they're
// in. No code, no password (the owner's call for the demo).

/** Only paths inside this app; anything else lands on Day. */
export function safeNext(next: string | null): string {
  if (
    !next?.startsWith("/") ||
    next.startsWith("//") ||
    next.startsWith("/login")
  )
    return "/day";
  return next;
}

export function Login() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = async (address: string) => {
    setPending(true);
    setError(null);
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: address }),
    }).catch(() => null);
    if (!response?.ok) {
      const result = await response?.json().catch(() => null);
      setPending(false);
      return setError(result?.error ?? "Couldn't sign in. Try again.");
    }
    router.replace(next);
    router.refresh();
  };

  return (
    <main className={styles.screen}>
      <form
        className={styles.box}
        onSubmit={(event) => {
          event.preventDefault();
          const address = email.trim();
          if (address) void signIn(address);
        }}
      >
        <Flex direction="column" gap="5">
          <Heading size="8" className={styles.title}>
            Planner
          </Heading>
          <Flex direction="column" gap="3">
            <Text as="label" htmlFor="email" size="2" weight="medium">
              Email
            </Text>
            <TextField.Root
              id="email"
              size="3"
              type="email"
              autoFocus
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <Flex>
              <Button
                type="submit"
                size="3"
                loading={pending}
                disabled={!email.trim()}
              >
                Continue
              </Button>
            </Flex>
            {error && (
              <Text size="2" color="red" role="alert">
                {error}
              </Text>
            )}
          </Flex>
        </Flex>
      </form>
    </main>
  );
}
