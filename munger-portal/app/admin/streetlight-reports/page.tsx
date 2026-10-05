"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Download, Loader2 } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import {
  fetchStreetlightReport,
  downloadStreetlightReportCsv,
  STREETLIGHT_REPORT_LABELS,
  type StreetlightReportKind,
  type StreetlightReportTable,
} from "@/lib/streetlight-reports-api";

const KINDS: StreetlightReportKind[] = ["ward-wise", "street-wise", "agency-wise", "light-wise"];

// The Light-wise list can run to thousands of rows - only this many are drawn on screen, the CSV download always has every row.
const PREVIEW_ROW_LIMIT = 300;
const ALLOWED_ROLES = ["commissioner", "deputy_commissioner", "city_manager", "je_mechanical", "ae_mechanical"];

export default function StreetlightReportsPage() {
  const admin = useAdminGuard();
  const [kind, setKind] = useState<StreetlightReportKind>("ward-wise");
  const [report, setReport] = useState<StreetlightReportTable | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const allowed = admin !== null && ALLOWED_ROLES.includes(admin.role);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    setReport(null);
    setError(null);
    fetchStreetlightReport(kind)
      .then((r) => {
        if (!cancelled) setReport(r);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load this report.");
      });
    return () => {
      cancelled = true;
    };
  }, [kind, allowed]);

  async function handleDownload() {
    setDownloading(true);
    setError(null);
    try {
      await downloadStreetlightReportCsv(kind);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not download this report.");
    } finally {
      setDownloading(false);
    }
  }

  if (!admin) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  if (!allowed) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <main className="mx-auto max-w-2xl px-6 py-10">
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Street light reports are available to the Commissioner, Deputy Commissioner, City Manager and JE/AE - Mechanical.
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">Street Light Reports</h1>
        <p className="mb-6 text-sm text-slate-500">
          Counts of active street lights and high mast lights. A light is &quot;non-functional&quot; while it has an open fault or its switch status is set to Not working; deactivated and deleted lights are left out. The Light-wise tab marks every individual light Functional or Non-functional.
        </p>

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
            {KINDS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
                  kind === k ? "bg-nnm-blue text-white" : "text-slate-600 hover:text-nnm-blue"
                }`}
              >
                {STREETLIGHT_REPORT_LABELS[k]}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading || !report}
            className="inline-flex items-center gap-2 rounded-md bg-nnm-blue px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Download CSV (Excel)
          </button>
        </div>

        {error && (
          <div role="alert" className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}
        {!report && !error && (
          <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}

        {report && (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">{report.title}</h2>
              <p className="text-xs text-slate-400">As on {report.generatedOn}</p>
            </div>
            {report.rows.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500">No lights recorded yet.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    {report.columns.map((c) => (
                      <th key={c} className="px-3 py-2.5 font-semibold">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.rows.slice(0, PREVIEW_ROW_LIMIT).map((r, i) => (
                    <tr key={i}>
                      {r.map((cell, j) => (
                        <td key={j} className={`px-3 py-2.5 ${typeof cell === "number" ? "text-right tabular-nums" : "text-slate-800"}`}>
                          {cell === "Functional" || cell === "Non-functional" ? (
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                cell === "Functional" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                              }`}
                            >
                              {cell}
                            </span>
                          ) : (
                            cell
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-semibold text-slate-900">
                  <tr>
                    {report.totals.map((cell, j) => (
                      <td key={j} className={`px-3 py-2.5 ${typeof cell === "number" ? "text-right tabular-nums" : ""}`}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            )}
            {report.rows.length > PREVIEW_ROW_LIMIT && (
              <p className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
                Showing the first {PREVIEW_ROW_LIMIT} of {report.rows.length} rows - download the CSV for the full list.
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
