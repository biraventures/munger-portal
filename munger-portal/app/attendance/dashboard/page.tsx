"use client";

import Link from "next/link";
import { LayoutGrid, Truck, Droplet, Lightbulb, MapPin, ClipboardList, CheckCircle2 } from "lucide-react";
import { AttendanceHeader } from "@/components/attendance/attendance-header";
import { useAttendanceGuard } from "@/lib/use-attendance-guard";

const CORE_ATTENDANCE_ROLES = ["sanitation_officer", "sanitation_prabhari", "attendance_admin"];

export default function AttendanceDashboardPage() {
  const user = useAttendanceGuard([
    "sanitation_officer",
    "sanitation_prabhari",
    "attendance_admin",
    "junior_engineer",
    "assistant_engineer_mechanical",
    "maintenance_nodal_clerk",
    "streetlight_contractor",
    "streetlight_je",
    "streetlight_ae",
    "streetlight_nodal_clerk",
    "city_manager",
    "deputy_municipal_commissioner",
    "municipal_commissioner",
    "pyau_je",
    "pyau_ae",
    "pyau_contractor",
  ]);

  if (!user) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AttendanceHeader user={user} />

      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">Welcome, {user.displayName}</h1>
        <p className="mb-8 text-sm text-slate-500">Pick a module below.</p>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {CORE_ATTENDANCE_ROLES.includes(user.role) && (
            <Link
              href="/attendance/attendance-management"
              className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md"
            >
              <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-nnm-blue">
                <LayoutGrid className="h-6 w-6" strokeWidth={1.8} />
              </span>
              <h3 className="mb-1.5 text-base font-semibold text-slate-900">Attendance Management</h3>
              <p className="text-sm text-slate-500">
                Today&apos;s overview, reports, photos, feedback, and manage staff/drivers/assistants.
              </p>
            </Link>
          )}

          {[
            "attendance_admin",
            "junior_engineer",
            "assistant_engineer_mechanical",
            "maintenance_nodal_clerk",
            "sanitation_officer",
            "sanitation_prabhari",
          ].includes(user.role) && (
            <Link href="/attendance/manage-assets" className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md">
              <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-nnm-blue">
                <Truck className="h-6 w-6" strokeWidth={1.8} />
              </span>
              <h3 className="mb-1.5 text-base font-semibold text-slate-900">Fleet & Asset Registry</h3>
              <p className="text-sm text-slate-500">Vehicles, tricycles, hand carts - status and maintenance history.</p>
            </Link>
          )}

          {["attendance_admin", "junior_engineer", "assistant_engineer_mechanical", "maintenance_nodal_clerk"].includes(user.role) && (
            <Link href="/attendance/baseline-survey" className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md">
              <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-nnm-blue">
                <ClipboardList className="h-6 w-6" strokeWidth={1.8} />
              </span>
              <h3 className="mb-1.5 text-base font-semibold text-slate-900">Fleet Baseline Survey</h3>
              <p className="text-sm text-slate-500">The comprehensive opening entry for each vehicle/equipment logbook.</p>
            </Link>
          )}

          {["attendance_admin", "junior_engineer", "assistant_engineer_mechanical", "maintenance_nodal_clerk"].includes(user.role) && (
            <Link href="/attendance/fleet-survey-summary" className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md">
              <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-nnm-blue">
                <CheckCircle2 className="h-6 w-6" strokeWidth={1.8} />
              </span>
              <h3 className="mb-1.5 text-base font-semibold text-slate-900">Survey Progress</h3>
              <p className="text-sm text-slate-500">Which assets are surveyed, which aren&apos;t, and which have open defects.</p>
            </Link>
          )}

          {["pyau_je", "pyau_ae", "pyau_contractor", "attendance_admin"].includes(user.role) && (
            <Link href="/attendance/manage-pyaus" className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md">
              <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-nnm-blue">
                <Droplet className="h-6 w-6" strokeWidth={1.8} />
              </span>
              <h3 className="mb-1.5 text-base font-semibold text-slate-900">Submersible Pyau Registry</h3>
              <p className="text-sm text-slate-500">Ward-wise water kiosk inventory, issues, and maintenance log.</p>
            </Link>
          )}

          {[
            "streetlight_nodal_clerk",
            "streetlight_ae",
            "streetlight_je",
            "streetlight_contractor",
            "city_manager",
            "municipal_commissioner",
            "deputy_municipal_commissioner",
            "attendance_admin",
          ].includes(user.role) && (
            <Link href="/attendance/manage-lights" className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md">
              <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-nnm-blue">
                <Lightbulb className="h-6 w-6" strokeWidth={1.8} />
              </span>
              <h3 className="mb-1.5 text-base font-semibold text-slate-900">Street Light & High Mast Registry</h3>
              <p className="text-sm text-slate-500">Ward-wise light inventory, faults, and installation agencies.</p>
            </Link>
          )}

          <Link href="/attendance/streetlights" className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md">
            <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-nnm-blue">
              <Lightbulb className="h-6 w-6" strokeWidth={1.8} />
            </span>
            <h3 className="mb-1.5 text-base font-semibold text-slate-900">Streetlights</h3>
            <p className="text-sm text-slate-500">Report faults, manage the registry, and view status - everything in one place.</p>
          </Link>

          {user.role === "attendance_admin" && (
            <Link href="/attendance/manage-wards" className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md">
              <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-nnm-blue">
                <MapPin className="h-6 w-6" strokeWidth={1.8} />
              </span>
              <h3 className="mb-1.5 text-base font-semibold text-slate-900">Manage Wards</h3>
              <p className="text-sm text-slate-500">Clean up unused/garbage wards, e.g. from a bad CSV import.</p>
            </Link>
          )}
        </div>
      </main>
    </div>
  );
}
