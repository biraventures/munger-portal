"use client";

import { useState } from "react";
import { Upload, AlertCircle, CheckCircle2, Loader2, Download } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { uploadMigratedHoldingsXlsx, downloadMigratedHoldingsExport, type MigratedHoldingImportResult } from "@/lib/admin-api";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.slice(dataUrl.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}

export default function MigratedHoldingsBulkUploadPage() {
  const admin = useAdminGuard();
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MigratedHoldingImportResult | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function handleExport() {
    setExporting(true);
    setExportError(null);
    try {
      await downloadMigratedHoldingsExport();
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Could not download the export.");
    } finally {
      setExporting(false);
    }
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError(null);
    setResult(null);
    setUploading(true);
    try {
      const base64 = await fileToBase64(file);
      const res = await uploadMigratedHoldingsXlsx(base64);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload this file.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  if (!admin) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  if (admin.role !== "commissioner") {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <main className="mx-auto max-w-2xl px-6 py-10">
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Bulk holding upload is restricted to the Municipal Commissioner.
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />

      <main className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">Bulk Upload Old Holdings (MUNG-MIG-)</h1>
        <p className="mb-6 text-sm text-slate-500">
          Upload the cleaned old-holdings spreadsheet (Sl. No., Ward No., Old Holding No., Old PID No., Holding Owner
          Name, Relation, Relative Name, ARV columns, Last Payment Year, Tax Status, Remarks). Each row becomes a new
          MUNG-MIG- holding awaiting survey. Rows still marked &quot;Needs Review&quot; are skipped, not imported.
        </p>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Upload className="h-4 w-4" />
            Cleaned Holdings .xlsx File
          </label>
          <input
            type="file"
            accept=".xlsx"
            onChange={handleFileSelected}
            disabled={uploading}
            className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-md file:border-0 file:bg-nnm-blue file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-nnm-blue-dark disabled:opacity-60"
          />

          {uploading && (
            <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Importing {fileName}…
            </div>
          )}

          {error && (
            <div role="alert" className="mt-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {result && (
            <div className="mt-4 space-y-3">
              <div role="status" className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Import complete.
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-md border border-slate-200 p-4 text-sm">
                <div>
                  <span className="block text-xs text-slate-400">Holdings Created</span>
                  <span className="font-semibold">{result.holdingsCreated}</span>
                </div>
                <div>
                  <span className="block text-xs text-slate-400">Rows Skipped (Needs Review)</span>
                  <span className="font-semibold">{result.rowsSkipped}</span>
                </div>
              </div>

              {result.errors.length > 0 && (
                <details className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  <summary className="cursor-pointer font-semibold">{result.errors.length} row(s) failed - click to view</summary>
                  <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto">
                    {result.errors.map((e, i) => (
                      <li key={i}>
                        <span className="font-mono">row {e.row}</span>: {e.message}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>

        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="mb-1 text-base font-semibold text-slate-900">Complete Data Trail</h2>
          <p className="mb-4 text-sm text-slate-500">
            Download every migrated holding&apos;s current state and its full event history (assignments, surveyor
            submissions, reverts, verifications, finalization) as a spreadsheet.
          </p>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 rounded-md bg-nnm-blue px-4 py-2 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
          >
            <Download className="h-4 w-4" />
            {exporting ? "Downloading…" : "Download Export (.xlsx)"}
          </button>
          {exportError && (
            <div role="alert" className="mt-3 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {exportError}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
