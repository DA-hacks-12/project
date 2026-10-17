import "@radix-ui/themes/styles.css";
import "./globals.css";
import { Theme } from "@radix-ui/themes";
import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { preconnect } from "react-dom";

export const metadata: Metadata = {
  title: "Planner",
};

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The walks' map tiles: the connection is opened as the page loads, so a
  // slow one is paid for before anyone points at a walk.
  preconnect("https://server.arcgisonline.com", { crossOrigin: "anonymous" });
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
