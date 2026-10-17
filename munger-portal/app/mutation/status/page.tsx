"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AlertCircle, Loader2, Search } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { fetchApplicationStatus, formatDuration, TIMELINE_LABEL, type ApplicationStatus } from "@/lib/mutation-api";

function StatusContent() {
  const params = useSearchParams();
  const [no, setNo] = useState(params.get("no") ?? "");
  const [result, setResult] = useState<ApplicationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function look(n: string) {
    setError(null);
    setResult(null);
    if (!n.trim()) return setError("Enter the application number.");
    setBusy(true);
    try {
      setResult(await fetchApplicationStatus(n));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not find that application.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const initial = params.get("no");
    if (initial) look(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          look(no);
        }}
        className="flex gap-2"
      >
        <input
          value={no}
          onChange={(e) => setNo(e.target.value.toUpperCase())}
          placeholder="Application number, e.g. MUT26000123K"
          maxLength={24}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue"
        />
        <button disabled={busy} className="inline-flex items-center gap-2 rounded-md bg-nnm-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Track
        </button>
      </form>
      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      {result && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm">
          <div className="mb-3 font-mono text-lg font-semibold text-slate-900">{result.applicationNo}</div>
          <div className="mb-3 text-base font-semibold text-nnm-blue">{result.status}</div>
          {result.remarks && <p className="mb-3 rounded-md bg-slate-50 p-3 text-slate-700">Remarks: {result.remarks}</p>}
          <div className="grid grid-cols-1 gap-1 text-slate-600 sm:grid-cols-2">
            {result.holdingNo && <div>Holding no: {result.holdingNo}</div>}
            <div>Basis: {result.basis}</div>
            <div>Submitted: {new Date(result.submittedAt).toLocaleDateString("en-IN")}</div>
            {result.decidedAt && <div>Decided: {new Date(result.decidedAt).toLocaleDateString("en-IN")}</div>}
          </div>
          {result.trail && result.trail.events.length > 0 && (
            <div className="mt-5 border-t border-slate-100 pt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Progress</p>
              <ol className="space-y-2 border-l border-slate-200 pl-4">
                {result.trail.events
                  .filter((e) => e.kind !== "entered_chain")
                  .map((e, i) => (
                    <li key={i}>
                      <p className="text-slate-800">
                        <b>{TIMELINE_LABEL[e.kind]}</b>
                        {e.desk ? ` — ${e.desk}` : ""}
                      </p>
                      <p className="text-xs text-slate-500">
                        {new Date(e.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                        {e.minutesAtDesk !== null && ` · took ${formatDuration(e.minutesAtDesk)}`}
                      </p>
                      {e.comment && <p className="text-xs text-slate-600">&ldquo;{e.comment}&rdquo;</p>}
                    </li>
                  ))}
                {result.trail.currentDesk && (
                  <li className="font-semibold text-amber-800">
                    Now with the {result.trail.currentDesk} — {formatDuration(result.trail.minutesAtCurrentDesk)}
                  </li>
                )}
              </ol>
            </div>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-4">
        <Link href="/mutation" className="inline-block text-sm font-semibold text-nnm-blue hover:underline">
          Apply for a new mutation
        </Link>
        <Link href="/mutation/edit" className="inline-block text-sm font-semibold text-nnm-blue hover:underline">
          Change a submitted application
        </Link>
      </div>
    </div>
  );
}

export default function MutationStatusPage() {
  return (
    <div>
      <SiteHeader />
      <main>
        <section className="bg-gradient-to-br from-nnm-blue to-nnm-blue-dark py-14 text-white">
          <div className="mx-auto max-w-6xl px-6">
            <span className="mb-2.5 block font-mono text-[12.5px] uppercase tracking-[0.14em] text-nnm-gold">Counter 01B</span>
            <h1 className="mb-3 font-display text-3xl font-semibold sm:text-4xl">Track Mutation Application</h1>
            <p className="max-w-xl text-[17px] text-white/80">Enter the application number you received when you applied.</p>
          </div>
        </section>
        <section className="bg-paper-dim py-10">
          <div className="mx-auto max-w-2xl px-4 sm:px-6">
            <Suspense fallback={<div className="text-sm text-slate-400">Loading…</div>}>
              <StatusContent />
            </Suspense>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
