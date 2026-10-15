"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2, Printer } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { ReceiptReprintView } from "@/components/operator/receipt-reprint-view";
import { printElementInNewWindow } from "@/lib/print-in-new-window";
import { fetchBulkReceiptCollectors, fetchBulkReceipts, type BulkReceiptCollector, type BulkReceiptGroup } from "@/lib/admin-api";

const ALLOWED = ["tax_daroga", "commissioner", "deputy_commissioner", "city_manager"];
const inputClass = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-nnm-blue";

function todayIst(): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

function money(n: number): string {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function BulkReceiptsPage() {
  const admin = useAdminGuard();
  const [date, setDate] = useState(todayIst());
  const [collectors, setCollectors] = useState<BulkReceiptCollector[] | null>(null);
  const [collector, setCollector] = useState("");
  const [groups, setGroups] = useState<BulkReceiptGroup[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!admin || !ALLOWED.includes(admin.role)) return;
    setCollectors(null);
    setCollector("");
    setGroups(null);
    fetchBulkReceiptCollectors(date)
      .then(setCollectors)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the collectors."));
  }, [admin, date]);

  if (!admin) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  if (!ALLOWED.includes(admin.role)) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <p className="p-10 text-sm text-slate-500">This page is for the Tax Daroga.</p>
      </div>
    );
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setGroups(await fetchBulkReceipts(date, collector || undefined));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the receipts.");
    } finally {
      setLoading(false);
    }
  }

  const receiptCount = groups?.reduce((n, g) => n + g.receipts.length, 0) ?? 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">Field Collection Receipts</h1>
        <p className="mb-6 text-sm text-slate-500">
          Tax Collectors give a collection slip in the field. Print the day&apos;s receipts here, Tax Collector-wise, to stamp and hand over.
          Cheque/DD receipts print as provisional until reconciled.
        </p>

        {error && (
          <div role="alert" className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="mb-6 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-[180px_1fr_auto] sm:items-end">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Collection date</label>
            <input type="date" value={date} max={todayIst()} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Tax Collector</label>
            <select value={collector} onChange={(e) => setCollector(e.target.value)} className={inputClass} disabled={!collectors}>
              <option value="">All Tax Collectors{collectors ? ` (${collectors.reduce((n, c) => n + c.count, 0)} receipts)` : ""}</option>
              {(collectors ?? []).map((c) => (
                <option key={c.username} value={c.username}>
                  {c.name} - {c.count} receipt{c.count === 1 ? "" : "s"}, {money(c.amount)}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={load}
            disabled={loading || !collectors || collectors.length === 0}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-nnm-blue px-4 py-2 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Show receipts
          </button>
          {collectors && collectors.length === 0 && <p className="text-sm text-slate-500 sm:col-span-3">No field collection was recorded on this date.</p>}
        </div>

        {groups && (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-slate-600">
                {receiptCount} receipt{receiptCount === 1 ? "" : "s"} ·{" "}
                {groups.map((g) => `${g.collectorName}: ${money(g.total)}`).join(" · ")}
              </div>
              <button
                onClick={() => printRef.current && printElementInNewWindow(printRef.current)}
                disabled={receiptCount === 0}
                className="inline-flex items-center gap-2 rounded-md bg-nnm-blue px-4 py-2 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
              >
                <Printer className="h-4 w-4" />
                Print all ({receiptCount})
              </button>
            </div>
            <div ref={printRef}>
              {groups.map((g) => (
                <section key={g.collectorUsername ?? g.collectorName}>
                  <h2 className="mb-2 mt-6 text-sm font-semibold text-slate-700 print:hidden">
                    {g.collectorName} - {g.receipts.length} receipt{g.receipts.length === 1 ? "" : "s"}, {money(g.total)}
                  </h2>
                  {g.receipts.map((r) => (
                    <div key={r.receiptNo} className="mb-4" style={{ breakAfter: "page", pageBreakAfter: "always" }}>
                      <ReceiptReprintView receipt={r} bare heading="PROPERTY TAX — PAYMENT RECEIPT" />
                    </div>
                  ))}
                </section>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
