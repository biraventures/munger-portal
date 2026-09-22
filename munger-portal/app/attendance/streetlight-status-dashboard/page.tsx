"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, BarChart3, ChevronLeft, ChevronDown, ChevronRight, CheckCircle2, XCircle } from "lucide-react";
import { AttendanceHeader } from "@/components/attendance/attendance-header";
import { useAttendanceGuard } from "@/lib/use-attendance-guard";
import {
  fetchWardStatusDashboard,
  fetchStreetStatusDashboard,
  fetchSegmentLightStatus,
  type WardStatus,
  type StreetStatus,
  type SegmentLightStatus,
} from "@/lib/streetlight-api";

const OVERSIGHT_ROLES = ["city_manager", "deputy_municipal_commissioner", "municipal_commissioner", "attendance_admin"];

export default function StreetlightStatusDashboardPage() {
  const attendance = useAttendanceGuard();
  const [wards, setWards] = useState<WardStatus[] | null>(null);
  const [streets, setStreets] = useState<StreetStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openWard, setOpenWard] = useState<string | null>(null);
  const [expandedSegmentId, setExpandedSegmentId] = useState<number | null>(null);
  const [segmentLights, setSegmentLights] = useState<Record<number, SegmentLightStatus[]>>({});
  const [loadingSegmentId, setLoadingSegmentId] = useState<number | null>(null);

  useEffect(() => {
    if (!attendance) return;
    Promise.all([fetchWardStatusDashboard(), fetchStreetStatusDashboard()])
      .then(([w, s]) => {
        setWards(w);
        setStreets(s);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the status dashboard."));
  }, [attendance]);

  const wardTotals = useMemo(() => {
    if (!wards) return null;
    return wards.reduce((acc, w) => ({ total: acc.total + w.totalLights, working: acc.working + w.working, notWorking: acc.notWorking + w.notWorking }), { total: 0, working: 0, notWorking: 0 });
  }, [wards]);

  const streetsInOpenWard = useMemo(() => {
    if (!streets || !openWard) return [];
    return streets.filter((s) => s.wardName === openWard);
  }, [streets, openWard]);

  const streetTotalsForWard = useMemo(() => {
    if (streetsInOpenWard.length === 0) return null;
    return streetsInOpenWard.reduce((acc, s) => ({ total: acc.total + s.totalLights, working: acc.working + s.working, notWorking: acc.notWorking + s.notWorking }), { total: 0, working: 0, notWorking: 0 });
  }, [streetsInOpenWard]);

  function openWardView(wardName: string) {
    setOpenWard(wardName);
    setExpandedSegmentId(null);
  }

  function backToWards() {
    setOpenWard(null);
    setExpandedSegmentId(null);
  }

  async function toggleSegment(segmentId: number) {
    if (expandedSegmentId === segmentId) {
      setExpandedSegmentId(null);
      return;
    }
    setExpandedSegmentId(segmentId);
    if (!segmentLights[segmentId]) {
      setLoadingSegmentId(segmentId);
      try {
        const lights = await fetchSegmentLightStatus(segmentId);
        setSegmentLights((prev) => ({ ...prev, [segmentId]: lights }));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load lights for this street.");
      } finally {
        setLoadingSegmentId(null);
      }
    }
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
          Streetlight Status Dashboard
        </h1>
        <p className="mb-6 text-sm text-slate-500">
          {openWard ? "Streets in this ward. Click a street to see individual lights." : "Click a ward to see its streets."}
        </p>

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
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">No lights registered yet.</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase text-slate-500">
                    <th className="px-4 py-2.5"></th>
                    <th className="px-4 py-2.5">Ward</th>
                    <th className="px-4 py-2.5">Total</th>
                    <th className="px-4 py-2.5">Working</th>
                    <th className="px-4 py-2.5">Not Working</th>
                  </tr>
                </thead>
                <tbody>
                  {wards.map((w) => (
                    <tr key={w.wardId} onClick={() => openWardView(w.wardName)} className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50">
                      <td className="px-4 py-2.5 text-slate-400">
                        <ChevronRight className="h-4 w-4" />
                      </td>
                      <td className="px-4 py-2.5 font-semibold text-slate-800">{w.wardName}</td>
                      <td className="px-4 py-2.5">{w.totalLights}</td>
                      <td className="px-4 py-2.5 text-green-700">{w.working}</td>
                      <td className="px-4 py-2.5">{w.notWorking > 0 ? <span className="font-semibold text-red-600">{w.notWorking}</span> : 0}</td>
                    </tr>
                  ))}
                </tbody>
                {wardTotals && (
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-800">
                      <td className="px-4 py-2.5" colSpan={2}>
                        Total
                      </td>
                      <td className="px-4 py-2.5">{wardTotals.total}</td>
                      <td className="px-4 py-2.5 text-green-700">{wardTotals.working}</td>
                      <td className="px-4 py-2.5 text-red-600">{wardTotals.notWorking}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )
        ) : (
          <>
            <button onClick={backToWards} className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-nnm-blue hover:underline">
              <ChevronLeft className="h-4 w-4" />
              Back to wards
            </button>

            {streetsInOpenWard.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">No street segments in {openWard} yet.</div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase text-slate-500">
                      <th className="px-4 py-2.5"></th>
                      <th className="px-4 py-2.5">Street</th>
                      <th className="px-4 py-2.5">Agency</th>
                      <th className="px-4 py-2.5">Total</th>
                      <th className="px-4 py-2.5">Working</th>
                      <th className="px-4 py-2.5">Not Working</th>
                    </tr>
                  </thead>
                  <tbody>
                    {streetsInOpenWard.map((s) => (
                      <>
                        <tr
                          key={s.segmentId}
                          onClick={() => s.segmentId && toggleSegment(s.segmentId)}
                          className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50"
                        >
                          <td className="px-4 py-2.5 text-slate-400">
                            {expandedSegmentId === s.segmentId ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </td>
                          <td className="px-4 py-2.5 font-semibold text-slate-800">{s.endPoint ? `${s.startPoint} - ${s.endPoint}` : s.startPoint}</td>
                          <td className="px-4 py-2.5">{s.agencyName}</td>
                          <td className="px-4 py-2.5">{s.totalLights}</td>
                          <td className="px-4 py-2.5 text-green-700">{s.working}</td>
                          <td className="px-4 py-2.5">{s.notWorking > 0 ? <span className="font-semibold text-red-600">{s.notWorking}</span> : 0}</td>
                        </tr>
                        {expandedSegmentId === s.segmentId && (
                          <tr key={`${s.segmentId}-detail`}>
                            <td colSpan={6} className="border-b border-slate-100 bg-slate-50 p-4">
                              {loadingSegmentId === s.segmentId ? (
                                <p className="text-xs text-slate-400">Loading…</p>
                              ) : !s.segmentId || !segmentLights[s.segmentId] || segmentLights[s.segmentId]!.length === 0 ? (
                                <p className="text-xs text-slate-400">No lights on this street yet.</p>
                              ) : (
                                <div className="space-y-3">
                                  {segmentLights[s.segmentId]!.map((l) => (
                                    <div key={l.lightId} className="rounded-md border border-slate-200 bg-white p-3">
                                      <div className="mb-1 flex items-center gap-2">
                                        <span className="font-mono text-xs text-slate-700">{l.serialNumber}</span>
                                        {l.working ? (
                                          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-green-700">
                                            <CheckCircle2 className="h-3 w-3" />
                                            Working
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-red-700">
                                            <XCircle className="h-3 w-3" />
                                            Not Working
                                          </span>
                                        )}
                                        {!l.active && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">Inactive</span>}
                                      </div>
                                      {l.faultHistory.length > 0 && (
                                        <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
                                          <p className="text-[10px] font-semibold uppercase text-slate-400">Repair history</p>
                                          {l.faultHistory.map((f) => (
                                            <p key={f.faultId} className="text-xs text-slate-600">
                                              Reported {new Date(f.reportedAt).toLocaleDateString("en-IN")}
                                              {f.status === "repaired" && f.repairedAt ? ` · Repaired ${new Date(f.repairedAt).toLocaleDateString("en-IN")}` : " · Still open"}
                                              {f.reporterNotes ? ` - "${f.reporterNotes}"` : ""}
                                            </p>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                  {streetTotalsForWard && (
                    <tfoot>
                      <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-800">
                        <td className="px-4 py-2.5" colSpan={3}>
                          Total
                        </td>
                        <td className="px-4 py-2.5">{streetTotalsForWard.total}</td>
                        <td className="px-4 py-2.5 text-green-700">{streetTotalsForWard.working}</td>
                        <td className="px-4 py-2.5 text-red-600">{streetTotalsForWard.notWorking}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
