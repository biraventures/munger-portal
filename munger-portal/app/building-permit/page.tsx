"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, Calculator, CheckCircle2, ClipboardList, FileText, Search } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { FeeCalculator, type CalculatorFigures } from "@/components/building-permit/fee-calculator";
import { ApplicationForm } from "@/components/building-permit/application-form";

const STEPS = [
  "Apply online with documents and drawing",
  "Site verification (Assistant Architect, Amin and AE reports)",
  "Technical scrutiny of the drawing",
  "Payment of fee and labour cess",
  "File processing and verification",
  "Approval by the competent authority",
  "Building plan approval issued",
];

export default function BuildingPermitPage() {
  const [tab, setTab] = useState<"calc" | "apply">("calc");
  const [prefill, setPrefill] = useState<CalculatorFigures | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [done, setDone] = useState<string | null>(null);

  return (
    <div>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="mb-1 flex items-center gap-2 font-display text-3xl font-semibold text-ink">
          <Building2 className="h-7 w-7 text-nnm-blue" /> Building Plan Permit
        </h1>
        <p className="mb-4 text-sm text-ink-soft">Nagar Nigam Munger - calculate the fee, then apply online for approval of your building plan.</p>
        <Link href="/building-permit/status" className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-nnm-blue hover:underline">
          <Search className="h-4 w-4" /> Already applied? Track your application / pay the fee
        </Link>

        {done ? (
          <div role="status" className="rounded-xl border border-green-200 bg-green-50 p-6 text-sm text-green-900">
            <p className="mb-2 flex items-center gap-2 text-lg font-semibold">
              <CheckCircle2 className="h-6 w-6" /> Application submitted
            </p>
            <p className="mb-1">
              Your application number is <b className="text-base">{done}</b>. Note it down - you need it with your mobile number to track the application and to pay the fee.
            </p>
            <p className="mb-4">Submit 3 printed drawing sets countersigned by a UDHD registered architect and the original joint affidavit at the Map Section, Nagar Nigam office.</p>
            <Link href={`/building-permit/status?app=${encodeURIComponent(done)}`} className="font-semibold text-nnm-blue hover:underline">
              Track this application
            </Link>
          </div>
        ) : (
          <>
            <div role="tablist" className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
              <button
                role="tab"
                aria-selected={tab === "calc"}
                onClick={() => setTab("calc")}
                className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-semibold ${tab === "calc" ? "bg-white text-nnm-blue shadow-sm" : "text-slate-600"}`}
              >
                <Calculator className="h-4 w-4" /> Calculate the fee
              </button>
              <button
                role="tab"
                aria-selected={tab === "apply"}
                onClick={() => setTab("apply")}
                className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-semibold ${tab === "apply" ? "bg-white text-nnm-blue shadow-sm" : "text-slate-600"}`}
              >
                <ClipboardList className="h-4 w-4" /> Apply for building plan permit
              </button>
            </div>

            {tab === "calc" ? (
              <FeeCalculator
                onApply={(f) => {
                  setPrefill(f);
                  setFormKey((k) => k + 1);
                  setTab("apply");
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              />
            ) : (
              <div className="space-y-5">
                <details className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
                  <summary className="cursor-pointer font-semibold text-slate-800">
                    <FileText className="mr-1 inline h-4 w-4" /> What you need and how it is processed
                  </summary>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="mb-1 font-medium">Documents to upload</p>
                      <ul className="list-disc space-y-0.5 pl-5 text-slate-600">
                        <li>Sale deed</li>
                        <li>Updated jamabandi receipt</li>
                        <li>Aadhaar card photo and Aadhaar number</li>
                        <li>PAN card photo</li>
                        <li>Passport size photograph</li>
                        <li>Holding tax receipt</li>
                        <li>Site visit verification by the architect</li>
                        <li>Drawing sheets - 1 set (3 printed sets at the office, countersigned by a UDHD registered architect)</li>
                        <li>General information sheet with estimation sheet</li>
                        <li>Joint affidavit with nominee signature</li>
                      </ul>
                    </div>
                    <div>
                      <p className="mb-1 font-medium">Process</p>
                      <ol className="list-decimal space-y-0.5 pl-5 text-slate-600">
                        {STEPS.map((s) => (
                          <li key={s}>{s}</li>
                        ))}
                      </ol>
                    </div>
                  </div>
                </details>
                <ApplicationForm key={formKey} prefill={prefill} onSubmitted={(r) => setDone(r.applicationNo)} />
              </div>
            )}
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
