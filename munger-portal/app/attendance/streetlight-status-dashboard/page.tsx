"use client";

import { useEffect, useState } from "react";
import { AlertCircle, BarChart3 } from "lucide-react";
import { AttendanceHeader } from "@/components/attendance/attendance-header";
import { useAttendanceGuard } from "@/lib/use-attendance-guard";
import { fetchWardStatusDashboard, fetchStreetStatusDashboard, type WardStatus, type StreetStatus } from "@/lib/streetlight-api";

const OVERSIGHT_ROLES = ["city_manager", "deputy_municipal_commissioner", "municipal_commissioner", "attendance_admin"];

export default function StreetlightStatusDashboardPage() {
  const attendance = useAttendanceGuard();
  const [view, setView] = useState<"ward" | "street">("ward");
  const [wards, setWards] = useState<WardStatus[] | null>(null);
  const [streets, setStreets] = useState<StreetStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!attendance) return;
    Promise.all([fetchWardStatusDashboard(), fetchStreetStatusDashboard()])
      .then(([w, s]) => {
        setWards(w);
        setStreets(s);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the status dashboard."));
  }, [attendance]);

  if (!attendance) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  if (!OVERSIGHT_ROLES.includes(attendance.role)) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AttendanceHeader user={attendance} />
        <main className="mx-auto max-w-2xl px-6 py-10">
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            This is restricted to City Manager, Deputy Municipal Commissioner, and Municipal Commissioner.
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AttendanceHeader user={attendance} />

      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <BarChart3 className="h-6 w-6" />
          Streetlight Status Dashboard
        </h1>
        <p className="mb-6 text-sm text-slate-500">Active lights, working vs not working, ward-wise or street-wise.</p>

        <div className="mb-5 flex gap-2">
          <button
            onClick={() => setView("ward")}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold ${view === "ward" ? "bg-nnm-blue text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-100"}`}
          >
            Ward-wise
          </button>
          <button
            onClick={() => setView("street")}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold ${view === "street" ? "bg-nnm-blue text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-100"}`}
          >
            Street-wise
          </button>
        </div>

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {view === "ward" ? (
          !wards ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : wards.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">No lights registered yet.</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase text-slate-500">
                    <th className="px-4 py-2.5">Ward</th>
                    <th className="px-4 py-2.5">Total</th>
                    <th className="px-4 py-2.5">Working</th>
                    <th className="px-4 py-2.5">Not Working</th>
                  </tr>
                </thead>
                <tbody>
                  {wards.map((w) => (
                    <tr key={w.wardId} className="border-b border-slate-50 last:border-0">
                      <td className="px-4 py-2.5 font-semibold text-slate-800">{w.wardName}</td>
                      <td className="px-4 py-2.5">{w.totalLights}</td>
                      <td className="px-4 py-2.5 text-green-700">{w.working}</td>
                      <td className="px-4 py-2.5">{w.notWorking > 0 ? <span className="font-semibold text-red-600">{w.notWorking}</span> : 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : !streets ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : streets.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">No street segments uploaded yet.</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase text-slate-500">
                  <th className="px-4 py-2.5">Ward</th>
                  <th className="px-4 py-2.5">Street</th>
                  <th className="px-4 py-2.5">Agency</th>
                  <th className="px-4 py-2.5">Total</th>
                  <th className="px-4 py-2.5">Working</th>
                  <th className="px-4 py-2.5">Not Working</th>
                </tr>
              </thead>
              <tbody>
                {streets.map((s) => (
                  <tr key={s.segmentId} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-2.5">{s.wardName}</td>
                    <td className="px-4 py-2.5 font-semibold text-slate-800">{s.endPoint ? `${s.startPoint} - ${s.endPoint}` : s.startPoint}</td>
                    <td className="px-4 py-2.5">{s.agencyName}</td>
                    <td className="px-4 py-2.5">{s.totalLights}</td>
                    <td className="px-4 py-2.5 text-green-700">{s.working}</td>
                    <td className="px-4 py-2.5">{s.notWorking > 0 ? <span className="font-semibold text-red-600">{s.notWorking}</span> : 0}</td>
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
