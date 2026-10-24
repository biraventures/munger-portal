"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Calculator, CheckCircle2, Download, FileWarning, Loader2 } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import {
  bulkGenerateDemandNotices,
  fetchDemandRefreshRuns,
  bulkRegenerateTaxHistory,
  downloadExport,
  type DemandRefreshStatus,
  type BulkRegenerateTaxHistoryResult,
  type ExportDataset,
} from "@/lib/admin-api";

export default function AdminDemandNoticesPage() {
  const admin = useAdminGuard();
  const [starting, setStarting] = useState(false);
  const [refresh, setRefresh] = useState<DemandRefreshStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadRuns = useCallback(() => {
    fetchDemandRefreshRuns()
      .then(setRefresh)
      .catch(() => undefined);
  }, []);
  const running = !!refresh?.running;

  useEffect(() => {
    if (!admin) return;
    loadRuns();
    // Poll quickly while a run is going, slowly otherwise (an automatic run may start on the 1st).
    const t = setInterval(loadRuns, running ? 3000 : 30000);
    return () => clearInterval(t);
  }, [admin, running, loadRuns]);

  const [taxHistoryRunning, setTaxHistoryRunning] = useState(false);
  const [taxHistoryResult, setTaxHistoryResult] = useState<BulkRegenerateTaxHistoryResult | null>(null);
  const [taxHistoryError, setTaxHistoryError] = useState<string | null>(null);

  const [exportingDataset, setExportingDataset] = useState<ExportDataset | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  async function handleExport(dataset: ExportDataset) {
    setExportingDataset(dataset);
    setExportError(null);
    try {
      await downloadExport(dataset);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setExportingDataset(null);
    }
  }

  async function handleRun() {
    setStarting(true);
    setError(null);
    try {
      await bulkGenerateDemandNotices();
      // The job starts in the background; give it a moment to register, then show its progress.
      setTimeout(loadRuns, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start bulk generation.");
      loadRuns();
    } finally {
      setStarting(false);
    }
  }

  async function handleRunTaxHistory() {
    setTaxHistoryRunning(true);
    setTaxHistoryError(null);
    setTaxHistoryResult(null);
    try {
      const r = await bulkRegenerateTaxHistory();
      setTaxHistoryResult(r);
    } catch (err) {
      setTaxHistoryError(err instanceof Error ? err.message : "Bulk regeneration failed.");
    } finally {
      setTaxHistoryRunning(false);
    }
  }

  if (!admin) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />

      <main className="mx-auto max-w-3xl px-6 py-10 space-y-10">
        <div>
          <h1 className="mb-1 text-2xl font-semibold text-slate-900">Bulk Demand Notice Generation</h1>
          <p className="mb-6 text-sm text-slate-500">
            Generates a demand notice for every holding that has dues and floor data on file but has no live demand
            notice from the current month — either it never had one, or its latest notice is from an earlier month
            (late fee is added as the month changes, so the older amount is out of date; the new notice supersedes the
            old one as a reminder). Holdings already notified this month, fully paid up, or disputed are left out. This
            only logs each notice (holding number, demand number, amount) — it does not print anything. A printable copy for any specific holding is still available from that
            property&apos;s page afterward.
          </p>
          <p className="mb-6 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
            <b>Runs automatically every month</b> on the 1st at 00:10 (if the server is down then, as soon as it is back, up to 05:00), so every
            holding&apos;s demand carries that month&apos;s late fee. It runs in the background — this page shows its progress and you can leave it.
          </p>

          <button
            onClick={handleRun}
            disabled={running || starting}
            className="mb-6 inline-flex items-center gap-2 rounded-md bg-nnm-blue px-6 py-3 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
          >
            {running || starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileWarning className="h-4 w-4" />}
            {running ? "Generation running…" : starting ? "Starting…" : "Run Bulk Generation Now"}
          </button>

          {error && (
            <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {refresh && (
            <div className="space-y-3">
              {!refresh.currentMonthDone && !running && (
                <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  The demand has not yet been refreshed for {refresh.currentMonth}. Run it now, or wait for the automatic run on the 1st.
                </p>
              )}
              {refresh.runs.map((r) => {
                const pct = r.total ? Math.round(((r.processed + r.failed) / r.total) * 100) : 0;
                const tone =
                  r.status === "completed" ? "border-green-200 bg-green-50 text-green-900" : r.status === "running" ? "border-blue-200 bg-blue-50 text-blue-900" : "border-red-200 bg-red-50 text-red-800";
                return (
                  <details key={r.id} open={r.status === "running" || r === refresh.runs[0]} className={`rounded-md border p-3 text-sm ${tone}`}>
                    <summary className="cursor-pointer">
                      <b>{r.run_month}</b> · {r.trigger === "schedule" ? "Automatic" : `Started by ${r.started_by}`} ·{" "}
                      {new Date(r.started_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} ·{" "}
                      <b>
                        {r.status === "running" ? `Running ${pct}%` : r.status === "completed" ? "Completed" : r.status === "interrupted" ? "Interrupted (resumes on the next run)" : "Failed"}
                      </b>
                    </summary>
                    <div className="mt-2 space-y-1.5">
                      {r.status === "running" && (
                        <div className="h-2 overflow-hidden rounded bg-white">
                          <div className="h-full bg-nnm-blue transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      )}
                      <p>
                        {r.processed} notice{r.processed === 1 ? "" : "s"} generated
                        {r.failed ? `, ${r.failed} holding(s) skipped or failed` : ""}
                        {r.total !== null ? ` — of ${r.total} holding(s) due` : ""}.
                        {r.finished_at && ` Finished ${new Date(r.finished_at).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })}.`}
                      </p>
                      {r.status === "completed" && r.total === 0 && <p className="text-xs">No holding was due: every holding with dues already had a notice from this month.</p>}
                      {r.message && <p className="text-xs">{r.message}</p>}
                      {r.errors.length > 0 && (
                        <ul className="list-disc space-y-0.5 pl-5 text-xs">
                          {Object.entries(
                            r.errors.reduce<Record<string, number>>((acc, e) => {
                              const key = e.message.replace(/Holding No [^ ]+/g, "Holding No …");
                              acc[key] = (acc[key] ?? 0) + 1;
                              return acc;
                            }, {}),
                          )
                            .sort((x, y) => y[1] - x[1])
                            .slice(0, 6)
                            .map(([msg, n]) => (
                              <li key={msg}>
                                {n} × {msg}
                              </li>
                            ))}
                        </ul>
                      )}
                    </div>
                  </details>
                );
              })}
              {refresh.runs.length === 0 && <p className="text-sm text-slate-500">No runs recorded yet.</p>}
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 pt-8">
          <h2 className="mb-1 text-xl font-semibold text-slate-900">Bulk Tax History Regeneration</h2>
          <p className="mb-6 text-sm text-slate-500">
            Recomputes system-derived tax history stages (2011 onward) for every holding, from its current Floors
            (using each floor&apos;s year built / closing year). Only replaces auto-generated rows — manually
            entered or migrated historical data is never touched. Run this once to backfill holdings that existed
            before this feature, or any time you want stages refreshed without waiting for a full save-and-approval
            cycle.
          </p>

          <button
            onClick={handleRunTaxHistory}
            disabled={taxHistoryRunning}
            className="mb-6 inline-flex items-center gap-2 rounded-md bg-nnm-blue px-6 py-3 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
          >
            {taxHistoryRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
            {taxHistoryRunning ? "Regenerating…" : "Run Bulk Regeneration"}
          </button>

          {taxHistoryError && (
            <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {taxHistoryError}
            </div>
          )}

          {taxHistoryResult && (
            <div className="space-y-5">
              <div className="flex items-start gap-2.5 rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <p className="font-semibold">
                  {taxHistoryResult.processed} holding{taxHistoryResult.processed === 1 ? "" : "s"} processed
                  {taxHistoryResult.errors.length > 0 ? `, ${taxHistoryResult.errors.length} error(s)` : ""}.
                </p>
              </div>

              {taxHistoryResult.errors.length > 0 && (
                <div className="rounded-xl border border-red-200 bg-white p-4">
                  <h2 className="mb-2 text-sm font-semibold text-red-700">Errors</h2>
                  <ul className="space-y-1 text-sm text-red-600">
                    {taxHistoryResult.errors.map((e) => (
                      <li key={e.holdingNo}>
                        <span className="font-mono">{e.holdingNo}</span>: {e.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 pt-8">
          <h2 className="mb-1 text-xl font-semibold text-slate-900">Data Export</h2>
          <p className="mb-6 text-sm text-slate-500">
            Downloads a live Excel workbook generated fresh from the current database — never a cached or stale
            copy. &ldquo;Everything Combined&rdquo; puts each dataset on its own sheet in one file.
          </p>

          {exportError && (
            <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {exportError}
            </div>
          )}

          <div className="space-y-8">
            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Property Tax</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {(
                  [
                    ["properties", "Property Records", "Owner, address, tax details for every holding"],
                    ["floors", "Floors", "Every floor entry for every holding - area, construction type, usage"],
                    ["tax_history", "Tax History", "Historical tax-by-period data for every holding"],
                    ["property_history", "Property History", "Every recorded change to a holding, by version"],
                    ["payments", "Payments / Transactions", "Every recorded payment, most recent first"],
                    ["notices", "Demand Notices", "Every demand notice generated"],
                    ["changes", "Mutation Approval Requests", "Full change-request history, all tiers and statuses"],
                  ] as [ExportDataset, string, string][]
                ).map(([dataset, label, description]) => (
                  <ExportButton
                    key={dataset}
                    dataset={dataset}
                    label={label}
                    description={description}
                    exportingDataset={exportingDataset}
                    onClick={handleExport}
                  />
                ))}
              </div>
            </div>

            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Municipal Shops</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {(
                  [
                    ["shops", "Shop Records", "Every shop — location, area, status"],
                    ["shop_agreements", "Shop Agreements", "Agreement details plus their approval-request history"],
                    ["shop_rent_payments", "Shop Rent Demands & Payments", "Every rent demand generated and every payment collected"],
                    ["shop_violation_notices", "Shop Violation Notices", "Every violation notice issued, any status"],
                    ["shop_rental_applications", "Shop Rental Applications", "New tenant applications, all stages and statuses"],
                  ] as [ExportDataset, string, string][]
                ).map(([dataset, label, description]) => (
                  <ExportButton
                    key={dataset}
                    dataset={dataset}
                    label={label}
                    description={description}
                    exportingDataset={exportingDataset}
                    onClick={handleExport}
                  />
                ))}
              </div>
            </div>

            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Trade License</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <ExportButton
                  dataset="trade_license_applications"
                  label="Trade License Applications"
                  description="Every application (new + renewal) plus its document checklist"
                  exportingDataset={exportingDataset}
                  onClick={handleExport}
                />
              </div>
            </div>

            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Everything</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <ExportButton
                  dataset="all"
                  label="Everything Combined"
                  description="Every dataset above in one workbook, one sheet each"
                  exportingDataset={exportingDataset}
                  onClick={handleExport}
                />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function ExportButton({
  dataset,
  label,
  description,
  exportingDataset,
  onClick,
}: {
  dataset: ExportDataset;
  label: string;
  description: string;
  exportingDataset: ExportDataset | null;
  onClick: (dataset: ExportDataset) => void;
}) {
  return (
    <button
      onClick={() => onClick(dataset)}
      disabled={exportingDataset !== null}
      className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left transition-shadow hover:shadow-md disabled:opacity-60"
    >
      <div>
        <p className="text-sm font-semibold text-slate-900">{label}</p>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
      {exportingDataset === dataset ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-nnm-blue" />
      ) : (
        <Download className="h-4 w-4 shrink-0 text-nnm-blue" />
      )}
    </button>
  );
}