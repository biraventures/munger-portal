"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, History } from "lucide-react";
import { AttendanceHeader } from "@/components/attendance/attendance-header";
import { useAttendanceGuard } from "@/lib/use-attendance-guard";
import {
  fetchStreetSegmentsList,
  fetchLightsForStreetSegment,
  reportFault,
  fetchLightRepairHistorySummary,
  type StreetSegment,
  type StreetlightLightOption,
  type LightRepairHistorySummary,
} from "@/lib/streetlight-api";
import { getCurrentGpsPosition } from "@/lib/geolocation";

const inputClass = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";

export default function ReportStreetlightFaultAttendancePage() {
  const attendance = useAttendanceGuard();
  const [segments, setSegments] = useState<StreetSegment[] | null>(null);
  const [selectedWard, setSelectedWard] = useState("");
  const [selectedSegmentId, setSelectedSegmentId] = useState<number | "">("");
  const [lights, setLights] = useState<StreetlightLightOption[]>([]);
  const [selectedLightId, setSelectedLightId] = useState<number | "">("");
  const [notes, setNotes] = useState("");
  const [nonFunctionalSince, setNonFunctionalSince] = useState("");
  const [localSourceName, setLocalSourceName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [repairHistory, setRepairHistory] = useState<LightRepairHistorySummary | null>(null);

  useEffect(() => {
    if (!attendance) return;
    fetchStreetSegmentsList()
      .then(setSegments)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load street segments."));
  }, [attendance]);

  const wardNames = useMemo(() => {
    if (!segments) return [];
    return Array.from(new Set(segments.map((s) => s.ward_name))).sort();
  }, [segments]);

  const segmentsInWard = useMemo(() => {
    if (!segments || !selectedWard) return [];
    return segments.filter((s) => s.ward_name === selectedWard);
  }, [segments, selectedWard]);

  useEffect(() => {
    if (!selectedSegmentId) {
      setLights([]);
      setSelectedLightId("");
      return;
    }
    fetchLightsForStreetSegment(selectedSegmentId)
      .then((l) => {
        setLights(l);
        setSelectedLightId("");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load lights for this segment."));
  }, [selectedSegmentId]);

  useEffect(() => {
    if (!attendance || attendance.role !== "municipal_commissioner" || !selectedLightId) {
      setRepairHistory(null);
      return;
    }
    fetchLightRepairHistorySummary(selectedLightId)
      .then(setRepairHistory)
      .catch(() => setRepairHistory(null));
  }, [attendance, selectedLightId]);

  function handleWardChange(ward: string) {
    setSelectedWard(ward);
    setSelectedSegmentId("");
  }

  async function handleSubmit() {
    if (!selectedLightId) {
      setError("Choose which light is damaged.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const gps = await getCurrentGpsPosition();
      await reportFault(selectedLightId, notes.trim() || null, nonFunctionalSince || null, localSourceName.trim() || null, gps?.lat ?? null, gps?.lng ?? null);
      setSuccess(true);
      setSelectedWard("");
      setSelectedSegmentId("");
      setSelectedLightId("");
      setNotes("");
      setNonFunctionalSince("");
      setLocalSourceName("");
      setRepairHistory(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not report this fault.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!attendance) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AttendanceHeader user={attendance} />

      <main className="mx-auto max-w-xl px-6 py-10">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <AlertTriangle className="h-6 w-6" />
          Report Streetlight Fault
        </h1>
        <p className="mb-6 text-sm text-slate-500">Pick the ward, then the street, then the specific light that&apos;s damaged.</p>

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
        {success && (
          <div role="status" className="mb-5 flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Fault reported. It will be followed up by the assigned City Manager.
          </div>
        )}

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <label className="mb-1 block text-xs font-medium text-slate-600">Ward</label>
          <select value={selectedWard} onChange={(e) => handleWardChange(e.target.value)} className={`${inputClass} mb-4`}>
            <option value="">{segments ? "Choose a ward…" : "Loading…"}</option>
            {wardNames.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>

          {selectedWard && (
            <>
              <label className="mb-1 block text-xs font-medium text-slate-600">Street</label>
              <select
                value={selectedSegmentId}
                onChange={(e) => setSelectedSegmentId(e.target.value ? Number(e.target.value) : "")}
                className={`${inputClass} mb-4`}
              >
                <option value="">Choose a street…</option>
                {segmentsInWard.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.end_point ? `${s.start_point} - ${s.end_point}` : s.start_point} ({s.light_count} lights)
                  </option>
                ))}
              </select>
            </>
          )}

          {selectedSegmentId !== "" && (
            <>
              <label className="mb-1 block text-xs font-medium text-slate-600">Which light</label>
              <select value={selectedLightId} onChange={(e) => setSelectedLightId(e.target.value ? Number(e.target.value) : "")} className={`${inputClass} mb-4`}>
                <option value="">{lights.length === 0 ? "Loading…" : "Choose a light…"}</option>
                {lights.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.serial_number}
                  </option>
                ))}
              </select>
            </>
          )}

          {repairHistory && (
            <div className="mb-4 flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              <History className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span>
                {repairHistory.hasPriorRepairs
                  ? `Repaired ${repairHistory.repairedCount} time${repairHistory.repairedCount === 1 ? "" : "s"} before.`
                  : "No prior repair history for this light."}
                {repairHistory.openFaultCount > 0 && ` ${repairHistory.openFaultCount} open fault${repairHistory.openFaultCount === 1 ? "" : "s"} currently.`}
              </span>
            </div>
          )}

          <label className="mb-1 block text-xs font-medium text-slate-600">Notes (optional)</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={`${inputClass} mb-4`} placeholder="What's wrong with it?" />

          <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Non-functional since (optional)</label>
              <input type="date" value={nonFunctionalSince} onChange={(e) => setNonFunctionalSince(e.target.value)} className={inputClass} max={new Date().toISOString().slice(0, 10)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Local source confirming date (optional)</label>
              <input value={localSourceName} onChange={(e) => setLocalSourceName(e.target.value)} placeholder="Name of local resident/shopkeeper etc." className={inputClass} />
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={submitting || !selectedLightId}
            className="w-full rounded-md bg-nnm-blue px-4 py-3 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
          >
            {submitting ? "Reporting…" : "Report Fault"}
          </button>
        </div>
      </main>
    </div>
  );
}
