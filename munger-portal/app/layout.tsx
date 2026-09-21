import type { Metadata } from "next";
// Self-hosted fonts via @fontsource (downloaded from npm, not Google's
// font CDN) - the SDC App server's network doesn't have outbound
// access to fonts.googleapis.com/fonts.gstatic.com, which made
// next/font/google fail at build time. This also means the site no
// longer makes any request to Google at all for a citizen just to load
// a page, which is arguably better practice for a .gov.in site anyway.
import "@fontsource/fraunces/500.css";
import "@fontsource/fraunces/600.css";
import "@fontsource/fraunces/700.css";
import "@fontsource/public-sans/400.css";
import "@fontsource/public-sans/500.css";
import "@fontsource/public-sans/600.css";
import "@fontsource/public-sans/700.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./globals.css";
import { ChunkErrorRecovery } from "@/components/chunk-error-recovery";

export const metadata: Metadata = {
  title: "Munger Nagar Nigam — Citizen Services Portal",
  description:
    "Official citizen services portal of Munger Nagar Nigam. Pay property tax online and access municipal services for the city of Munger, Bihar.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="font-body antialiased">
        <ChunkErrorRecovery />
        {children}
      </body>
    </html>
  );
}
