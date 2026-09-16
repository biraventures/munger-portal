"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, AlertTriangle, CheckCircle2, Loader2, Search, ClipboardList } from "lucide-react";
import { AttendanceHeader } from "@/components/attendance/attendance-header";
import { useAttendanceGuard } from "@/lib/use-attendance-guard";
import { fetchBaselineSurveySummary, downloadBaselineSurveyPdf, type AssetSurveySummary } from "@/lib/attendance-api";

type FilterMode = "all" | "not_surveyed" | "open_defects";

/** Fleet-wide progress view for the baseline survey - which assets are done, which still need a survey, and which have open defects flagged. */
export default function FleetSurveySummaryPage() {
  const attendanceUser = useAttendanceGuard();
  const [assets, setAssets] = useState<AssetSurveySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");

  useEffect(() => {
    if (!attendanceUser) return;
    fetchBaselineSurveySummary()
      .then(setAssets)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the survey summary."));
  }, [attendanceUser]);

  if (!attendanceUser) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  const surveyedCount = assets?.filter((a) => a.survey_id !== null).length ?? 0;
  const totalCount = assets?.length ?? 0;

  const filtered = assets?.filter((a) => {
    if (search.trim()) {
      const q = search.toLowerCase();
      const matches = a.label.toLowerCase().includes(q) || (a.driver_name ?? "").toLowerCase().includes(q) || (a.registration_number ?? "").toLowerCase().includes(q);
      if (!matches) return false;
    }
    if (filter === "not_surveyed" && a.survey_id !== null) return false;
    if (filter === "open_defects" && Number(a.open_defect_count) === 0) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-50">
      <AttendanceHeader user={attendanceUser} />

      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <ClipboardList className="h-6 w-6" />
          Fleet Baseline Survey - Progress
        </h1>
        <p className="mb-4 text-sm text-slate-500">
          {totalCount > 0 ? `${surveyedCount} of ${totalCount} assets surveyed.` : "No assets in the fleet yet."}
        </p>

        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2">
            <Search className="h-4 w-4 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by label, driver, or registration no." className="text-sm outline-none" />
          </div>
          {([
            ["all", "All"],
            ["not_surveyed", "Not yet surveyed"],
            ["open_defects", "Has open defects"],
          ] as [FilterMode, string][]).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                filter === value ? "bg-nnm-blue text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-100"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {!assets ? (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : filtered && filtered.length === 0 ? (
          <p className="text-sm text-slate-400">No assets match.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Asset</th>
                  <th className="px-4 py-3 font-medium">Driver</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Survey</th>
                  <th className="px-4 py-3 font-medium">Overall Status</th>
                  <th className="px-4 py-3 font-medium">AMC</th>
                  <th className="px-4 py-3 font-medium">Open Defects</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered?.map((a) => (
                  <tr key={a.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {a.label}
                      {a.registration_number && <span className="ml-1 font-normal text-slate-500">({a.registration_number})</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{a.driver_name ?? "-"}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{a.asset_type_detail ?? "-"}</td>
                    <td className="px-4 py-3">
                      {a.survey_id ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-700">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {new Date(a.survey_date!).toLocaleDateString("en-IN")}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Not surveyed
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{a.overall_status ?? "-"}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-600">{a.amc_disposition ?? "-"}</td>
                    <td className="px-4 py-3">
                      {Number(a.open_defect_count) > 0 ? (
                        <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                          {a.open_defect_count}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-300">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-3">
                        {a.survey_id && (
                          <button
                            onClick={() => downloadBaselineSurveyPdf(a.id, a.label)}
                            className="text-xs font-semibold text-nnm-blue hover:underline"
                          >
                            Download PDF
                          </button>
                        )}
                        <Link href={`/attendance/baseline-survey?assetId=${a.id}`} className="text-xs font-semibold text-nnm-blue hover:underline">
                          {a.survey_id ? "Update" : "Survey now"}
                        </Link>
                      </div>
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
