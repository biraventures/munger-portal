"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { AttendanceHeader } from "@/components/attendance/attendance-header";
import { useAttendanceGuard } from "@/lib/use-attendance-guard";
import {
  fetchAttendanceWards,
  fetchStaffReport,
  fetchDriverReport,
  fetchAssistantReport,
  type AttendanceWard,
  type StaffReportResult,
  type DriverReportResult,
  type AssistantReportResult,
} from "@/lib/attendance-api";

const inputClass =
  "rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";

export default function AttendanceReportsPage() {
  const user = useAttendanceGuard(["sanitation_officer", "sanitation_prabhari", "attendance_admin"]);
  const [tab, setTab] = useState<"staff" | "drivers" | "assistants">("staff");
  const [wards, setWards] = useState<AttendanceWard[]>([]);
  const [wardId, setWardId] = useState<string>("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [staffReport, setStaffReport] = useState<StaffReportResult | null>(null);
  const [driverReport, setDriverReport] = useState<DriverReportResult | null>(null);
  const [assistantReport, setAssistantReport] = useState<AssistantReportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchAttendanceWards()
      .then(setWards)
      .catch(() => setWards([]));
  }, [user]);

  async function runReport() {
    setLoading(true);
    setError(null);
    const filters = { fromDate: fromDate || undefined, toDate: toDate || undefined, wardId: wardId ? Number(wardId) : undefined };
    try {
      if (tab === "staff") {
        setStaffReport(await fetchStaffReport(filters));
      } else if (tab === "drivers") {
        setDriverReport(await fetchDriverReport(filters));
      } else {
        setAssistantReport(await fetchAssistantReport(filters));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the report.");
    } finally {
      setLoading(false);
    }
  }

  if (!user) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AttendanceHeader user={user} />

      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">Attendance Reports</h1>
        <p className="mb-6 text-sm text-slate-500">Totals plus a full daily log, filterable by ward and date range.</p>

        <div className="mb-6 flex gap-2">
          <button
            onClick={() => setTab("staff")}
            className={`rounded-md px-4 py-2 text-sm font-semibold ${tab === "staff" ? "bg-nnm-blue text-white" : "border border-slate-200 text-slate-600"}`}
          >
            Field Staff
          </button>
          <button
            onClick={() => setTab("drivers")}
            className={`rounded-md px-4 py-2 text-sm font-semibold ${tab === "drivers" ? "bg-nnm-blue text-white" : "border border-slate-200 text-slate-600"}`}
          >
            Drivers
          </button>
          <button
            onClick={() => setTab("assistants")}
            className={`rounded-md px-4 py-2 text-sm font-semibold ${tab === "assistants" ? "bg-nnm-blue text-white" : "border border-slate-200 text-slate-600"}`}
          >
            Driver Assistants
          </button>
        </div>

        <div className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Ward</label>
            <select value={wardId} onChange={(e) => setWardId(e.target.value)} className={inputClass}>
              <option value="">All wards</option>
              {wards.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.wardName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">From</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">To</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={inputClass} />
          </div>
          <button
            onClick={runReport}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md bg-nnm-blue px-5 py-2 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Run Report
          </button>
        </div>

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {tab === "staff" && staffReport && (
          <div className="space-y-6">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-2.5 font-medium">Name</th>
                    <th className="px-4 py-2.5 font-medium text-right">Present</th>
                    <th className="px-4 py-2.5 font-medium text-right">Half Day</th>
                    <th className="px-4 py-2.5 font-medium text-right">Absent (Informed)</th>
                    <th className="px-4 py-2.5 font-medium text-right">Absent (Not Informed)</th>
                    <th className="px-4 py-2.5 font-medium text-right">Positive FB</th>
                    <th className="px-4 py-2.5 font-medium text-right">Negative FB</th>
                  </tr>
                </thead>
                <tbody>
                  {staffReport.rows.map((r) => (
                    <tr key={r.staffId} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-2">{r.name}</td>
                      <td className="px-4 py-2 text-right">{r.present}</td>
                      <td className="px-4 py-2 text-right">{r.halfDay}</td>
                      <td className="px-4 py-2 text-right">{r.absentInformed}</td>
                      <td className="px-4 py-2 text-right">{r.absentNotInformed}</td>
                      <td className="px-4 py-2 text-right text-green-600">{r.positive}</td>
                      <td className="px-4 py-2 text-right text-red-600">{r.negative}</td>
                    </tr>
                  ))}
                  {staffReport.rows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                        No records for this filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "drivers" && driverReport && (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Vehicle</th>
                  <th className="px-4 py-2.5 font-medium text-right">Present</th>
                  <th className="px-4 py-2.5 font-medium text-right">Half Day</th>
                  <th className="px-4 py-2.5 font-medium text-right">Absent (Informed)</th>
                  <th className="px-4 py-2.5 font-medium text-right">Absent (Not Informed)</th>
                </tr>
              </thead>
              <tbody>
                {driverReport.rows.map((r) => (
                  <tr key={r.staffId} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2">{r.name}</td>
                    <td className="px-4 py-2">{r.vehicleNumber || "-"}</td>
                    <td className="px-4 py-2 text-right">{r.present}</td>
                    <td className="px-4 py-2 text-right">{r.halfDay}</td>
                    <td className="px-4 py-2 text-right">{r.absentInformed}</td>
                    <td className="px-4 py-2 text-right">{r.absentNotInformed}</td>
                  </tr>
                ))}
                {driverReport.rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                      No records for this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === "assistants" && assistantReport && (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium text-right">Present</th>
                  <th className="px-4 py-2.5 font-medium text-right">Half Day</th>
                  <th className="px-4 py-2.5 font-medium text-right">Absent (Informed)</th>
                  <th className="px-4 py-2.5 font-medium text-right">Absent (Not Informed)</th>
                </tr>
              </thead>
              <tbody>
                {assistantReport.rows.map((r) => (
                  <tr key={r.staffId} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2">{r.name}</td>
                    <td className="px-4 py-2 text-right">{r.present}</td>
                    <td className="px-4 py-2 text-right">{r.halfDay}</td>
                    <td className="px-4 py-2 text-right">{r.absentInformed}</td>
                    <td className="px-4 py-2 text-right">{r.absentNotInformed}</td>
                  </tr>
                ))}
                {assistantReport.rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                      No records for this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
