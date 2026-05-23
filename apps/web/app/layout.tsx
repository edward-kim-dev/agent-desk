import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { getServerEnv } from "@/lib/env";

export const metadata: Metadata = {
  title: "agent-desk",
  description: "browser-based tmux session manager for AI coding CLIs",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const { gatewayToken } = getServerEnv();
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full">
        <Script
          id="agent-desk-token"
          strategy="beforeInteractive"
        >{`window.AGENT_DESK_BROWSER_TOKEN=${JSON.stringify(gatewayToken)};`}</Script>
        {children}
      </body>
    </html>
  );
}
