"use client";

import { useState } from "react";
import Link from "next/link";
import { Upload, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { uploadPropertiesXlsx, type PropertyBulkImportResult } from "@/lib/admin-api";

/** Reads a File as base64 (no data-URL prefix) - needed since the backup is a binary .xlsx file, not text/CSV. */
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

export default function PropertiesBulkUploadPage() {
  const admin = useAdminGuard();
  const [fileName, setFileName] = useState<string | null>(null);
  const [dataSourceName, setDataSourceName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PropertyBulkImportResult | null>(null);

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError(null);
    setResult(null);
    setUploading(true);
    try {
      const base64 = await fileToBase64(file);
      const res = await uploadPropertiesXlsx(base64, dataSourceName.trim(), file.name);
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

  if (!["commissioner", "tax_daroga", "city_manager"].includes(admin.role)) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <main className="mx-auto max-w-2xl px-6 py-10">
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Bulk property upload is restricted to the Municipal Commissioner, Tax Daroga and City Manager.
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />

      <main className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">Bulk Upload Properties</h1>
        <p className="mb-6 text-sm text-slate-500">
          Upload a Google-Sheets-style backup export (.xlsx) with Master, Floors, Transactions, PropertyHistory,
          DemandNotices, and TaxHistoryStages sheets - the same shape this system was originally migrated from. The file is
          checked and kept for review - nothing goes live until the Tax Daroga has reviewed it and the City Manager gives final approval (all holdings,
          selected holdings, or all except a few). Holdings that already exist are never overwritten.
        </p>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <label className="mb-1 block text-sm font-semibold text-slate-700" htmlFor="data-source-name">
            Name of this data (source of the holdings)
          </label>
          <p className="mb-2 text-xs text-slate-500">
            Shown in each holding&apos;s audit trail as where it was created from, e.g. &quot;Ward 12 field survey 2025 - Excel&quot; or
            &quot;Old property tax register - Part 1&quot;. Required.
          </p>
          <input
            id="data-source-name"
            value={dataSourceName}
            onChange={(e) => setDataSourceName(e.target.value)}
            maxLength={200}
            placeholder="Name of the data being uploaded"
            disabled={uploading}
            className="mb-5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />

          <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Upload className="h-4 w-4" />
            Backup .xlsx File
          </label>
          <input
            type="file"
            accept=".xlsx"
            onChange={handleFileSelected}
            disabled={uploading || dataSourceName.trim().length < 3}
            className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-md file:border-0 file:bg-nnm-blue file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-nnm-blue-dark disabled:opacity-60"
          />

          {uploading && (
            <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Reading and checking {fileName}… this can take a little while for a large file.
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
                File received and kept for review. No holding has gone live yet.
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-md border border-slate-200 p-4 text-sm sm:grid-cols-4">
                <div>
                  <span className="block text-xs text-slate-400">Holdings in file</span>
                  <span className="font-semibold">{result.totalHoldings}</span>
                </div>
                <div>
                  <span className="block text-xs text-slate-400">No issues</span>
                  <span className="font-semibold text-green-700">{result.ready}</span>
                </div>
                <div>
                  <span className="block text-xs text-slate-400">With warnings</span>
                  <span className="font-semibold text-amber-700">{result.withWarnings}</span>
                </div>
                <div>
                  <span className="block text-xs text-slate-400">Cannot be imported</span>
                  <span className="font-semibold text-red-700">{result.withBlockers}</span>
                </div>
              </div>
              {admin.role === "commissioner" ? (
                <p className="text-sm text-slate-600">The Tax Daroga will review this upload and the City Manager will give final approval. You can follow the progress under Uploaded Holdings.</p>
              ) : (
                <Link href={`/admin/holding-imports/${result.batchId}`} className="inline-block rounded-md bg-nnm-blue px-4 py-2 text-sm font-semibold text-white hover:bg-nnm-blue-dark">
                  Open this upload for review
                </Link>
              )}

              {result.errors.length > 0 && (
                <details className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  <summary className="cursor-pointer font-semibold">{result.errors.length} row(s) could not be staged - click to view</summary>
                  <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto">
                    {result.errors.map((e, i) => (
                      <li key={i}>
                        <span className="font-mono">
                          {e.sheet} row {e.row}
                        </span>
                        : {e.message}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
