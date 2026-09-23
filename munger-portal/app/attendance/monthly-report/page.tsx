"use client";

import { useState } from "react";
import { AlertCircle, Download, Loader2 } from "lucide-react";
import { AttendanceHeader } from "@/components/attendance/attendance-header";
import { useAttendanceGuard } from "@/lib/use-attendance-guard";
import { downloadMonthlyStaffReport, downloadMonthlyDriverReport, downloadMonthlyAssistantReport } from "@/lib/attendance-api";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function MonthlyReportPage() {
  const user = useAttendanceGuard(["sanitation_officer", "attendance_admin"]);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [downloading, setDownloading] = useState<"staff" | "drivers" | "assistants" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload(kind: "staff" | "drivers" | "assistants") {
    setDownloading(kind);
    setError(null);
    try {
      if (kind === "staff") await downloadMonthlyStaffReport(year, month);
      else if (kind === "drivers") await downloadMonthlyDriverReport(year, month);
      else await downloadMonthlyAssistantReport(year, month);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed.");
    } finally {
      setDownloading(null);
    }
  }

  if (!user) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AttendanceHeader user={user} />

      <main className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">Monthly Attendance Report</h1>
        <p className="mb-6 text-sm text-slate-500">
          One row per person, one column per day of the month - downloads directly as a CSV file.
        </p>

        <div className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Month</label>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1"
            >
              {MONTH_NAMES.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Year</label>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-24 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1"
            />
          </div>
        </div>

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <button
            onClick={() => handleDownload("staff")}
            disabled={downloading !== null}
            className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-5 text-left transition-shadow hover:shadow-md disabled:opacity-60"
          >
            <div>
              <p className="text-sm font-semibold text-slate-900">Field Staff Report</p>
              <p className="text-xs text-slate-500">Sanitation workers - {MONTH_NAMES[month - 1]} {year}</p>
            </div>
            {downloading === "staff" ? <Loader2 className="h-4 w-4 animate-spin text-nnm-blue" /> : <Download className="h-4 w-4 text-nnm-blue" />}
          </button>

          <button
            onClick={() => handleDownload("drivers")}
            disabled={downloading !== null}
            className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-5 text-left transition-shadow hover:shadow-md disabled:opacity-60"
          >
            <div>
              <p className="text-sm font-semibold text-slate-900">Driver Report</p>
              <p className="text-xs text-slate-500">Vehicle drivers - {MONTH_NAMES[month - 1]} {year}</p>
            </div>
            {downloading === "drivers" ? <Loader2 className="h-4 w-4 animate-spin text-nnm-blue" /> : <Download className="h-4 w-4 text-nnm-blue" />}
          </button>

          <button
            onClick={() => handleDownload("assistants")}
            disabled={downloading !== null}
            className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-5 text-left transition-shadow hover:shadow-md disabled:opacity-60"
          >
            <div>
              <p className="text-sm font-semibold text-slate-900">Driver Assistant Report</p>
              <p className="text-xs text-slate-500">Vehicle driver assistants - {MONTH_NAMES[month - 1]} {year}</p>
            </div>
            {downloading === "assistants" ? <Loader2 className="h-4 w-4 animate-spin text-nnm-blue" /> : <Download className="h-4 w-4 text-nnm-blue" />}
          </button>
        </div>
      </main>
    </div>
  );
}
