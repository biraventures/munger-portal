"use client";

import Link from "next/link";
import { AlertTriangle, BarChart3, Upload, Route as RouteIcon, UserCheck as UserCheckIcon, Clock as ClockIcon, PlusCircle, Lightbulb, Trash2 } from "lucide-react";
import { AttendanceHeader } from "@/components/attendance/attendance-header";
import { useAttendanceGuard } from "@/lib/use-attendance-guard";

const OVERSIGHT_ROLES = ["city_manager", "municipal_commissioner", "deputy_municipal_commissioner", "attendance_admin"];
const COMMISSIONER_ROLES = ["municipal_commissioner", "attendance_admin"];
const LIGHT_CHANGE_ROLES = ["streetlight_nodal_clerk", "streetlight_ae", "streetlight_je", "streetlight_contractor", "city_manager", "municipal_commissioner", "deputy_municipal_commissioner", "attendance_admin"];

const cardClass = "flex flex-col rounded-xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md";
const iconWrapClass = "mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-nnm-blue";

export default function StreetlightsHubPage() {
  const attendance = useAttendanceGuard();

  if (!attendance) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  const isOversight = OVERSIGHT_ROLES.includes(attendance.role);
  const isCommissioner = COMMISSIONER_ROLES.includes(attendance.role);
  const canChangeLights = LIGHT_CHANGE_ROLES.includes(attendance.role);

  return (
    <div className="min-h-screen bg-slate-50">
      <AttendanceHeader user={attendance} />

      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <Lightbulb className="h-6 w-6" />
          Streetlights
        </h1>
        <p className="mb-6 text-sm text-slate-500">Everything streetlight-related, in one place.</p>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Link href="/attendance/report-streetlight-fault" className={cardClass}>
            <span className={iconWrapClass}>
              <AlertTriangle className="h-6 w-6" strokeWidth={1.8} />
            </span>
            <h3 className="mb-1.5 text-base font-semibold text-slate-900">Report Streetlight Fault</h3>
            <p className="text-sm text-slate-500">Report a damaged or non-functional streetlight noticed in the field.</p>
          </Link>

          {canChangeLights && (
            <Link href="/attendance/light-change-requests" className={cardClass}>
              <span className={iconWrapClass}>
                <PlusCircle className="h-6 w-6" strokeWidth={1.8} />
              </span>
              <h3 className="mb-1.5 text-base font-semibold text-slate-900">Light Change Requests</h3>
              <p className="text-sm text-slate-500">Add, change status, deactivate, reactivate, or delete a light - City Manager, DMC, Commissioner approval.</p>
            </Link>
          )}

          {isOversight && (
            <Link href="/attendance/streetlight-status-dashboard" className={cardClass}>
              <span className={iconWrapClass}>
                <BarChart3 className="h-6 w-6" strokeWidth={1.8} />
              </span>
              <h3 className="mb-1.5 text-base font-semibold text-slate-900">Status Dashboard</h3>
              <p className="text-sm text-slate-500">Working vs not working, ward-wise or street-wise, with per-street drill-down.</p>
            </Link>
          )}

          {isCommissioner && (
            <Link href="/attendance/streetlights-bulk-upload" className={cardClass}>
              <span className={iconWrapClass}>
                <Upload className="h-6 w-6" strokeWidth={1.8} />
              </span>
              <h3 className="mb-1.5 text-base font-semibold text-slate-900">Bulk Upload</h3>
              <p className="text-sm text-slate-500">Import street-wise light inventory from a Nagar Nigam or EESL CSV.</p>
            </Link>
          )}

          {isCommissioner && (
            <Link href="/attendance/street-segments" className={cardClass}>
              <span className={iconWrapClass}>
                <RouteIcon className="h-6 w-6" strokeWidth={1.8} />
              </span>
              <h3 className="mb-1.5 text-base font-semibold text-slate-900">Street Segments</h3>
              <p className="text-sm text-slate-500">Add or update GPS for each street&apos;s start and end points.</p>
            </Link>
          )}

          {isCommissioner && (
            <Link href="/attendance/streetlight-city-manager" className={cardClass}>
              <span className={iconWrapClass}>
                <UserCheckIcon className="h-6 w-6" strokeWidth={1.8} />
              </span>
              <h3 className="mb-1.5 text-base font-semibold text-slate-900">City Manager Assignment</h3>
              <p className="text-sm text-slate-500">Choose which City Manager follows up on streetlight faults.</p>
            </Link>
          )}

          {isCommissioner && (
            <Link href="/attendance/streetlight-delay-report" className={cardClass}>
              <span className={iconWrapClass}>
                <ClockIcon className="h-6 w-6" strokeWidth={1.8} />
              </span>
              <h3 className="mb-1.5 text-base font-semibold text-slate-900">Delay Report</h3>
              <p className="text-sm text-slate-500">How long streetlight repairs are taking against the 72-hour deadline.</p>
            </Link>
          )}

          {isCommissioner && (
            <Link href="/attendance/streetlights-delete-all" className={`${cardClass} border-red-200`}>
              <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
                <Trash2 className="h-6 w-6" strokeWidth={1.8} />
              </span>
              <h3 className="mb-1.5 text-base font-semibold text-red-700">Delete All Streetlight Data</h3>
              <p className="text-sm text-slate-500">Wipe every light, street, and fault record. Cannot be undone.</p>
            </Link>
          )}
        </div>
      </main>
    </div>
  );
}
