"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, MapPin, Route } from "lucide-react";
import { AttendanceHeader } from "@/components/attendance/attendance-header";
import { useAttendanceGuard } from "@/lib/use-attendance-guard";
import { fetchStreetSegmentsList, setStreetSegmentGps, type StreetSegment } from "@/lib/streetlight-api";

const inputClass = "w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";

export default function StreetSegmentsPage() {
  const attendance = useAttendanceGuard();
  const [segments, setSegments] = useState<StreetSegment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [startLat, setStartLat] = useState("");
  const [startLng, setStartLng] = useState("");
  const [endLat, setEndLat] = useState("");
  const [endLng, setEndLng] = useState("");
  const [saving, setSaving] = useState(false);
  const [successId, setSuccessId] = useState<number | null>(null);

  function load() {
    fetchStreetSegmentsList()
      .then(setSegments)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load street segments."));
  }

  useEffect(() => {
    if (!attendance) return;
    load();
  }, [attendance]);

  function openEdit(s: StreetSegment) {
    setEditing(s.id);
    setStartLat(s.start_gps_lat ?? "");
    setStartLng(s.start_gps_lng ?? "");
    setEndLat(s.end_gps_lat ?? "");
    setEndLng(s.end_gps_lng ?? "");
    setSuccessId(null);
    setError(null);
  }

  async function handleSaveGps(id: number) {
    setSaving(true);
    setError(null);
    try {
      await setStreetSegmentGps(id, {
        startGpsLat: startLat ? Number(startLat) : null,
        startGpsLng: startLng ? Number(startLng) : null,
        endGpsLat: endLat ? Number(endLat) : null,
        endGpsLng: endLng ? Number(endLng) : null,
      });
      setSuccessId(id);
      setEditing(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save GPS for this segment.");
    } finally {
      setSaving(false);
    }
  }

  if (!attendance) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  if (attendance.role !== "municipal_commissioner" && attendance.role !== "attendance_admin") {
    return (
      <div className="min-h-screen bg-slate-50">
        <AttendanceHeader user={attendance} />
        <main className="mx-auto max-w-2xl px-6 py-10">
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            This is restricted to the Municipal Commissioner.
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AttendanceHeader user={attendance} />

      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <Route className="h-6 w-6" />
          Street Segments
        </h1>
        <p className="mb-6 text-sm text-slate-500">Add or update GPS for a segment&apos;s start and end points.</p>

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {!segments ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : segments.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">No street segments uploaded yet.</div>
        ) : (
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {segments.map((s) => (
              <div key={s.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      {s.end_point ? `${s.start_point} - ${s.end_point}` : s.start_point}
                    </p>
                    <p className="text-xs text-slate-500">
                      {s.light_count} light{s.light_count === 1 ? "" : "s"}
                      {s.intermediate_point ? ` · via ${s.intermediate_point}` : ""}
                      {s.start_gps_lat && s.end_gps_lat ? " · GPS set" : s.start_gps_lat || s.end_gps_lat ? " · GPS partially set" : " · No GPS yet"}
                    </p>
                  </div>
                  {editing !== s.id && (
                    <button
                      onClick={() => openEdit(s)}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <MapPin className="h-3.5 w-3.5" />
                      {s.start_gps_lat ? "Edit GPS" : "Add GPS"}
                    </button>
                  )}
                </div>

                {successId === s.id && editing !== s.id && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-green-700">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Saved.
                  </p>
                )}

                {editing === s.id && (
                  <div className="mt-3 grid grid-cols-1 gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Start point GPS</label>
                      <div className="flex gap-2">
                        <input placeholder="Lat" value={startLat} onChange={(e) => setStartLat(e.target.value)} className={inputClass} />
                        <input placeholder="Lng" value={startLng} onChange={(e) => setStartLng(e.target.value)} className={inputClass} />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">End point GPS</label>
                      <div className="flex gap-2">
                        <input placeholder="Lat" value={endLat} onChange={(e) => setEndLat(e.target.value)} className={inputClass} />
                        <input placeholder="Lng" value={endLng} onChange={(e) => setEndLng(e.target.value)} className={inputClass} />
                      </div>
                    </div>
                    <div className="flex gap-2 sm:col-span-2">
                      <button
                        onClick={() => handleSaveGps(s.id)}
                        disabled={saving}
                        className="rounded-md bg-nnm-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
                      >
                        {saving ? "Saving…" : "Save"}
                      </button>
                      <button onClick={() => setEditing(null)} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
