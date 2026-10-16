"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, Loader2, Printer } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { TlNoticePages } from "@/components/admin/tl-notice-sheet";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { printElementInNewWindow } from "@/lib/print-in-new-window";
import { fetchPrintQueue, markNoticesPrinted, type TlNotice } from "@/lib/tl-notice-api";

export default function TlNoticesPrintPage() {
  const admin = useAdminGuard();
  const [mode, setMode] = useState<"pending" | "date">("pending");
  const [date, setDate] = useState(() => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10));
  const [notices, setNotices] = useState<TlNotice[] | null>(null);
  const [withOfficeCopy, setWithOfficeCopy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  function load() {
    setNotices(null);
    setError(null);
    fetchPrintQueue(mode === "pending" ? {} : { date, all: true })
      .then(setNotices)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load."));
  }

  useEffect(() => {
    if (admin?.role === "tax_collector") load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, mode, date]);

  if (!admin) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  if (admin.role !== "tax_collector") {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <p className="p-10 text-sm text-slate-500">This page is for Tax Collectors.</p>
      </div>
    );
  }

  async function printAll() {
    if (!sheetRef.current || !notices?.length) return;
    printElementInNewWindow(sheetRef.current);
    const unprinted = notices.filter((n) => !n.printedAt).map((n) => n.id);
    if (!unprinted.length) return;
    if (!window.confirm(`Did all ${notices.length} notice(s) print correctly? They will be marked as printed and leave this list.`)) return;
    setBusy(true);
    try {
      await markNoticesPrinted(unprinted);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mark printed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">Print Trade Licence Notices</h1>
        <p className="mb-6 text-sm text-slate-500">
          Notices from your visits, plus second notices raised automatically where the 14 days ran out. Print them at the end of the day for the City
          Manager&apos;s signature. <Link href="/admin/tl-notices" className="font-semibold text-nnm-blue hover:underline">All my visits →</Link>
        </p>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <button onClick={() => setMode("pending")} className={`rounded-md px-3 py-1.5 text-sm font-medium ${mode === "pending" ? "bg-nnm-blue text-white" : "border border-slate-300 bg-white text-slate-700"}`}>
            Not yet printed
          </button>
          <button onClick={() => setMode("date")} className={`rounded-md px-3 py-1.5 text-sm font-medium ${mode === "date" ? "bg-nnm-blue text-white" : "border border-slate-300 bg-white text-slate-700"}`}>
            Reprint a day
          </button>
          {mode === "date" && <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />}
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={withOfficeCopy} onChange={(e) => setWithOfficeCopy(e.target.checked)} />
            Office copy with receiving (same sheet)
          </label>
          <button
            onClick={printAll}
            disabled={!notices?.length || busy}
            className="ml-auto inline-flex items-center gap-2 rounded-md bg-nnm-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            Print {notices?.length ?? 0} notice(s)
          </button>
        </div>

        {error && (
          <div role="alert" className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {!notices ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : notices.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">No notices to print.</p>
        ) : (
          <>
            <table className="mb-6 w-full rounded-xl border border-slate-200 bg-white text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="p-2">Notice No</th>
                  <th className="p-2">Type</th>
                  <th className="p-2">Business</th>
                  <th className="p-2">Holding</th>
                  <th className="p-2">Date</th>
                  <th className="p-2">Deadline</th>
                </tr>
              </thead>
              <tbody>
                {notices.map((n) => (
                  <tr key={n.id} className="border-t border-slate-100">
                    <td className="p-2 font-mono">{n.noticeNo}</td>
                    <td className="p-2">{n.level === 2 ? <span className="font-semibold text-red-700">2nd &amp; final</span> : "1st"}</td>
                    <td className="p-2">{n.businessName}</td>
                    <td className="p-2">{n.holdingNo}</td>
                    <td className="p-2">{n.issuedOn}</td>
                    <td className="p-2">{n.dueOn}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-100 p-4">
              <div ref={sheetRef}>
                <TlNoticePages
                  sheets={notices.flatMap((n) => (withOfficeCopy ? [{ key: n.id, n }, { key: `${n.id}-o`, n, officeCopy: true }] : [{ key: n.id, n }]))}
                />
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
