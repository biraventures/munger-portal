"use client";

import { useEffect, useState } from "react";
import { AlertCircle, BarChart3, ChevronLeft, CheckCircle2, XCircle } from "lucide-react";
import { AttendanceHeader } from "@/components/attendance/attendance-header";
import { useAttendanceGuard } from "@/lib/use-attendance-guard";
import {
  fetchHighMastWardStatusDashboard,
  fetchHighMastLightsForWard,
  markFaultRepaired,
  reportFault,
  type WardStatus,
  type HighMastLightStatus,
} from "@/lib/streetlight-api";

const OVERSIGHT_ROLES = ["city_manager", "deputy_municipal_commissioner", "municipal_commissioner", "attendance_admin"];

/** Local (not UTC) today, so the date input's default doesn't drift a day off around midnight IST. */
function todayLocalDateString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function HighMastStatusDashboardPage() {
  const attendance = useAttendanceGuard();
  const [wards, setWards] = useState<WardStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openWard, setOpenWard] = useState<{ id: number; name: string } | null>(null);
  const [wardLights, setWardLights] = useState<HighMastLightStatus[] | null>(null);
  const [loadingLights, setLoadingLights] = useState(false);
  const [markingRepairedLightId, setMarkingRepairedLightId] = useState<number | null>(null);
  const [markingFaultyLightId, setMarkingFaultyLightId] = useState<number | null>(null);
  const [faultyFormLightId, setFaultyFormLightId] = useState<number | null>(null);
  const [faultyFormNotes, setFaultyFormNotes] = useState("");
  const [faultyFormDate, setFaultyFormDate] = useState(todayLocalDateString());
  const [repairFormLightId, setRepairFormLightId] = useState<number | null>(null);
  const [repairFormNotes, setRepairFormNotes] = useState("");

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

  /**
   * Same fix as the streetlight status dashboard: closes every open
   * fault on this light (there's nothing stopping more than one), then
   * reloads this ward's list so the badge actually flips to Working.
   * Opens a small inline form (comments, optional) first, so a repair
   * comment lands in the delay report's Comments column too.
   */
  function openRepairForm(light: HighMastLightStatus) {
    setRepairFormLightId(light.lightId);
    setRepairFormNotes("");
    setError(null);
  }

  function cancelRepairForm() {
    setRepairFormLightId(null);
  }

  async function submitMarkRepaired(light: HighMastLightStatus) {
    if (!openWard) return;
    const openFaultIds = light.faultHistory.filter((f) => f.status === "open").map((f) => f.faultId);
    if (openFaultIds.length === 0) {
      setRepairFormLightId(null);
      return;
    }
    setMarkingRepairedLightId(light.lightId);
    setError(null);
    try {
      for (const faultId of openFaultIds) {
        await markFaultRepaired(faultId, repairFormNotes.trim() || null);
      }
      setRepairFormLightId(null);
      setWardLights(await fetchHighMastLightsForWard(openWard.id));
      fetchHighMastWardStatusDashboard().then(setWards).catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mark this light repaired.");
    } finally {
      setMarkingRepairedLightId(null);
    }
  }

  /**
   * The reverse of handleMarkRepaired - flags a currently-working light
   * faulty right from here. Opens a small inline form (comments +
   * non-functional-since date, defaulted to today) rather than
   * reporting immediately.
   */
  function openMarkFaultyForm(light: HighMastLightStatus) {
    setFaultyFormLightId(light.lightId);
    setFaultyFormNotes("");
    setFaultyFormDate(todayLocalDateString());
    setError(null);
  }

  function cancelMarkFaultyForm() {
    setFaultyFormLightId(null);
  }

  async function submitMarkFaulty(lightId: number) {
    if (!openWard) return;
    setMarkingFaultyLightId(lightId);
    setError(null);
    try {
      await reportFault(lightId, faultyFormNotes.trim() || null, faultyFormDate || null);
      setFaultyFormLightId(null);
      setWardLights(await fetchHighMastLightsForWard(openWard.id));
      fetchHighMastWardStatusDashboard().then(setWards).catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not report this light as faulty.");
    } finally {
      setMarkingFaultyLightId(null);
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
                      <div className="flex items-center gap-2">
                        {l.working ? (
                          <>
                            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Working
                            </span>
                            {faultyFormLightId !== l.lightId && (
                              <button
                                onClick={() => openMarkFaultyForm(l)}
                                className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                                Mark Faulty
                              </button>
                            )}
                          </>
                        ) : (
                          <>
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
                              <XCircle className="h-3.5 w-3.5" />
                              Not Working
                            </span>
                            {repairFormLightId !== l.lightId && (
                              <button
                                onClick={() => openRepairForm(l)}
                                className="inline-flex items-center gap-1 rounded-full bg-green-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-green-700"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Mark Repaired
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    {repairFormLightId === l.lightId && (
                      <div className="mt-3 space-y-2 rounded-md border border-green-200 bg-green-50 p-3">
                        <div>
                          <label className="mb-1 block text-[10px] font-semibold uppercase text-slate-500">Repair comments</label>
                          <textarea
                            value={repairFormNotes}
                            onChange={(e) => setRepairFormNotes(e.target.value)}
                            rows={2}
                            placeholder="What was fixed… (optional)"
                            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-nnm-blue"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => submitMarkRepaired(l)}
                            disabled={markingRepairedLightId === l.lightId}
                            className="rounded-md bg-green-600 px-3 py-1 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-60"
                          >
                            {markingRepairedLightId === l.lightId ? "Marking…" : "Mark Repaired"}
                          </button>
                          <button onClick={cancelRepairForm} className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100">
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                    {faultyFormLightId === l.lightId && (
                      <div className="mt-3 space-y-2 rounded-md border border-red-200 bg-red-50 p-3">
                        <div>
                          <label className="mb-1 block text-[10px] font-semibold uppercase text-slate-500">Non-functional since</label>
                          <input
                            type="date"
                            value={faultyFormDate}
                            max={todayLocalDateString()}
                            onChange={(e) => setFaultyFormDate(e.target.value)}
                            className="rounded-md border border-slate-300 px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-nnm-blue"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] font-semibold uppercase text-slate-500">Comments</label>
                          <textarea
                            value={faultyFormNotes}
                            onChange={(e) => setFaultyFormNotes(e.target.value)}
                            rows={2}
                            placeholder="What's wrong with this light… (optional)"
                            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-nnm-blue"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => submitMarkFaulty(l.lightId)}
                            disabled={markingFaultyLightId === l.lightId}
                            className="rounded-md bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                          >
                            {markingFaultyLightId === l.lightId ? "Reporting…" : "Report Faulty"}
                          </button>
                          <button onClick={cancelMarkFaultyForm} className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100">
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                    {l.faultHistory.length > 0 && (
                      <details className="mt-2 text-xs text-slate-500">
                        <summary className="cursor-pointer font-medium text-slate-600">Fault history ({l.faultHistory.length})</summary>
                        <ul className="mt-1.5 space-y-1">
                          {l.faultHistory.map((f) => (
                            <li key={f.faultId}>
                              {new Date(f.reportedAt).toLocaleDateString("en-IN")}
                              {f.reportedByName ? ` by ${f.reportedByName}` : f.reportedByType === "public" ? " (public)" : ""} - {f.status}
                              {f.status === "repaired" && f.repairedByName ? ` by ${f.repairedByName}` : ""} {f.reporterNotes ? `(${f.reporterNotes})` : ""}
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
