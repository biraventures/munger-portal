"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Clock, Download } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { fetchStreetlightDelayReport, downloadStreetlightDelayReport, type StreetlightDelayReportRow } from "@/lib/admin-api";

export default function StreetlightDelayReportPage() {
  const admin = useAdminGuard();
  const [report, setReport] = useState<StreetlightDelayReportRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!admin) return;
    fetchStreetlightDelayReport()
      .then(setReport)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the delay report."));
  }, [admin]);

  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      await downloadStreetlightDelayReport();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not download the export.");
    } finally {
      setExporting(false);
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
            This is restricted to the Municipal Commissioner.
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />

      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-1 flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
            <Clock className="h-6 w-6" />
            Streetlight Delay Report
          </h1>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <Download className="h-3.5 w-3.5" />
            {exporting ? "Downloading…" : "Export (.xlsx)"}
          </button>
        </div>
        <p className="mb-6 text-sm text-slate-500">How long each streetlight fault has taken (or is taking) to repair, against the 72-hour deadline.</p>

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {!report ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : report.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">No faults reported yet.</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase text-slate-500">
                  <th className="px-4 py-2.5">Light</th>
                  <th className="px-4 py-2.5">Ward / Street</th>
                  <th className="px-4 py-2.5">Reported</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Hours taken</th>
                  <th className="px-4 py-2.5">Overdue</th>
                </tr>
              </thead>
              <tbody>
                {report.map((r) => (
                  <tr key={r.faultId} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-2.5 font-mono text-xs">{r.serialNumber ?? "-"}</td>
                    <td className="px-4 py-2.5">
                      {r.wardName ?? "-"}
                      {r.startPoint ? ` · ${r.startPoint}${r.endPoint ? `-${r.endPoint}` : ""}` : ""}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">
                      {new Date(r.reportedAt).toLocaleDateString("en-IN")}
                      {r.nonFunctionalSince && (
                        <div className="mt-0.5 text-amber-700">
                          Out since {new Date(r.nonFunctionalSince).toLocaleDateString("en-IN")}
                          {r.localSourceName ? ` (per ${r.localSourceName})` : ""}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${r.status === "repaired" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">{r.hoursTaken ?? "-"}</td>
                    <td className="px-4 py-2.5">
                      {r.pastDeadline ? <span className="font-semibold text-red-600">{r.hoursOverdue}h overdue</span> : <span className="text-slate-400">On time</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
