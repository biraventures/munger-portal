"use client";

import { useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Trash2 } from "lucide-react";
import { AttendanceHeader } from "@/components/attendance/attendance-header";
import { useAttendanceGuard } from "@/lib/use-attendance-guard";
import { cleanupOldAttendanceData, DATA_CLEANUP_CONFIRMATION_PHRASE, type DataCleanupResult } from "@/lib/attendance-api";

export default function AttendanceDataCleanupPage() {
  const user = useAttendanceGuard(["attendance_admin"]);
  const [cutoffDate, setCutoffDate] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DataCleanupResult | null>(null);

  async function handleCleanup() {
    setDeleting(true);
    setError(null);
    try {
      const res = await cleanupOldAttendanceData(cutoffDate, confirmText.trim());
      setResult(res);
      setConfirmText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not clean up old data.");
    } finally {
      setDeleting(false);
    }
  }

  if (!user) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AttendanceHeader user={user} />

      <main className="mx-auto max-w-xl px-6 py-10">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold text-red-700">
          <Trash2 className="h-6 w-6" />
          Clean Up Old Attendance Data
        </h1>
        <p className="mb-6 text-sm text-slate-500">
          Removes staff, driver, and driver assistant attendance records, and daily group photos (files included), older than a date you choose - to free up storage.
        </p>

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
              <span className="font-semibold">Cleaned up.</span>
            </div>
            <ul className="space-y-1 text-sm text-green-700">
              <li>{result.staffAttendanceDeleted} field staff attendance record{result.staffAttendanceDeleted === 1 ? "" : "s"} removed</li>
              <li>{result.driverAttendanceDeleted} driver attendance record{result.driverAttendanceDeleted === 1 ? "" : "s"} removed</li>
              <li>{result.assistantAttendanceDeleted} driver assistant attendance record{result.assistantAttendanceDeleted === 1 ? "" : "s"} removed</li>
              <li>
                {result.photosDeleted} daily group photo record{result.photosDeleted === 1 ? "" : "s"} removed ({result.photoFilesRemoved} file{result.photoFilesRemoved === 1 ? "" : "s"} deleted from storage)
              </li>
            </ul>
          </div>
        ) : (
          <div className="rounded-xl border border-red-200 bg-white p-6">
            <div className="mb-4 flex items-start gap-2.5 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              This permanently deletes attendance records and photo files older than the date below, across every ward. There is no undo.
            </div>

            <label className="mb-1 block text-xs font-medium text-slate-600">Delete everything older than</label>
            <input
              type="date"
              value={cutoffDate}
              onChange={(e) => setCutoffDate(e.target.value)}
              className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-1"
              max={new Date().toISOString().slice(0, 10)}
            />

            <label className="mb-1 block text-xs font-medium text-slate-600">
              Type <span className="font-mono font-semibold">{DATA_CLEANUP_CONFIRMATION_PHRASE}</span> to confirm
            </label>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-1"
              placeholder={DATA_CLEANUP_CONFIRMATION_PHRASE}
            />

            <button
              onClick={handleCleanup}
              disabled={deleting || !cutoffDate || confirmText.trim() !== DATA_CLEANUP_CONFIRMATION_PHRASE}
              className="w-full rounded-md bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40"
            >
              {deleting ? "Deleting…" : "Delete Old Data"}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
