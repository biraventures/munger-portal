"use client";

import { useEffect, useState } from "react";
import { AlertCircle, UserCheck } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import {
  fetchTaxCollectorsWithAssignment,
  fetchCityManagers,
  assignTaxCollectorCityManager,
  setTaxCollectorWards,
  type TaxCollectorWithAssignment,
  type CityManagerOption,
} from "@/lib/admin-api";

export default function TaxCollectorAssignmentsPage() {
  const admin = useAdminGuard();
  const [collectors, setCollectors] = useState<TaxCollectorWithAssignment[] | null>(null);
  const [cityManagers, setCityManagers] = useState<CityManagerOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [wardDrafts, setWardDrafts] = useState<Record<string, string>>({});
  const [savingWards, setSavingWards] = useState<string | null>(null);

  function load() {
    fetchTaxCollectorsWithAssignment()
      .then((list) => {
        setCollectors(list);
        setWardDrafts(Object.fromEntries(list.map((c) => [c.username, c.wards.join(", ")])));
      })
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

  async function handleSaveWards(username: string) {
    const wards = (wardDrafts[username] ?? "")
      .split(",")
      .map((w) => w.trim())
      .filter(Boolean);
    setSavingWards(username);
    setError(null);
    try {
      await setTaxCollectorWards(username, wards);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save these wards.");
    } finally {
      setSavingWards(null);
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

      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <UserCheck className="h-6 w-6" />
          Tax Collector Assignments
        </h1>
        <p className="mb-6 text-sm text-slate-500">
          Choose which City Manager reviews each Tax Collector&apos;s cancellation requests, and which wards they collect in.
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
          <div className="space-y-3">
            {collectors.map((c) => (
              <div key={c.username} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="mb-3 flex items-center justify-between">
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
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="mb-1 block text-xs font-medium text-slate-500">Wards (comma-separated, e.g. 5, 6, 7)</label>
                    <input
                      value={wardDrafts[c.username] ?? ""}
                      onChange={(e) => setWardDrafts((d) => ({ ...d, [c.username]: e.target.value }))}
                      className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1"
                      placeholder="No wards tagged"
                    />
                  </div>
                  <button
                    onClick={() => handleSaveWards(c.username)}
                    disabled={savingWards === c.username}
                    className="rounded-md bg-nnm-blue px-4 py-1.5 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
                  >
                    {savingWards === c.username ? "Saving…" : "Save Wards"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
