"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { TradeLicenseApplicationForm, TradeLicenseSubmitSuccess } from "@/components/trade-license-application-form";
import { fetchNoticePrefill, type NoticePrefill, type SubmitResult } from "@/lib/trade-license-api";

/**
 * The public trade licence application. Opened from the QR code on a trade licence notice (?notice=..&sig=..), the
 * form comes filled in from the notice and carries its number, so the application is credited to the Tax Collector.
 */
function TradeLicenseContent() {
  const params = useSearchParams();
  const notice = params.get("notice");
  const sig = params.get("sig");
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [prefill, setPrefill] = useState<NoticePrefill | null>(null);
  const [prefillError, setPrefillError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!(notice && sig));

  useEffect(() => {
    if (!notice || !sig) return;
    fetchNoticePrefill(notice, sig)
      .then(setPrefill)
      .catch((e) => setPrefillError(e instanceof Error ? e.message : "Could not read the notice."))
      .finally(() => setLoading(false));
  }, [notice, sig]);

  if (result) return <TradeLicenseSubmitSuccess result={result} />;
  if (loading) return <p className="py-10 text-center text-sm text-slate-500">Reading the notice…</p>;
  return (
    <>
      {prefill && !prefill.alreadyApplied && (
        <p className="mb-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
          Applying against notice <b>{prefill.noticeNo}</b>. The details from the notice are filled in below - check them, complete the rest
          and upload the documents.
        </p>
      )}
      {prefill?.alreadyApplied && (
        <p className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          An application (<b>{prefill.alreadyApplied}</b>) has already been made against notice {prefill.noticeNo}. To apply again, fill in
          the form without the notice number.
        </p>
      )}
      {prefillError && <p className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{prefillError}</p>}
      <TradeLicenseApplicationForm
        key={prefill?.noticeNo ?? "blank"}
        mode="public"
        onSubmitted={setResult}
        prefill={
          prefill
            ? {
                applicationType: "new",
                applicantName: prefill.applicantName,
                entityName: prefill.entityName,
                completeAddress: prefill.completeAddress,
                holdingNo: prefill.holdingNo,
                mobile: prefill.mobile,
                noticeNo: prefill.alreadyApplied ? "" : prefill.noticeNo,
              }
            : undefined
        }
      />
    </>
  );
}

export default function TradeLicensePage() {
  return (
    <div>
      <SiteHeader />
      <main>
        <section className="bg-gradient-to-br from-nnm-blue to-nnm-blue-dark py-16 text-white">
          <div className="mx-auto max-w-6xl px-6">
            <span className="mb-2.5 block font-mono text-[12.5px] uppercase tracking-[0.14em] text-nnm-gold">Counter 04</span>
            <h1 className="mb-3 font-display text-3xl font-semibold sm:text-4xl">Trade License</h1>
            <p className="max-w-xl text-[17px] text-white/80">Apply for a new trade license, or renew an existing one.</p>
          </div>
        </section>

        <section className="bg-paper-dim py-14">
          <div className="mx-auto max-w-3xl px-6">
            <Suspense fallback={null}>
              <TradeLicenseContent />
            </Suspense>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
