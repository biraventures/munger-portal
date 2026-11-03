"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Map as MapIcon } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { fetchTaxSurveyors, setSurveyorWards, type TaxSurveyorOption } from "@/lib/admin-api";

/** Municipal Commissioner: which wards each Tax Surveyor covers. Field work in a ward goes to its surveyor automatically. */
export default function SurveyorWardsPage() {
  const admin = useAdminGuard();
  const [list, setList] = useState<TaxSurveyorOption[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function load() {
    const l = await fetchTaxSurveyors();
    setList(l);
    setDrafts(Object.fromEntries(l.map((s) => [s.username, (s.wards ?? []).join(", ")])));
  }

  useEffect(() => {
    if (admin?.role === "commissioner") load().catch((e) => setError(e instanceof Error ? e.message : "Could not load the surveyors."));
  }, [admin]);

  if (!admin) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  if (admin.role !== "commissioner") {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <main className="mx-auto max-w-2xl px-6 py-10">
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" /> Only the Municipal Commissioner assigns wards to Tax Surveyors.
          </div>
        </main>
      </div>
    );
  }

  async function save(s: TaxSurveyorOption) {
    const wards = (drafts[s.username] ?? "")
      .split(/[,\s]+/)
      .map((w) => w.trim())
      .filter(Boolean);
    setSaving(s.username);
    setError(null);
    setDone(null);
    try {
      const r = await setSurveyorWards(s.username, wards);
      const parts = [`${s.displayName}: ${r.wards.length ? `Ward ${r.wards.join(", ")}` : "no wards"} saved.`];
      if (r.movedFrom.length) parts.push(`Moved from: ${r.movedFrom.map((m) => `Ward ${m.ward} (${m.from})`).join(", ")}.`);
      if (r.autoAssigned) parts.push(`${r.autoAssigned} waiting remeasurement request(s) in these wards given to ${s.displayName}.`);
      setDone(parts.join(" "));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(null);
    }
  }

  const covered = new Set((list ?? []).flatMap((s) => s.wards ?? []));

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <MapIcon className="h-6 w-6" /> Tax Surveyor Wards
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Give each ward to one Tax Surveyor. New holding requests, mutations and remeasurement requests from a ward then go to that surveyor
          automatically. The Tax Daroga can still move a request to another surveyor. A ward given to a second surveyor moves to them.
        </p>

        {error && (
          <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        {done && (
          <p role="status" className="mt-4 flex items-start gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {done}
          </p>
        )}

        {list === null ? (
          <p className="mt-6 flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </p>
        ) : list.length === 0 ? (
          <p className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            No Tax Surveyor login exists yet. Create one on the server with <code>npm run create-admin</code> (role <code>tax_surveyor</code>).
          </p>
        ) : (
          <>
            <p className="mt-4 text-xs text-slate-500">{covered.size} ward(s) covered.</p>
            <div className="mt-2 space-y-3">
              {list.map((s) => (
                <div key={s.username} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold text-slate-900">{s.displayName}</span>
                    <span className="font-mono text-xs text-slate-500">{s.username}</span>
                  </div>
                  <label className="mt-2 block text-xs font-medium text-slate-600" htmlFor={`wards-${s.username}`}>
                    Wards (comma-separated, e.g. 5, 6, 7)
                  </label>
                  <div className="mt-1 flex flex-col gap-2 sm:flex-row">
                    <input
                      id={`wards-${s.username}`}
                      value={drafts[s.username] ?? ""}
                      onChange={(e) => setDrafts((d) => ({ ...d, [s.username]: e.target.value }))}
                      placeholder="No wards"
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1"
                    />
                    <button
                      onClick={() => save(s)}
                      disabled={saving !== null}
                      className="rounded-md bg-nnm-blue px-4 py-2 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
                    >
                      {saving === s.username ? "Saving…" : "Save wards"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
