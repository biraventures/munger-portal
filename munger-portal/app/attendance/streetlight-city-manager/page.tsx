"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, UserCheck } from "lucide-react";
import { AttendanceHeader } from "@/components/attendance/attendance-header";
import { useAttendanceGuard } from "@/lib/use-attendance-guard";
import {
  fetchStreetlightCityManagerOptions,
  fetchStreetlightCityManagerAssignment,
  assignStreetlightCityManagerOnAttendance,
  type StreetlightCityManagerOption,
  type StreetlightCityManagerAssignment,
} from "@/lib/streetlight-api";

export default function StreetlightCityManagerPage() {
  const attendance = useAttendanceGuard();
  const [cityManagers, setCityManagers] = useState<StreetlightCityManagerOption[]>([]);
  const [assignment, setAssignment] = useState<StreetlightCityManagerAssignment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<number | "">("");

  useEffect(() => {
    if (!attendance) return;
    Promise.all([fetchStreetlightCityManagerOptions(), fetchStreetlightCityManagerAssignment()])
      .then(([managers, current]) => {
        setCityManagers(managers);
        setAssignment(current);
        setSelected(current.assigned_city_manager_id ?? "");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load City Managers."));
  }, [attendance]);

  async function handleAssign() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const updated = await assignStreetlightCityManagerOnAttendance(selected);
      setAssignment(updated);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this assignment.");
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

  const currentName = cityManagers.find((m) => m.id === assignment?.assigned_city_manager_id)?.displayName;

  return (
    <div className="min-h-screen bg-slate-50">
      <AttendanceHeader user={attendance} />

      <main className="mx-auto max-w-xl px-6 py-10">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <UserCheck className="h-6 w-6" />
          Streetlight City Manager
        </h1>
        <p className="mb-6 text-sm text-slate-500">Choose which City Manager follows up on streetlight faults and marks them repaired.</p>

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          {currentName && <p className="mb-4 text-sm text-slate-600">Currently assigned: <span className="font-semibold text-slate-900">{currentName}</span></p>}

          <select value={selected} onChange={(e) => setSelected(e.target.value ? Number(e.target.value) : "")} className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1">
            <option value="">Choose a City Manager…</option>
            {cityManagers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
              </option>
            ))}
          </select>

          <button
            onClick={handleAssign}
            disabled={saving || !selected}
            className="w-full rounded-md bg-nnm-blue px-4 py-2.5 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save Assignment"}
          </button>

          {success && (
            <p className="mt-3 flex items-center gap-1.5 text-sm text-green-700">
              <CheckCircle2 className="h-4 w-4" />
              Saved.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
