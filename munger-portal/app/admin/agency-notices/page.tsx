"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, FileText, Loader2, Printer } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { NoticeView } from "@/components/operator/notice-view";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { printElementInNewWindow } from "@/lib/print-in-new-window";
import { fetchAgencyWardHoldings, fetchAgencyWards, prepareAgencyNotices } from "@/lib/agency-api";
import type { DemandNoticeReprintData } from "@/lib/demand-notice-api";

const BATCH = 20;

export default function AgencyNoticesPage() {
  const admin = useAdminGuard();
  const [wards, setWards] = useState<{ ward: string; pending: number }[] | null>(null);
  const [ward, setWard] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [notices, setNotices] = useState<DemandNoticeReprintData[]>([]);
  const [problems, setProblems] = useState<{ holdingNo: string; message: string }[]>([]);
  const [preparedWard, setPreparedWard] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [partCount, setPartCount] = useState(1);
  const [printingPart, setPrintingPart] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef(false);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!admin || admin.role !== "agency_team_leader") return;
    fetchAgencyWards()
      .then(setWards)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the wards."));
  }, [admin]);

  // Once the chosen part is on the (hidden) page, hand it to the print window.
  useEffect(() => {
    if (printingPart === null || !printRef.current) return;
    printElementInNewWindow(printRef.current);
    const t = setTimeout(() => setPrintingPart(null), 500);
    return () => clearTimeout(t);
  }, [printingPart]);

  if (!admin) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  if (admin.role !== "agency_team_leader") {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <main className="mx-auto max-w-2xl px-6 py-10">
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            This is restricted to the Agency Team Leader.
          </div>
        </main>
      </div>
    );
  }

  async function handlePrepare() {
    if (!ward) return;
    cancelRef.current = false;
    setRunning(true);
    setError(null);
    setNotices([]);
    setProblems([]);
    setFinished(false);
    setPreparedWard(ward);
    try {
      const holdingNos = await fetchAgencyWardHoldings(ward);
      setProgress({ done: 0, total: holdingNos.length });
      const collected: DemandNoticeReprintData[] = [];
      const collectedProblems: { holdingNo: string; message: string }[] = [];
      for (let i = 0; i < holdingNos.length; i += BATCH) {
        if (cancelRef.current) break;
        const result = await prepareAgencyNotices(holdingNos.slice(i, i + BATCH));
        collected.push(...result.notices);
        collectedProblems.push(...result.errors);
        setNotices([...collected]);
        setProblems([...collectedProblems]);
        setProgress({ done: Math.min(i + BATCH, holdingNos.length), total: holdingNos.length });
      }
      setPartCount(collected.length > 250 ? 2 : 1);
      setFinished(!cancelRef.current);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not prepare the notices.");
    } finally {
      setRunning(false);
    }
  }

  const perPart = Math.ceil(notices.length / Math.max(1, partCount));
  const parts = Array.from({ length: partCount }, (_, i) => ({ index: i, from: i * perPart + 1, to: Math.min((i + 1) * perPart, notices.length) })).filter((p) => p.from <= notices.length);
  const printing = printingPart !== null ? notices.slice(printingPart * perPart, (printingPart + 1) * perPart) : [];

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />
      <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
            <FileText className="h-6 w-6" />
            Ward-wise Demand Notices
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Prints the demand notices of every holding in a ward whose dues are pending (tax not paid up to the present year). A current notice is created for each holding
            (this month&apos;s notice is reused if one already exists), so the late fee is up to date.
          </p>
        </div>

        {error && (
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <label className="text-xs font-medium text-slate-500">
            Ward
            <select value={ward} onChange={(e) => setWard(e.target.value)} disabled={running} className="mt-1 block w-60 rounded-md border border-slate-300 px-3 py-2.5 text-sm">
              <option value="">{wards ? "Choose a ward" : "Loading…"}</option>
              {wards?.map((w) => (
                <option key={w.ward} value={w.ward}>
                  Ward {w.ward} - {w.pending.toLocaleString("en-IN")} holdings pending
                </option>
              ))}
            </select>
          </label>
          {!running ? (
            <button onClick={handlePrepare} disabled={!ward} className="rounded-md bg-nnm-blue px-5 py-2.5 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60">
              Prepare notices
            </button>
          ) : (
            <button onClick={() => (cancelRef.current = true)} className="rounded-md border border-red-300 px-5 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50">
              Stop
            </button>
          )}
        </div>

        {progress && (
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 font-medium text-slate-800">
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : finished ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <AlertCircle className="h-4 w-4 text-amber-600" />}
                Ward {preparedWard}: {progress.done.toLocaleString("en-IN")} of {progress.total.toLocaleString("en-IN")} holdings
              </span>
              <span className="text-xs text-slate-500">{notices.length.toLocaleString("en-IN")} notices ready</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100">
              <div className="h-2 rounded-full bg-nnm-blue transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 100}%` }} />
            </div>
            {running && <p className="mt-2 text-xs text-slate-500">Keep this page open until it finishes. A large ward can take a few minutes.</p>}
            {!running && !finished && <p className="mt-2 text-xs text-amber-700">Stopped before the end - the notices below are only the ones prepared so far. Prepare again to complete the ward.</p>}
          </div>
        )}

        {notices.length > 0 && !running && (
          <div className="space-y-3 rounded-xl border-2 border-nnm-blue bg-white p-5">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm text-slate-700">
                Split into{" "}
                <select value={partCount} onChange={(e) => setPartCount(Number(e.target.value))} className="rounded-md border border-slate-300 px-2 py-1 text-sm">
                  {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>{" "}
                PDF file(s)
              </label>
              <span className="text-xs text-slate-400">{notices.length} notices, one per page</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {parts.map((p) => (
                <button
                  key={p.index}
                  onClick={() => setPrintingPart(p.index)}
                  disabled={printingPart !== null}
                  className="inline-flex items-center gap-2 rounded-md bg-nnm-blue px-4 py-2.5 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
                >
                  <Printer className="h-4 w-4" />
                  Part {p.index + 1} of {parts.length} (notices {p.from}-{p.to})
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500">A print window opens for each part. In it, choose &quot;Save as PDF&quot; as the printer (or print directly). Allow pop-ups for this site.</p>
          </div>
        )}

        {problems.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="mb-1 font-semibold">{problems.length} holding(s) could not be included</div>
            <ul className="max-h-48 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs">
              {problems.map((p) => (
                <li key={p.holdingNo}>
                  <b>{p.holdingNo}</b>: {p.message}
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>

      {/* The part being printed - kept off-screen; only its notices are copied into the print window. */}
      <div className="hidden">
        <div ref={printRef} className="agency-batch">
          <style>{`.agency-batch .no-print{display:none !important}.agency-batch > div{break-after:page;page-break-after:always}.agency-batch > div:last-child{break-after:auto;page-break-after:auto}`}</style>
          {printing.map((n) => (
            <div key={n.demandNo}>
              <NoticeView notice={n} onClose={() => undefined} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
