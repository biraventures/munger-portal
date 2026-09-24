"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, ShieldCheck, Trash2 } from "lucide-react";
import { AttendanceHeader } from "@/components/attendance/attendance-header";
import { useAttendanceGuard } from "@/lib/use-attendance-guard";
import { fetchDeactivatedAttendanceUsers, verifyAttendanceUserForDeletion, deleteAttendanceUser, type DeactivatedAttendanceUser } from "@/lib/attendance-api";

export default function DeactivatedStaffPage() {
  const attendance = useAttendanceGuard();
  const [users, setUsers] = useState<DeactivatedAttendanceUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [acting, setActing] = useState<number | null>(null);

  function load() {
    fetchDeactivatedAttendanceUsers()
      .then(setUsers)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load deactivated staff."));
  }

  useEffect(() => {
    if (!attendance) return;
    load();
  }, [attendance]);

  async function handleVerify(id: number) {
    setActing(id);
    setError(null);
    setSuccess(null);
    try {
      await verifyAttendanceUserForDeletion(id);
      setSuccess("Verified for deletion.");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify this staff account.");
    } finally {
      setActing(null);
    }
  }

  async function handleDelete(id: number, name: string) {
    if (!confirm(`Permanently delete "${name}"'s account? This can't be undone.`)) return;
    setActing(id);
    setError(null);
    setSuccess(null);
    try {
      await deleteAttendanceUser(id);
      setSuccess("Deleted.");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete this staff account.");
    } finally {
      setActing(null);
    }
  }

  if (!attendance) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  if (attendance.role !== "apswmo" && attendance.role !== "attendance_admin") {
    return (
      <div className="min-h-screen bg-slate-50">
        <AttendanceHeader user={attendance} />
        <main className="mx-auto max-w-2xl px-6 py-10">
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            This is restricted to the attendance admin.
          </div>
        </main>
      </div>
    );
  }

  const canVerify = attendance.role === "apswmo" || attendance.role === "attendance_admin";

  return (
    <div className="min-h-screen bg-slate-50">
      <AttendanceHeader user={attendance} />

      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">Deactivated Staff</h1>
        <p className="mb-6 text-sm text-slate-500">Deactivated field staff logins awaiting APSWMO field verification before deletion.</p>

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
        {success && (
          <div role="status" className="mb-5 flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {success}
          </div>
        )}

        {!users ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : users.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">Nothing deactivated right now.</div>
        ) : (
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {users.map((u) => (
              <div key={u.id} className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{u.display_name}</p>
                  <p className="text-xs text-slate-500">
                    {u.username} · {u.role}
                  </p>
                  {u.verified_for_deletion_by && <p className="mt-1 text-xs text-green-700">Field-verified by {u.verified_for_deletion_by}</p>}
                </div>
                <div className="shrink-0">
                  {!u.verified_for_deletion_at ? (
                    canVerify ? (
                      <button
                        onClick={() => handleVerify(u.id)}
                        disabled={acting === u.id}
                        className="inline-flex items-center gap-1.5 rounded-md bg-nnm-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                        {acting === u.id ? "Verifying…" : "Verify"}
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">Awaiting APSWMO verification</span>
                    )
                  ) : attendance.role === "attendance_admin" ? (
                    <button
                      onClick={() => handleDelete(u.id, u.display_name)}
                      disabled={acting === u.id}
                      className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {acting === u.id ? "Deleting…" : "Delete"}
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400">Verified - awaiting deletion</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
