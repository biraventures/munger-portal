"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, ShieldCheck, Trash2 } from "lucide-react";
import { AttendanceHeader } from "@/components/attendance/attendance-header";
import { useAttendanceGuard } from "@/lib/use-attendance-guard";
import { fetchDeactivatedAssets, verifyAssetForDeletion, deleteAsset, type DeactivatedAsset } from "@/lib/attendance-api";

const FLEET_EDIT_ROLES = ["attendance_admin", "junior_engineer", "assistant_engineer_mechanical", "maintenance_nodal_clerk"];

export default function DeactivatedAssetsPage() {
  const attendance = useAttendanceGuard();
  const [assets, setAssets] = useState<DeactivatedAsset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [acting, setActing] = useState<number | null>(null);

  function load() {
    fetchDeactivatedAssets()
      .then(setAssets)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load deactivated vehicles."));
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
      await verifyAssetForDeletion(id);
      setSuccess("Verified for deletion.");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify this vehicle.");
    } finally {
      setActing(null);
    }
  }

  async function handleDelete(id: number, label: string) {
    if (!confirm(`Permanently delete "${label}"? This can't be undone.`)) return;
    setActing(id);
    setError(null);
    setSuccess(null);
    try {
      await deleteAsset(id);
      setSuccess("Deleted.");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete this vehicle.");
    } finally {
      setActing(null);
    }
  }

  if (!attendance) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  if (!FLEET_EDIT_ROLES.includes(attendance.role)) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AttendanceHeader user={attendance} />
        <main className="mx-auto max-w-2xl px-6 py-10">
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            This is restricted to fleet management roles.
          </div>
        </main>
      </div>
    );
  }

  const canVerify = attendance.role === "junior_engineer" || attendance.role === "attendance_admin";

  return (
    <div className="min-h-screen bg-slate-50">
      <AttendanceHeader user={attendance} />

      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">Deactivated Vehicles</h1>
        <p className="mb-6 text-sm text-slate-500">Deactivated vehicles/tricycles/hand carts awaiting Junior Engineer field verification before deletion.</p>

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

        {!assets ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : assets.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">Nothing deactivated right now.</div>
        ) : (
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {assets.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{a.label}</p>
                  <p className="text-xs text-slate-500">
                    {a.asset_type} {a.vehicle_number ? `· ${a.vehicle_number}` : ""}
                  </p>
                  {a.verified_for_deletion_by && <p className="mt-1 text-xs text-green-700">Field-verified by {a.verified_for_deletion_by}</p>}
                </div>
                <div className="shrink-0">
                  {!a.verified_for_deletion_at ? (
                    canVerify ? (
                      <button
                        onClick={() => handleVerify(a.id)}
                        disabled={acting === a.id}
                        className="inline-flex items-center gap-1.5 rounded-md bg-nnm-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                        {acting === a.id ? "Verifying…" : "Verify"}
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">Awaiting JE verification</span>
                    )
                  ) : (
                    <button
                      onClick={() => handleDelete(a.id, a.label)}
                      disabled={acting === a.id}
                      className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {acting === a.id ? "Deleting…" : "Delete"}
                    </button>
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
