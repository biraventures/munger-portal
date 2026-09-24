"use client";

import { useEffect, useState } from "react";
import { AlertCircle, BarChart3 } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { fetchEmployeeDatabaseProgress, type EmployeeDatabaseProgress } from "@/lib/admin-api";

export default function EmployeeDatabaseProgressPage() {
  const admin = useAdminGuard();
  const [progress, setProgress] = useState<EmployeeDatabaseProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!admin) return;
    fetchEmployeeDatabaseProgress()
      .then(setProgress)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load progress."));
  }, [admin]);

  if (!admin) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  if (admin.role !== "commissioner") {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <main className="mx-auto max-w-2xl px-6 py-10">
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            This is restricted to the Municipal Commissioner.
          </div>
        </main>
      </div>
    );
  }

  const percentVerified = progress && progress.total > 0 ? Math.round((progress.verified / progress.total) * 100) : 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />

      <main className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <BarChart3 className="h-6 w-6" />
          Employee Database Progress
        </h1>
        <p className="mb-6 text-sm text-slate-500">How the municipal employee database build-out is going.</p>

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {!progress ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="mb-5 grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-3xl font-semibold text-slate-900">{progress.total}</p>
                <p className="text-xs text-slate-500">Total entries</p>
              </div>
              <div>
                <p className="text-3xl font-semibold text-green-600">{progress.verified}</p>
                <p className="text-xs text-slate-500">Verified</p>
              </div>
              <div>
                <p className="text-3xl font-semibold text-amber-600">{progress.pending}</p>
                <p className="text-xs text-slate-500">Awaiting verification</p>
              </div>
            </div>

            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-green-500" style={{ width: `${percentVerified}%` }} />
            </div>
            <p className="mt-2 text-right text-xs text-slate-500">{percentVerified}% verified</p>
          </div>
        )}
      </main>
    </div>
  );
}
