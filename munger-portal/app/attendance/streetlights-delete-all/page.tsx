"use client";

import { useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Trash2 } from "lucide-react";
import { AttendanceHeader } from "@/components/attendance/attendance-header";
import { useAttendanceGuard } from "@/lib/use-attendance-guard";
import { deleteAllStreetlightData, DELETE_ALL_STREETLIGHT_DATA_CONFIRMATION_PHRASE, type DeleteAllStreetlightDataResult } from "@/lib/streetlight-api";

export default function StreetlightsDeleteAllPage() {
  const attendance = useAttendanceGuard();
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DeleteAllStreetlightDataResult | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await deleteAllStreetlightData(confirmText.trim());
      setResult(res);
      setConfirmText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete streetlight data.");
    } finally {
      setDeleting(false);
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

      <main className="mx-auto max-w-xl px-6 py-10">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold text-red-700">
          <Trash2 className="h-6 w-6" />
          Delete All Streetlight Data
        </h1>
        <p className="mb-6 text-sm text-slate-500">Permanently removes every street segment, every light, and every fault record. This cannot be undone.</p>

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {result ? (
          <div role="status" className="rounded-xl border border-green-200 bg-green-50 p-6">
            <div className="mb-2 flex items-center gap-2 text-green-800">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-semibold">Deleted.</span>
            </div>
            <p className="text-sm text-green-700">
              {result.segmentsDeleted} street segment{result.segmentsDeleted === 1 ? "" : "s"}, {result.lightsDeleted} light{result.lightsDeleted === 1 ? "" : "s"}, and{" "}
              {result.faultsDeleted} fault{result.faultsDeleted === 1 ? "" : "s"} removed.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-red-200 bg-white p-6">
            <div className="mb-4 flex items-start gap-2.5 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              This will delete ALL streetlight and street data across every ward. Installation agencies and the City Manager assignment are kept. There is no undo.
            </div>

            <label className="mb-1 block text-xs font-medium text-slate-600">
              Type <span className="font-mono font-semibold">{DELETE_ALL_STREETLIGHT_DATA_CONFIRMATION_PHRASE}</span> to confirm
            </label>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-1"
              placeholder={DELETE_ALL_STREETLIGHT_DATA_CONFIRMATION_PHRASE}
            />

            <button
              onClick={handleDelete}
              disabled={deleting || confirmText.trim() !== DELETE_ALL_STREETLIGHT_DATA_CONFIRMATION_PHRASE}
              className="w-full rounded-md bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40"
            >
              {deleting ? "Deleting…" : "Delete Everything"}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
