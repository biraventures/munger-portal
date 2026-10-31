"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Loader2, UserCheck } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import {
  assignSurveyorToWork,
  fetchSurveyorWork,
  fetchTaxSurveyors,
  type SurveyorWorkItem,
  type SurveyorWorkType,
  type TaxSurveyorOption,
} from "@/lib/admin-api";

const VIEW_ROLES = ["tax_daroga", "city_manager", "deputy_commissioner", "commissioner"];
const TYPE_LABEL: Record<SurveyorWorkType, string> = { new_holding: "New holding", mutation: "Mutation", remeasurement: "Remeasurement" };
const TYPE_TONE: Record<SurveyorWorkType, string> = {
  new_holding: "bg-blue-100 text-blue-800",
  mutation: "bg-purple-100 text-purple-800",
  remeasurement: "bg-amber-100 text-amber-800",
};
const pageOf = (w: SurveyorWorkItem) =>
  w.type === "new_holding" ? "/admin/new-holding-requests" : w.type === "mutation" ? `/admin/change-requests/${w.id}` : `/admin/property-discrepancy-requests/${w.id}`;
const since = (v: string) => {
  const days = Math.floor((Date.now() - new Date(v).getTime()) / 86400000);
  return days <= 0 ? "today" : days === 1 ? "1 day" : `${days} days`;
};

/** Tax Daroga: every new holding request, mutation and remeasurement request needing a Tax Surveyor, and who has it. */
export default function SurveyorAssignmentsPage() {
  const admin = useAdminGuard();
  const [items, setItems] = useState<SurveyorWorkItem[] | null>(null);
  const [surveyors, setSurveyors] = useState<TaxSurveyorOption[]>([]);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "unassigned">("all");
  const canAssign = admin?.role === "tax_daroga";

  async function load() {
    try {
      setItems(await fetchSurveyorWork());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the list.");
    }
  }

  useEffect(() => {
    if (!admin || !VIEW_ROLES.includes(admin.role)) return;
    load();
    fetchTaxSurveyors()
      .then(setSurveyors)
      .catch(() => setSurveyors([]));
  }, [admin]);

  if (!admin) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  if (!VIEW_ROLES.includes(admin.role)) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <main className="mx-auto max-w-2xl px-6 py-10">
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" /> This page is for the Tax Daroga and senior officers.
          </div>
        </main>
      </div>
    );
  }

  async function assign(w: SurveyorWorkItem) {
    const key = `${w.type}:${w.id}`;
    const username = choice[key];
    if (!username) return setError("Choose a Tax Surveyor first.");
    setBusy(key);
    setError(null);
    setDone(null);
    try {
      const r = await assignSurveyorToWork(w.type, w.id, username);
      setDone(`${w.reference} is now with ${r.surveyor}.`);
      setChoice((c) => ({ ...c, [key]: "" }));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not assign.");
    } finally {
      setBusy(null);
    }
  }

  const shown = (items ?? []).filter((w) => filter === "all" || !w.surveyor_username);
  const unassigned = (items ?? []).filter((w) => !w.surveyor_username).length;

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <UserCheck className="h-6 w-6" /> Surveyor Assignments
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          New holding requests, mutations and remeasurement requests that need a Tax Surveyor - and who has each one.
          {canAssign ? " Choose a surveyor to give it to (or move it to another surveyor)." : ""}
        </p>

        {surveyors.length === 0 && items !== null && (
          <p role="alert" className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            No Tax Surveyor login exists yet. Create one on the server (see the setup note), then assign the requests here.
          </p>
        )}
        {error && (
          <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        {done && (
          <p role="status" className="mt-4 flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            <CheckCircle2 className="h-4 w-4" /> {done}
          </p>
        )}

        <div className="mt-5 inline-flex rounded-md border border-slate-300 bg-white p-0.5 text-xs font-semibold" role="group" aria-label="Show">
          <button onClick={() => setFilter("all")} aria-pressed={filter === "all"} className={`rounded px-3 py-1.5 ${filter === "all" ? "bg-nnm-blue text-white" : "text-slate-600"}`}>
            All ({items?.length ?? 0})
          </button>
          <button
            onClick={() => setFilter("unassigned")}
            aria-pressed={filter === "unassigned"}
            className={`rounded px-3 py-1.5 ${filter === "unassigned" ? "bg-nnm-blue text-white" : "text-slate-600"}`}
          >
            No surveyor yet ({unassigned})
          </button>
        </div>

        {items === null ? (
          <p className="mt-6 flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </p>
        ) : shown.length === 0 ? (
          <p className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-400">Nothing waiting for a surveyor.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {shown.map((w) => {
              const key = `${w.type}:${w.id}`;
              return (
                <div key={key} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${TYPE_TONE[w.type]}`}>{TYPE_LABEL[w.type]}</span>
                        <Link href={pageOf(w)} className="font-semibold text-nnm-blue hover:underline">
                          {w.reference}
                        </Link>
                        {w.holding_no && <span className="font-mono text-xs text-slate-600">{w.holding_no}</span>}
                      </div>
                      <p className="mt-1 text-sm text-slate-700">
                        {w.owner ?? "-"}
                        {w.ward ? ` · Ward ${w.ward}` : ""} <span className="text-xs text-slate-400">· waiting {since(w.waiting_since)}</span>
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">{w.stage_label}</p>
                    </div>
                    <div className="text-right text-sm">
                      <div className="text-xs text-slate-500">Surveyor</div>
                      <div className={w.surveyor_name ? "font-semibold text-slate-800" : "font-semibold text-red-600"}>{w.surveyor_name ?? "Not assigned"}</div>
                    </div>
                  </div>
                  {canAssign &&
                    (w.assignable_here ? (
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <select
                          value={choice[key] ?? ""}
                          onChange={(e) => setChoice((c) => ({ ...c, [key]: e.target.value }))}
                          aria-label={`Tax Surveyor for ${w.reference}`}
                          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm sm:max-w-xs"
                        >
                          <option value="">{w.surveyor_name ? "Move to another surveyor…" : "Choose a Tax Surveyor…"}</option>
                          {surveyors
                            .filter((s) => s.username !== w.surveyor_username)
                            .map((s) => (
                              <option key={s.username} value={s.username}>
                                {s.displayName} ({s.username})
                              </option>
                            ))}
                        </select>
                        <button
                          onClick={() => assign(w)}
                          disabled={busy !== null || !choice[key]}
                          className="rounded-md bg-nnm-blue px-4 py-2 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
                        >
                          {busy === key ? "Saving…" : w.surveyor_name ? "Reassign" : "Assign"}
                        </button>
                      </div>
                    ) : (
                      <p className="mt-3 text-xs text-slate-600">
                        Assign the surveyor on the{" "}
                        <Link href={pageOf(w)} className="font-semibold text-nnm-blue hover:underline">
                          request page
                        </Link>
                        {w.type === "new_holding" ? " - together with the demand register number." : " - together with the area verification."}
                      </p>
                    ))}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
