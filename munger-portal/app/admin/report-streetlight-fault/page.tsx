"use client";

import { useEffect, useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { fetchStreetSegments, fetchLightsForSegment, reportStreetlightFault, type StreetSegment, type StreetlightLight } from "@/lib/admin-api";
import type { AdminRole } from "@/lib/admin-auth";

const REPORTER_ROLES: AdminRole[] = ["tax_daroga", "tax_surveyor", "tax_collector", "stall_prabhari", "je_mechanical", "ae_mechanical"];
const inputClass = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";

export default function ReportStreetlightFaultPage() {
  const admin = useAdminGuard();
  const [segments, setSegments] = useState<StreetSegment[] | null>(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState<number | "">("");
  const [lights, setLights] = useState<StreetlightLight[]>([]);
  const [selectedLightId, setSelectedLightId] = useState<number | "">("");
  const [notes, setNotes] = useState("");
  const [nonFunctionalSince, setNonFunctionalSince] = useState("");
  const [localSourceName, setLocalSourceName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!admin) return;
    fetchStreetSegments()
      .then(setSegments)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load street segments."));
  }, [admin]);

  useEffect(() => {
    if (!selectedSegmentId) {
      setLights([]);
      setSelectedLightId("");
      return;
    }
    fetchLightsForSegment(selectedSegmentId)
      .then((l) => {
        setLights(l);
        setSelectedLightId("");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load lights for this segment."));
  }, [selectedSegmentId]);

  async function handleSubmit() {
    if (!selectedLightId) {
      setError("Choose which light is damaged.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await reportStreetlightFault(selectedLightId, notes.trim() || null, nonFunctionalSince || null, localSourceName.trim() || null);
      setSuccess(true);
      setSelectedSegmentId("");
      setSelectedLightId("");
      setNotes("");
      setNonFunctionalSince("");
      setLocalSourceName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not report this fault.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!admin) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  if (!REPORTER_ROLES.includes(admin.role)) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <main className="mx-auto max-w-2xl px-6 py-10">
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            This is restricted to Tax Daroga, Tax Surveyor, Tax Collector, Stall Prabhari, JE-Mechanical and AE-Mechanical.
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />

      <main className="mx-auto max-w-xl px-6 py-10">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <AlertTriangle className="h-6 w-6" />
          Report Streetlight Fault
        </h1>
        <p className="mb-6 text-sm text-slate-500">Pick the street and the specific light that&apos;s damaged.</p>

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
          <label className="mb-1 block text-xs font-medium text-slate-600">Street</label>
          <select
            value={selectedSegmentId}
            onChange={(e) => setSelectedSegmentId(e.target.value ? Number(e.target.value) : "")}
            className={`${inputClass} mb-4`}
          >
            <option value="">{segments ? "Choose a street…" : "Loading…"}</option>
            {segments?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.end_point ? `${s.start_point} - ${s.end_point}` : s.start_point} ({s.light_count} lights)
              </option>
            ))}
          </select>

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
