"use client";

import { useEffect, useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Search, Trash2 } from "lucide-react";
import { AttendanceHeader } from "@/components/attendance/attendance-header";
import { useAttendanceGuard } from "@/lib/use-attendance-guard";
import {
  cleanupOldAttendanceData,
  clearAllAttendanceData,
  searchAttendanceRecords,
  deleteAttendanceRecord,
  fetchAttendanceWards,
  DATA_CLEANUP_CONFIRMATION_PHRASE,
  CLEAR_ALL_CONFIRMATION_PHRASE,
  type DataCleanupResult,
  type AttendanceWard,
  type AttendanceRecordCategory,
  type AttendanceRecord,
} from "@/lib/attendance-api";

const inputClass = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-1";

function ResultSummary({ result }: { result: DataCleanupResult }) {
  return (
    <div role="status" className="rounded-xl border border-green-200 bg-green-50 p-6">
      <div className="mb-2 flex items-center gap-2 text-green-800">
        <CheckCircle2 className="h-5 w-5" />
        <span className="font-semibold">Done.</span>
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
  );
}

function ByDateTab() {
  const [cutoffDate, setCutoffDate] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DataCleanupResult | null>(null);

  async function handleCleanup() {
    setDeleting(true);
    setError(null);
    try {
      setResult(await cleanupOldAttendanceData(cutoffDate, confirmText.trim()));
      setConfirmText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not clean up old data.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      {error && (
        <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      {result ? (
        <ResultSummary result={result} />
      ) : (
        <div className="rounded-xl border border-red-200 bg-white p-6">
          <div className="mb-4 flex items-start gap-2.5 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            This permanently deletes attendance records and photo files older than the date below, across every ward. There is no undo.
          </div>

          <label className="mb-1 block text-xs font-medium text-slate-600">Delete everything older than</label>
          <input type="date" value={cutoffDate} onChange={(e) => setCutoffDate(e.target.value)} className={`${inputClass} mb-4`} max={new Date().toISOString().slice(0, 10)} />

          <label className="mb-1 block text-xs font-medium text-slate-600">
            Type <span className="font-mono font-semibold">{DATA_CLEANUP_CONFIRMATION_PHRASE}</span> to confirm
          </label>
          <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className={`${inputClass} mb-4`} placeholder={DATA_CLEANUP_CONFIRMATION_PHRASE} />

          <button
            onClick={handleCleanup}
            disabled={deleting || !cutoffDate || confirmText.trim() !== DATA_CLEANUP_CONFIRMATION_PHRASE}
            className="w-full rounded-md bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40"
          >
            {deleting ? "Deleting…" : "Delete Old Data"}
          </button>
        </div>
      )}
    </div>
  );
}

function ClearAllTab() {
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DataCleanupResult | null>(null);

  async function handleClearAll() {
    setDeleting(true);
    setError(null);
    try {
      setResult(await clearAllAttendanceData(confirmText.trim()));
      setConfirmText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not clear all attendance data.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      {error && (
        <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      {result ? (
        <ResultSummary result={result} />
      ) : (
        <div className="rounded-xl border border-red-300 bg-white p-6">
          <div className="mb-4 flex items-start gap-2.5 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            This permanently deletes <b>every</b> attendance record and photo, for every ward and every date - for example if a bulk upload was
            entered entirely by mistake. There is no undo.
          </div>

          <label className="mb-1 block text-xs font-medium text-slate-600">
            Type <span className="font-mono font-semibold">{CLEAR_ALL_CONFIRMATION_PHRASE}</span> to confirm
          </label>
          <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className={`${inputClass} mb-4`} placeholder={CLEAR_ALL_CONFIRMATION_PHRASE} />

          <button
            onClick={handleClearAll}
            disabled={deleting || confirmText.trim() !== CLEAR_ALL_CONFIRMATION_PHRASE}
            className="w-full rounded-md bg-red-700 px-4 py-3 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-40"
          >
            {deleting ? "Clearing…" : "Clear All Attendance Data"}
          </button>
        </div>
      )}
    </div>
  );
}

function recordName(r: AttendanceRecord): string {
  return r.staff_name ?? r.driver_name ?? r.assistant_name ?? "-";
}

function IndividualRecordTab() {
  const [wards, setWards] = useState<AttendanceWard[]>([]);
  const [category, setCategory] = useState<AttendanceRecordCategory>("staff");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [wardId, setWardId] = useState("");
  const [searching, setSearching] = useState(false);
  const [records, setRecords] = useState<AttendanceRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    fetchAttendanceWards().then(setWards).catch(() => setWards([]));
  }, []);

  async function handleSearch() {
    setSearching(true);
    setError(null);
    setRecords(null);
    try {
      const results = await searchAttendanceRecords(category, { fromDate: fromDate || undefined, toDate: toDate || undefined, wardId: wardId ? Number(wardId) : undefined });
      setRecords(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not search attendance records.");
    } finally {
      setSearching(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this attendance record? This can't be undone.")) return;
    setDeletingId(id);
    setError(null);
    try {
      await deleteAttendanceRecord(category, id);
      setRecords((rs) => rs?.filter((r) => r.id !== id) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete this record.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <p className="mb-4 text-sm text-slate-500">Find a specific wrongly-entered record and delete just that one.</p>

      {error && (
        <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-4">
        <select value={category} onChange={(e) => setCategory(e.target.value as AttendanceRecordCategory)} className={inputClass}>
          <option value="staff">Field Staff</option>
          <option value="driver">Driver</option>
          <option value="assistant">Driver Assistant</option>
        </select>
        <select value={wardId} onChange={(e) => setWardId(e.target.value)} className={inputClass}>
          <option value="">All wards</option>
          {wards.map((w) => (
            <option key={w.id} value={w.id}>
              Ward {w.wardName}
            </option>
          ))}
        </select>
        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inputClass} />
        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className={inputClass} />
        <button
          onClick={handleSearch}
          disabled={searching}
          className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-md bg-nnm-blue px-4 py-2 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60 sm:col-span-4"
        >
          <Search className="h-4 w-4" />
          {searching ? "Searching…" : "Search"}
        </button>
      </div>

      {records && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {records.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-400">No records match.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Marked By</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2.5">{new Date(r.date).toLocaleDateString("en-IN")}</td>
                    <td className="px-4 py-2.5">{recordName(r)}</td>
                    <td className="px-4 py-2.5">{r.status.replace(/_/g, " ")}</td>
                    <td className="px-4 py-2.5">{r.marked_by}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => handleDelete(r.id)}
                        disabled={deletingId === r.id}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:underline disabled:opacity-60"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {deletingId === r.id ? "Deleting…" : "Delete"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export default function AttendanceDataCleanupPage() {
  const user = useAttendanceGuard(["attendance_admin"]);
  const [tab, setTab] = useState<"individual" | "by-date" | "clear-all">("individual");

  if (!user) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AttendanceHeader user={user} />

      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold text-red-700">
          <Trash2 className="h-6 w-6" />
          Fix Attendance Data
        </h1>
        <p className="mb-6 text-sm text-slate-500">Correct data entered by mistake - delete one record, records before a date, or everything.</p>

        <div className="mb-6 flex gap-2">
          {(
            [
              ["individual", "Delete One Record"],
              ["by-date", "Delete Before a Date"],
              ["clear-all", "Clear Everything"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold ${tab === key ? "bg-nnm-blue text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-100"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "individual" && <IndividualRecordTab />}
        {tab === "by-date" && <ByDateTab />}
        {tab === "clear-all" && <ClearAllTab />}
      </main>
    </div>
  );
}
