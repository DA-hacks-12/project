import "@radix-ui/themes/styles.css";
import "./globals.css";
import { Theme } from "@radix-ui/themes";
import type { Metadata } from "next";
import { Geist } from "next/font/google";

export const metadata: Metadata = {
  title: "Planner",
};

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`dark ${geist.variable}`}>
      <body>
        <Theme
          appearance="dark"
          accentColor="gray"
          grayColor="gray"
          radius="small"
          panelBackground="solid"
        >
          {children}
        </Theme>
      </body>
    </html>
  );
}
