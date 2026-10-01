"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, BarChart3, ChevronLeft, ChevronDown, ChevronRight, CheckCircle2, XCircle, MapPin, LocateFixed } from "lucide-react";
import { AttendanceHeader } from "@/components/attendance/attendance-header";
import { useAttendanceGuard } from "@/lib/use-attendance-guard";
import {
  fetchWardStatusDashboard,
  fetchStreetStatusDashboard,
  fetchSegmentLightStatus,
  markFaultRepaired,
  reportFault,
  setLightGps,
  type WardStatus,
  type StreetStatus,
  type SegmentLightStatus,
} from "@/lib/streetlight-api";

/**
 * Same ward -> street -> light status view as the City Manager/DMC/
 * Commissioner dashboard (streetlight-status-dashboard/page.tsx), for
 * Mayor, Deputy Mayor, and Ward Parshad - but view-only apart from
 * Mark Faulty/Mark Repaired. No add/edit/delete street, no insert/
 * delete light, no switch-status control - those stay Commissioner-
 * side. A ward_parshad login only ever sees their own ward - the
 * backend already scopes the wards/streets/lights it returns (see
 * statusDashboardWardScope in streetlight.controller.ts), so there's
 * nothing extra to filter here. Mayor/Deputy Mayor see every ward,
 * same as City Manager.
 */
const VIEWER_ROLES = ["mayor", "deputy_mayor", "ward_parshad"];

/** Local (not UTC) today, so the date input's default doesn't drift a day off around midnight IST. */
function todayLocalDateString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function StreetlightStatusViewPage() {
  const attendance = useAttendanceGuard();
  const [wards, setWards] = useState<WardStatus[] | null>(null);
  const [streets, setStreets] = useState<StreetStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openWard, setOpenWard] = useState<string | null>(null);
  const [expandedSegmentId, setExpandedSegmentId] = useState<number | null>(null);
  const [segmentLights, setSegmentLights] = useState<Record<number, SegmentLightStatus[]>>({});
  const [loadingSegmentId, setLoadingSegmentId] = useState<number | null>(null);

  const [markingRepairedLightId, setMarkingRepairedLightId] = useState<number | null>(null);
  const [markingFaultyLightId, setMarkingFaultyLightId] = useState<number | null>(null);
  const [faultyFormLightId, setFaultyFormLightId] = useState<number | null>(null);
  const [faultyFormNotes, setFaultyFormNotes] = useState("");
  const [faultyFormDate, setFaultyFormDate] = useState(todayLocalDateString());
  const [repairFormLightId, setRepairFormLightId] = useState<number | null>(null);
  const [repairFormNotes, setRepairFormNotes] = useState("");
  const [repairFormDate, setRepairFormDate] = useState(todayLocalDateString());

  const [gpsFormLightId, setGpsFormLightId] = useState<number | null>(null);
  const [gpsFormLat, setGpsFormLat] = useState("");
  const [gpsFormLng, setGpsFormLng] = useState("");
  const [gpsFormError, setGpsFormError] = useState<string | null>(null);
  const [savingGpsLightId, setSavingGpsLightId] = useState<number | null>(null);
  const [locatingGps, setLocatingGps] = useState(false);

  const [agencyFilter, setAgencyFilter] = useState<"" | "NN" | "EESL">("");

  function load() {
    const agency = agencyFilter || undefined;
    Promise.all([fetchWardStatusDashboard(agency), fetchStreetStatusDashboard(agency)])
      .then(([w, s]) => {
        setWards(w);
        setStreets(s);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the status dashboard."));
  }

  useEffect(() => {
    if (!attendance) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendance, agencyFilter]);

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

  async function refreshSegmentLights(segmentId: number) {
    try {
      const lights = await fetchSegmentLightStatus(segmentId);
      setSegmentLights((prev) => ({ ...prev, [segmentId]: lights }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load lights for this street.");
    }
  }

  async function toggleSegment(segmentId: number) {
    if (expandedSegmentId === segmentId) {
      setExpandedSegmentId(null);
      return;
    }
    setExpandedSegmentId(segmentId);
    if (!segmentLights[segmentId]) {
      setLoadingSegmentId(segmentId);
      await refreshSegmentLights(segmentId);
      setLoadingSegmentId(null);
    }
  }

  function openRepairForm(light: SegmentLightStatus) {
    setRepairFormLightId(light.lightId);
    setRepairFormNotes("");
    setRepairFormDate(todayLocalDateString());
    setError(null);
  }

  function cancelRepairForm() {
    setRepairFormLightId(null);
  }

  async function submitMarkRepaired(segmentId: number, light: SegmentLightStatus) {
    const openFaultIds = light.faultHistory.filter((f) => f.status === "open").map((f) => f.faultId);
    if (openFaultIds.length === 0) {
      setRepairFormLightId(null);
      return;
    }
    setMarkingRepairedLightId(light.lightId);
    setError(null);
    try {
      for (const faultId of openFaultIds) {
        await markFaultRepaired(faultId, repairFormNotes.trim() || null, repairFormDate || null);
      }
      setRepairFormLightId(null);
      await refreshSegmentLights(segmentId);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mark this light functional.");
    } finally {
      setMarkingRepairedLightId(null);
    }
  }

  function openMarkFaultyForm(light: SegmentLightStatus) {
    setFaultyFormLightId(light.lightId);
    setFaultyFormNotes("");
    setFaultyFormDate(todayLocalDateString());
    setError(null);
  }

  function cancelMarkFaultyForm() {
    setFaultyFormLightId(null);
  }

  async function submitMarkFaulty(segmentId: number, lightId: number) {
    setMarkingFaultyLightId(lightId);
    setError(null);
    try {
      await reportFault(lightId, faultyFormNotes.trim() || null, faultyFormDate || null);
      setFaultyFormLightId(null);
      await refreshSegmentLights(segmentId);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not report this light as defective.");
    } finally {
      setMarkingFaultyLightId(null);
    }
  }

  /**
   * Optional per-light GPS location, entered next to the light's serial
   * number - a location note distinct from a fault report's own GPS.
   * Opens with the light's existing coordinates pre-filled, if any.
   */
  function openGpsForm(light: SegmentLightStatus) {
    setGpsFormLightId(light.lightId);
    setGpsFormLat(light.latitude != null ? String(light.latitude) : "");
    setGpsFormLng(light.longitude != null ? String(light.longitude) : "");
    setGpsFormError(null);
  }

  function cancelGpsForm() {
    setGpsFormLightId(null);
    setGpsFormError(null);
  }

  /** Fills the form from the browser's current location, if the device/browser allows it - the field stays editable either way. */
  function useCurrentLocationForGpsForm() {
    if (!navigator.geolocation) {
      setGpsFormError("This device doesn't support location capture. Enter the coordinates manually.");
      return;
    }
    setLocatingGps(true);
    setGpsFormError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsFormLat(String(pos.coords.latitude.toFixed(6)));
        setGpsFormLng(String(pos.coords.longitude.toFixed(6)));
        setLocatingGps(false);
      },
      () => {
        setGpsFormError("Could not get the current location. Enter the coordinates manually.");
        setLocatingGps(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function submitGpsForm(segmentId: number, lightId: number) {
    const latTrim = gpsFormLat.trim();
    const lngTrim = gpsFormLng.trim();
    if ((latTrim === "") !== (lngTrim === "")) {
      setGpsFormError("Enter both latitude and longitude, or leave both blank.");
      return;
    }
    const lat = latTrim === "" ? null : Number(latTrim);
    const lng = lngTrim === "" ? null : Number(lngTrim);
    if ((lat !== null && (Number.isNaN(lat) || lat < -90 || lat > 90)) || (lng !== null && (Number.isNaN(lng) || lng < -180 || lng > 180))) {
      setGpsFormError("Enter valid coordinates (latitude -90 to 90, longitude -180 to 180).");
      return;
    }
    setSavingGpsLightId(lightId);
    setGpsFormError(null);
    try {
      await setLightGps(lightId, lat, lng);
      setGpsFormLightId(null);
      await refreshSegmentLights(segmentId);
    } catch (err) {
      setGpsFormError(err instanceof Error ? err.message : "Could not save this light's location.");
    } finally {
      setSavingGpsLightId(null);
    }
  }

  async function clearGpsForm(segmentId: number, lightId: number) {
    setSavingGpsLightId(lightId);
    setGpsFormError(null);
    try {
      await setLightGps(lightId, null, null);
      setGpsFormLightId(null);
      await refreshSegmentLights(segmentId);
    } catch (err) {
      setGpsFormError(err instanceof Error ? err.message : "Could not clear this light's location.");
    } finally {
      setSavingGpsLightId(null);
    }
  }

  if (!attendance) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  if (!VIEWER_ROLES.includes(attendance.role)) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AttendanceHeader user={attendance} />
        <main className="mx-auto max-w-2xl px-6 py-10">
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            This is restricted to Mayor, Deputy Mayor, and Ward Parshad.
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
          Streetlight Status
        </h1>
        <p className="mb-4 text-sm text-slate-500">
          {openWard ? "Streets in this ward. Click a street to see individual lights." : "Click a ward to see its streets."}
        </p>

        <div className="mb-6 flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500">Agency:</span>
          {(
            [
              ["", "Both"],
              ["NN", "Nagar Nigam"],
              ["EESL", "EESL"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setAgencyFilter(value)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${agencyFilter === value ? "bg-nnm-blue text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-100"}`}
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
                        <tr key={s.segmentId} onClick={() => s.segmentId && toggleSegment(s.segmentId)} className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50">
                          <td className="px-4 py-2.5 text-slate-400">{expandedSegmentId === s.segmentId ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
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
                                <div className="space-y-2">
                                  {segmentLights[s.segmentId]!.map((l) => (
                                    <div key={l.lightId} className="rounded-md border border-slate-200 bg-white p-3">
                                      <div className="mb-1 flex flex-wrap items-center gap-2">
                                        {gpsFormLightId !== l.lightId &&
                                          (l.latitude != null && l.longitude != null ? (
                                            <button
                                              onClick={() => openGpsForm(l)}
                                              title="Edit this light's recorded location"
                                              className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 hover:bg-blue-100"
                                            >
                                              <MapPin className="h-3 w-3" />
                                              {l.latitude.toFixed(5)}, {l.longitude.toFixed(5)}
                                            </button>
                                          ) : (
                                            <button
                                              onClick={() => openGpsForm(l)}
                                              title="Optionally record this light's GPS location"
                                              className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-[10px] font-medium text-slate-400 hover:border-nnm-blue hover:text-nnm-blue"
                                            >
                                              <MapPin className="h-3 w-3" />
                                              Add location
                                            </button>
                                          ))}
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

                                        {!l.working && repairFormLightId !== l.lightId && (
                                          <button
                                            onClick={() => openRepairForm(l)}
                                            className="ml-auto inline-flex items-center gap-1 rounded-full bg-green-600 px-2 py-0.5 text-[10px] font-semibold uppercase text-white hover:bg-green-700"
                                          >
                                            <CheckCircle2 className="h-3 w-3" />
                                            Mark Functional
                                          </button>
                                        )}

                                        {l.working && faultyFormLightId !== l.lightId && (
                                          <button
                                            onClick={() => openMarkFaultyForm(l)}
                                            className="ml-auto inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-semibold uppercase text-white hover:bg-red-700"
                                          >
                                            <XCircle className="h-3 w-3" />
                                            Mark Defective
                                          </button>
                                        )}
                                      </div>
                                      {repairFormLightId === l.lightId && (
                                        <div className="mt-2 space-y-2 rounded-md border border-green-200 bg-green-50 p-3">
                                          <div>
                                            <label className="mb-1 block text-[10px] font-semibold uppercase text-slate-500">Functional since</label>
                                            <input
                                              type="date"
                                              value={repairFormDate}
                                              max={todayLocalDateString()}
                                              onChange={(e) => setRepairFormDate(e.target.value)}
                                              className="rounded-md border border-slate-300 px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-nnm-blue"
                                            />
                                          </div>
                                          <div>
                                            <label className="mb-1 block text-[10px] font-semibold uppercase text-slate-500">Remarks</label>
                                            <textarea
                                              value={repairFormNotes}
                                              onChange={(e) => setRepairFormNotes(e.target.value)}
                                              rows={2}
                                              placeholder="What was fixed…"
                                              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-nnm-blue"
                                            />
                                          </div>
                                          <div className="flex gap-2">
                                            <button
                                              onClick={() => submitMarkRepaired(s.segmentId!, l)}
                                              disabled={markingRepairedLightId === l.lightId}
                                              className="rounded-md bg-green-600 px-3 py-1 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-60"
                                            >
                                              {markingRepairedLightId === l.lightId ? "Marking…" : "Mark Functional"}
                                            </button>
                                            <button onClick={cancelRepairForm} className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100">
                                              Cancel
                                            </button>
                                          </div>
                                        </div>
                                      )}
                                      {faultyFormLightId === l.lightId && (
                                        <div className="mt-2 space-y-2 rounded-md border border-red-200 bg-red-50 p-3">
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
                                              onClick={() => submitMarkFaulty(s.segmentId!, l.lightId)}
                                              disabled={markingFaultyLightId === l.lightId}
                                              className="rounded-md bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                                            >
                                              {markingFaultyLightId === l.lightId ? "Reporting…" : "Mark Defective"}
                                            </button>
                                            <button onClick={cancelMarkFaultyForm} className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100">
                                              Cancel
                                            </button>
                                          </div>
                                        </div>
                                      )}
                                      {gpsFormLightId === l.lightId && (
                                        <div className="mt-2 space-y-2 rounded-md border border-blue-200 bg-blue-50 p-3">
                                          <div className="flex flex-wrap items-end gap-2">
                                            <div>
                                              <label className="mb-1 block text-[10px] font-semibold uppercase text-slate-500">Latitude</label>
                                              <input
                                                type="text"
                                                inputMode="decimal"
                                                value={gpsFormLat}
                                                onChange={(e) => setGpsFormLat(e.target.value)}
                                                placeholder="e.g. 25.3746"
                                                className="w-28 rounded-md border border-slate-300 px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-nnm-blue"
                                              />
                                            </div>
                                            <div>
                                              <label className="mb-1 block text-[10px] font-semibold uppercase text-slate-500">Longitude</label>
                                              <input
                                                type="text"
                                                inputMode="decimal"
                                                value={gpsFormLng}
                                                onChange={(e) => setGpsFormLng(e.target.value)}
                                                placeholder="e.g. 86.4735"
                                                className="w-28 rounded-md border border-slate-300 px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-nnm-blue"
                                              />
                                            </div>
                                            <button
                                              onClick={useCurrentLocationForGpsForm}
                                              disabled={locatingGps}
                                              title="Use this device's current location"
                                              className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60"
                                            >
                                              <LocateFixed className="h-3.5 w-3.5" />
                                              {locatingGps ? "Locating…" : "Use current location"}
                                            </button>
                                          </div>
                                          {gpsFormError && <p className="text-xs text-red-600">{gpsFormError}</p>}
                                          <div className="flex flex-wrap gap-2">
                                            <button
                                              onClick={() => submitGpsForm(s.segmentId!, l.lightId)}
                                              disabled={savingGpsLightId === l.lightId}
                                              className="rounded-md bg-nnm-blue px-3 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
                                            >
                                              {savingGpsLightId === l.lightId ? "Saving…" : "Save Location"}
                                            </button>
                                            {(l.latitude != null || l.longitude != null) && (
                                              <button
                                                onClick={() => clearGpsForm(s.segmentId!, l.lightId)}
                                                disabled={savingGpsLightId === l.lightId}
                                                className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60"
                                              >
                                                Clear
                                              </button>
                                            )}
                                            <button onClick={cancelGpsForm} className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100">
                                              Cancel
                                            </button>
                                          </div>
                                        </div>
                                      )}
                                      {l.faultHistory.length > 0 && (
                                        <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
                                          <p className="text-[10px] font-semibold uppercase text-slate-400">Repair history</p>
                                          {l.faultHistory.map((f) => (
                                            <p key={f.faultId} className="text-xs text-slate-600">
                                              Reported {new Date(f.reportedAt).toLocaleDateString("en-IN")}
                                              {f.reportedByName ? ` by ${f.reportedByName}` : f.reportedByType === "public" ? " (public report)" : ""}
                                              {f.status === "repaired" && f.repairedAt
                                                ? ` · Repaired ${new Date(f.repairedAt).toLocaleDateString("en-IN")}${f.repairedByName ? ` by ${f.repairedByName}` : ""}${f.functionalSince ? ` (functional since ${new Date(f.functionalSince).toLocaleDateString("en-IN")})` : ""}`
                                                : " · Still open"}
                                              {f.reporterNotes ? ` - "${f.reporterNotes}"` : ""}
                                              {f.repairNotes ? ` · Remarks: "${f.repairNotes}"` : ""}
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
