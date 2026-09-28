"use client";

import { useEffect, useState } from "react";
import { AlertCircle, BarChart3, ChevronLeft, CheckCircle2, XCircle } from "lucide-react";
import { AttendanceHeader } from "@/components/attendance/attendance-header";
import { useAttendanceGuard } from "@/lib/use-attendance-guard";
import {
  fetchHighMastWardStatusDashboard,
  fetchHighMastLightsForWard,
  type WardStatus,
  type HighMastLightStatus,
} from "@/lib/streetlight-api";

const OVERSIGHT_ROLES = ["city_manager", "deputy_municipal_commissioner", "municipal_commissioner", "attendance_admin"];

export default function HighMastStatusDashboardPage() {
  const attendance = useAttendanceGuard();
  const [wards, setWards] = useState<WardStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openWard, setOpenWard] = useState<{ id: number; name: string } | null>(null);
  const [wardLights, setWardLights] = useState<HighMastLightStatus[] | null>(null);
  const [loadingLights, setLoadingLights] = useState(false);

  useEffect(() => {
    if (!attendance) return;
    fetchHighMastWardStatusDashboard()
      .then(setWards)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the High Mast status dashboard."));
  }, [attendance]);

  async function openWardView(wardId: number, wardName: string) {
    setOpenWard({ id: wardId, name: wardName });
    setWardLights(null);
    setLoadingLights(true);
    setError(null);
    try {
      setWardLights(await fetchHighMastLightsForWard(wardId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load lights for this ward.");
    } finally {
      setLoadingLights(false);
    }
  }

  function backToWards() {
    setOpenWard(null);
    setWardLights(null);
  }

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
          High Mast Status Dashboard
        </h1>
        <p className="mb-6 text-sm text-slate-500">{openWard ? "High Mast lights in this ward." : "Click a ward to see its High Mast lights."}</p>

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {!openWard ? (
          !wards ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : wards.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">No High Mast lights registered yet.</div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-2.5 font-medium">Ward</th>
                    <th className="px-4 py-2.5 font-medium">Total</th>
                    <th className="px-4 py-2.5 font-medium">Working</th>
                    <th className="px-4 py-2.5 font-medium">Not Working</th>
                  </tr>
                </thead>
                <tbody>
                  {wards.map((w) => (
                    <tr
                      key={w.wardId}
                      onClick={() => openWardView(w.wardId, w.wardName)}
                      className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50"
                    >
                      <td className="px-4 py-2.5 font-medium text-slate-800">Ward {w.wardName}</td>
                      <td className="px-4 py-2.5">{w.totalLights}</td>
                      <td className="px-4 py-2.5 text-green-700">{w.working}</td>
                      <td className="px-4 py-2.5 text-red-600">{w.notWorking}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <div>
            <button onClick={backToWards} className="mb-4 flex items-center gap-1 text-sm font-medium text-nnm-blue hover:underline">
              <ChevronLeft className="h-4 w-4" />
              Back to wards
            </button>
            <h2 className="mb-3 text-base font-semibold text-slate-800">Ward {openWard.name}</h2>
            {loadingLights ? (
              <p className="text-sm text-slate-400">Loading…</p>
            ) : !wardLights || wardLights.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">No High Mast lights in this ward.</div>
            ) : (
              <div className="space-y-2">
                {wardLights.map((l) => (
                  <div key={l.lightId} className="rounded-lg border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-mono text-sm font-semibold text-slate-900">{l.serialNumber}</p>
                        <p className="text-xs text-slate-500">{l.localityName}</p>
                      </div>
                      {l.working ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Working
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
                          <XCircle className="h-3.5 w-3.5" />
                          Not Working
                        </span>
                      )}
                    </div>
                    {l.faultHistory.length > 0 && (
                      <details className="mt-2 text-xs text-slate-500">
                        <summary className="cursor-pointer font-medium text-slate-600">Fault history ({l.faultHistory.length})</summary>
                        <ul className="mt-1.5 space-y-1">
                          {l.faultHistory.map((f) => (
                            <li key={f.faultId}>
                              {new Date(f.reportedAt).toLocaleDateString("en-IN")} - {f.status} {f.reporterNotes ? `(${f.reporterNotes})` : ""}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
