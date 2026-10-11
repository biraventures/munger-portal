import type { ReactNode } from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const POLICY_ENTITY = "Municipal Corporation Munger";
export const POLICY_ADDRESS = "Municipal Corporation Office, near Town Hall, Munger, Bihar";
export const POLICY_EMAIL = "munger.ulb@gmail.com";
export const POLICY_SITE = "https://mmc.bihar.gov.in";
export const POLICY_UPDATED = "11 October 2026";

export function PolicyPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="font-display text-3xl font-semibold text-ink">{title}</h1>
        <p className="mt-2 text-sm text-ink-soft">
          {POLICY_ENTITY} · {POLICY_SITE.replace("https://", "")} · Last updated {POLICY_UPDATED}
        </p>
        <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-ink [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_li]:mt-1.5">
          {children}
        </div>
        <nav className="mt-12 flex flex-wrap gap-5 border-t border-slate-200 pt-5 text-sm">
          <Link href="/terms" className="text-nnm-blue hover:underline">Terms &amp; Conditions</Link>
          <Link href="/refund-policy" className="text-nnm-blue hover:underline">Refund &amp; Cancellation Policy</Link>
          <Link href="/privacy" className="text-nnm-blue hover:underline">Privacy Policy</Link>
        </nav>
      </main>
      <SiteFooter />
    </div>
  );
}
