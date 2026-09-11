"use client";

import { useState } from "react";
import { AlertCircle, Calculator, CheckCircle2, Download, FileWarning, Loader2 } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import {
  bulkGenerateDemandNotices,
  bulkRegenerateTaxHistory,
  downloadExport,
  type BulkGenerateResult,
  type BulkRegenerateTaxHistoryResult,
  type ExportDataset,
} from "@/lib/admin-api";

export default function AdminDemandNoticesPage() {
  const admin = useAdminGuard();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BulkGenerateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const r = await bulkGenerateDemandNotices();
      setResult(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk generation failed.");
    } finally {
      setRunning(false);
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
            Generates a demand notice for every holding that has floor data on file but has never had one — matching
            the original bulk batch tool. This only logs each notice (holding number, demand number, amount) — it
            does not print anything. A printable copy for any specific holding is still available from that
            property&apos;s page afterward.
          </p>

          <button
            onClick={handleRun}
            disabled={running}
            className="mb-6 inline-flex items-center gap-2 rounded-md bg-nnm-blue px-6 py-3 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileWarning className="h-4 w-4" />}
            {running ? "Generating…" : "Run Bulk Generation"}
          </button>

          {error && (
            <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {result && (
            <div className="space-y-5">
              <div className="flex items-start gap-2.5 rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-semibold">
                    {result.processed} notice{result.processed === 1 ? "" : "s"} generated
                    {result.errors.length > 0 ? `, ${result.errors.length} error(s)` : ""}.
                  </p>
                </div>
              </div>

              {result.generated.length > 0 && (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                        <th className="px-4 py-2.5 font-medium">Holding No</th>
                        <th className="px-4 py-2.5 font-medium">Demand No</th>
                        <th className="px-4 py-2.5 font-medium text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.generated.map((g) => (
                        <tr key={g.holdingNo} className="border-b border-slate-100 last:border-0">
                          <td className="px-4 py-2 font-mono">{g.holdingNo}</td>
                          <td className="px-4 py-2 font-mono text-slate-500">{g.formattedDemandNo}</td>
                          <td className="px-4 py-2 text-right">₹{Number(g.grandTotal).toLocaleString("en-IN")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {result.errors.length > 0 && (
                <div className="rounded-xl border border-red-200 bg-white p-4">
                  <h2 className="mb-2 text-sm font-semibold text-red-700">Errors</h2>
                  <ul className="space-y-1 text-sm text-red-600">
                    {result.errors.map((e) => (
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