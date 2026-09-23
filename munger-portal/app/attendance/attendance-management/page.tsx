"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, BarChart3, Camera, Download, Loader2, MessageSquare, Users, UserCog, Truck } from "lucide-react";
import { AttendanceHeader } from "@/components/attendance/attendance-header";
import { useAttendanceGuard } from "@/lib/use-attendance-guard";
import { fetchAttendanceDashboardSummary, type AttendanceDashboardSummary } from "@/lib/attendance-api";

function StatBlock({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div>
      <div className="text-2xl font-semibold text-slate-900">{value}</div>
      <div className={`text-xs ${className ?? "text-slate-500"}`}>{label}</div>
    </div>
  );
}

/**
 * Consolidates what used to be 8 separate cards on the main dashboard
 * (Reports, Photos, Feedback, Monthly Report, Manage Users, Manage
 * Staff, Manage Drivers, Manage Assistants) plus the "Today's
 * Overview" stats into one hub page, reached via a single
 * "Attendance Management" card - the main dashboard had grown
 * cluttered as fleet/street light/pyau/ward-admin features were added
 * alongside these, and this group is specifically about field staff
 * attendance, not those other modules.
 */
export default function AttendanceManagementPage() {
  const user = useAttendanceGuard(["sanitation_officer", "sanitation_prabhari", "attendance_admin"]);
  const [summary, setSummary] = useState<AttendanceDashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchAttendanceDashboardSummary()
      .then(setSummary)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the dashboard."));
  }, [user]);

  if (!user) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AttendanceHeader user={user} />

      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">Attendance Management</h1>
        <p className="mb-8 text-sm text-slate-500">Today&apos;s field staff overview, across every ward.</p>

        {error && (
          <div role="alert" className="mb-6 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <section className="mb-8 rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-base font-semibold text-slate-900">Today&apos;s Overview</h2>
          {!summary ? (
            <div className="flex items-center gap-2 py-4 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading...
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
              <StatBlock label="Wards" value={summary.wards.total} />
              <StatBlock label={`Staff (of ${summary.staff.total})`} value={summary.staff.today.present} className="text-green-600" />
              <StatBlock label={`Drivers (of ${summary.drivers.total})`} value={summary.drivers.today.present} className="text-green-600" />
              <StatBlock label={`Assistants (of ${summary.assistants.total})`} value={summary.assistants.today.present} className="text-green-600" />
              <StatBlock label={`Photos (of ${summary.photos.totalWards})`} value={summary.photos.uploadedToday} />

              <StatBlock label="Staff Half Day" value={summary.staff.today.halfDay} className="text-amber-600" />
              <StatBlock label="Staff Absent (Informed)" value={summary.staff.today.absentInformed} />
              <StatBlock label="Staff Absent (Not Informed)" value={summary.staff.today.absentNotInformed} className="text-red-600" />
              <StatBlock label="Staff Not Yet Marked" value={summary.staff.today.notYetMarked} className="text-slate-400" />
            </div>
          )}
        </section>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Link href="/attendance/reports" className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md">
            <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-nnm-blue">
              <BarChart3 className="h-6 w-6" strokeWidth={1.8} />
            </span>
            <h3 className="mb-1.5 text-base font-semibold text-slate-900">Reports</h3>
            <p className="text-sm text-slate-500">Staff and driver attendance totals, filterable by ward and date range.</p>
          </Link>

          <Link href="/attendance/photos" className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md">
            <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-nnm-blue">
              <Camera className="h-6 w-6" strokeWidth={1.8} />
            </span>
            <h3 className="mb-1.5 text-base font-semibold text-slate-900">Daily Photos</h3>
            <p className="text-sm text-slate-500">See every ward&apos;s group photo status for any date.</p>
          </Link>

          <Link href="/attendance/feedback" className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md">
            <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-nnm-blue">
              <MessageSquare className="h-6 w-6" strokeWidth={1.8} />
            </span>
            <h3 className="mb-1.5 text-base font-semibold text-slate-900">Feedback</h3>
            <p className="text-sm text-slate-500">Give and review positive/negative notes on individual staff.</p>
          </Link>

          {(user.role === "sanitation_officer" || user.role === "attendance_admin") && (
            <Link href="/attendance/monthly-report" className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md">
              <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-nnm-blue">
                <Download className="h-6 w-6" strokeWidth={1.8} />
              </span>
              <h3 className="mb-1.5 text-base font-semibold text-slate-900">Monthly Report</h3>
              <p className="text-sm text-slate-500">Download the full-month attendance matrix as CSV.</p>
            </Link>
          )}

          {user.role === "attendance_admin" && (
            <Link href="/attendance/users" className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md">
              <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-nnm-blue">
                <Users className="h-6 w-6" strokeWidth={1.8} />
              </span>
              <h3 className="mb-1.5 text-base font-semibold text-slate-900">Manage Users</h3>
              <p className="text-sm text-slate-500">Create Jamadar/Supervisor/Officer logins, activate or deactivate accounts.</p>
            </Link>
          )}

          {(user.role === "attendance_admin" || user.role === "sanitation_officer") && (
            <Link href="/attendance/manage-staff" className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md">
              <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-nnm-blue">
                <UserCog className="h-6 w-6" strokeWidth={1.8} />
              </span>
              <h3 className="mb-1.5 text-base font-semibold text-slate-900">Manage Field Staff</h3>
              <p className="text-sm text-slate-500">Add sanitation workers one at a time, or upload a full list.</p>
            </Link>
          )}

          {(user.role === "attendance_admin" || user.role === "sanitation_officer") && (
            <Link href="/attendance/manage-drivers" className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md">
              <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-nnm-blue">
                <Truck className="h-6 w-6" strokeWidth={1.8} />
              </span>
              <h3 className="mb-1.5 text-base font-semibold text-slate-900">Manage Drivers</h3>
              <p className="text-sm text-slate-500">Add drivers one at a time, or upload a full list.</p>
            </Link>
          )}

          {(user.role === "attendance_admin" || user.role === "sanitation_officer") && (
            <Link href="/attendance/manage-assistants" className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md">
              <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-nnm-blue">
                <Users className="h-6 w-6" strokeWidth={1.8} />
              </span>
              <h3 className="mb-1.5 text-base font-semibold text-slate-900">Manage Assistants</h3>
              <p className="text-sm text-slate-500">Each assistant is tied to a driver - supervisor inherited automatically.</p>
            </Link>
          )}
        </div>
      </main>
    </div>
  );
}
