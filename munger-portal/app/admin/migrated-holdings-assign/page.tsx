"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, UserCheck } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import {
  fetchPendingAssignmentHoldings,
  fetchTaxDarogas,
  assignMigratedHolding,
  fetchPendingFinalVerificationHoldings,
  finalizeMigratedHolding,
  type MigratedHoldingSurvey,
  type TaxDarogaOption,
} from "@/lib/admin-api";

const ROLES = ["deputy_commissioner", "city_manager"];

export default function MigratedHoldingsAssignPage() {
  const admin = useAdminGuard();
  const [tab, setTab] = useState<"assign" | "finalize">("assign");
  const [toAssign, setToAssign] = useState<MigratedHoldingSurvey[] | null>(null);
  const [toFinalize, setToFinalize] = useState<MigratedHoldingSurvey[] | null>(null);
  const [taxDarogas, setTaxDarogas] = useState<TaxDarogaOption[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [assigningHolding, setAssigningHolding] = useState<string | null>(null);
  const [selectedTaxDaroga, setSelectedTaxDaroga] = useState("");
  const [acting, setActing] = useState<string | null>(null);

  function load() {
    fetchPendingAssignmentHoldings()
      .then(setToAssign)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load worklist."));
    fetchPendingFinalVerificationHoldings()
      .then(setToFinalize)
      .catch(() => setToFinalize([]));
  }

  useEffect(() => {
    if (!admin) return;
    load();
    fetchTaxDarogas()
      .then(setTaxDarogas)
      .catch(() => setTaxDarogas([]));
  }, [admin]);

  async function handleAssign(holdingNo: string) {
    if (!selectedTaxDaroga) {
      setError("Choose a Tax Daroga first.");
      return;
    }
    setActing(holdingNo);
    setError(null);
    try {
      await assignMigratedHolding(holdingNo, selectedTaxDaroga);
      setAssigningHolding(null);
      setSelectedTaxDaroga("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not assign this holding.");
    } finally {
      setActing(null);
    }
  }

  async function handleFinalize(holdingNo: string) {
    setActing(holdingNo);
    setError(null);
    try {
      await finalizeMigratedHolding(holdingNo);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not finalize this holding.");
    } finally {
      setActing(null);
    }
  }

  if (!admin) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  if (!ROLES.includes(admin.role)) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <main className="mx-auto max-w-2xl px-6 py-10">
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            This is restricted to the Deputy Municipal Commissioner and City Manager.
          </div>
        </main>
      </div>
    );
  }

  const wardScope = admin.role === "deputy_commissioner" ? "odd-numbered" : "even-numbered";

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />

      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <UserCheck className="h-6 w-6" />
          Migrated Holding Surveys
        </h1>
        <p className="mb-6 text-sm text-slate-500">
          You handle {wardScope} wards - assign old holdings to a Tax Daroga for survey, and give final sign-off once
          they&apos;ve verified the entered details.
        </p>

        <div className="mb-5 flex gap-2">
          <button
            onClick={() => setTab("assign")}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold ${tab === "assign" ? "bg-nnm-blue text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-100"}`}
          >
            To Assign {toAssign ? `(${toAssign.length})` : ""}
          </button>
          <button
            onClick={() => setTab("finalize")}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold ${tab === "finalize" ? "bg-nnm-blue text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-100"}`}
          >
            To Finalize {toFinalize ? `(${toFinalize.length})` : ""}
          </button>
        </div>

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {tab === "assign" ? (
          !toAssign ? (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : toAssign.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">Nothing waiting on you.</div>
          ) : (
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
              {toAssign.map((s) => (
                <div key={s.holding_no} className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{s.holding_no}</p>
                      <p className="text-xs text-slate-500">Ward {s.ward}</p>
                    </div>
                    {assigningHolding !== s.holding_no && (
                      <button
                        onClick={() => setAssigningHolding(s.holding_no)}
                        className="rounded-md bg-nnm-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-nnm-blue-dark"
                      >
                        Assign
                      </button>
                    )}
                  </div>
                  {assigningHolding === s.holding_no && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-3">
                      <select
                        value={selectedTaxDaroga}
                        onChange={(e) => setSelectedTaxDaroga(e.target.value)}
                        className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                      >
                        <option value="">Choose a Tax Daroga…</option>
                        {taxDarogas.map((t) => (
                          <option key={t.username} value={t.username}>
                            {t.displayName}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleAssign(s.holding_no)}
                        disabled={acting === s.holding_no}
                        className="rounded-md bg-nnm-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
                      >
                        {acting === s.holding_no ? "Assigning…" : "Confirm"}
                      </button>
                      <button
                        onClick={() => {
                          setAssigningHolding(null);
                          setSelectedTaxDaroga("");
                        }}
                        className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        ) : !toFinalize ? (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : toFinalize.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">Nothing waiting on your final sign-off.</div>
        ) : (
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {toFinalize.map((s) => (
              <div key={s.holding_no} className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{s.holding_no}</p>
                    <p className="text-xs text-slate-500">
                      Ward {s.ward} - surveyed by {s.surveyor_name} (ID: {s.surveyor_id_number}), verified by{" "}
                      {s.tax_daroga_verified_by}
                    </p>
                  </div>
                  <button
                    onClick={() => handleFinalize(s.holding_no)}
                    disabled={acting === s.holding_no}
                    className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-60"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {acting === s.holding_no ? "Finalizing…" : "Finalize"}
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
