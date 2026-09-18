"use client";

import { useEffect, useState } from "react";
import { AlertCircle, UserCheck } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import {
  fetchTaxCollectorsWithAssignment,
  fetchCityManagers,
  assignTaxCollectorCityManager,
  type TaxCollectorWithAssignment,
  type CityManagerOption,
} from "@/lib/admin-api";

export default function TaxCollectorAssignmentsPage() {
  const admin = useAdminGuard();
  const [collectors, setCollectors] = useState<TaxCollectorWithAssignment[] | null>(null);
  const [cityManagers, setCityManagers] = useState<CityManagerOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  function load() {
    fetchTaxCollectorsWithAssignment()
      .then(setCollectors)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load Tax Collectors."));
  }

  useEffect(() => {
    if (!admin) return;
    load();
    fetchCityManagers()
      .then(setCityManagers)
      .catch(() => setCityManagers([]));
  }, [admin]);

  async function handleAssign(username: string, cityManagerUsername: string) {
    if (!cityManagerUsername) return;
    setSaving(username);
    setError(null);
    try {
      await assignTaxCollectorCityManager(username, cityManagerUsername);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this assignment.");
    } finally {
      setSaving(null);
    }
  }

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

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />

      <main className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <UserCheck className="h-6 w-6" />
          Tax Collector Assignments
        </h1>
        <p className="mb-6 text-sm text-slate-500">
          Choose which City Manager reviews each Tax Collector&apos;s cancellation requests (after Tax Daroga approval).
        </p>

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {!collectors ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : collectors.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">No Tax Collector accounts yet.</div>
        ) : (
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {collectors.map((c) => (
              <div key={c.username} className="flex items-center justify-between p-4">
                <p className="text-sm font-semibold text-slate-800">{c.displayName}</p>
                <select
                  value={c.assignedCityManagerUsername ?? ""}
                  onChange={(e) => handleAssign(c.username, e.target.value)}
                  disabled={saving === c.username}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1 disabled:opacity-60"
                >
                  <option value="">Not assigned</option>
                  {cityManagers.map((m) => (
                    <option key={m.username} value={m.username}>
                      {m.displayName}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
