"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, ClipboardList, Loader2, RotateCcw } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import {
  fetchMyMigratedAssignments,
  fetchTaxSurveyors,
  assignToTaxSurveyor,
  verifyMigratedHoldingByTaxDaroga,
  revertMigratedHoldingToSurveyor,
  type MigratedHoldingSurvey,
  type TaxSurveyorOption,
} from "@/lib/admin-api";

const inputClass = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";

export default function MigratedHoldingsSurveyorPage() {
  const admin = useAdminGuard();
  const [surveys, setSurveys] = useState<MigratedHoldingSurvey[] | null>(null);
  const [taxSurveyors, setTaxSurveyors] = useState<TaxSurveyorOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const [assigning, setAssigning] = useState<string | null>(null);
  const [selectedSurveyor, setSelectedSurveyor] = useState("");

  const [reverting, setReverting] = useState<string | null>(null);
  const [revertReason, setRevertReason] = useState("");
  const [revertToSurveyor, setRevertToSurveyor] = useState(""); // empty = same surveyor

  function load() {
    fetchMyMigratedAssignments()
      .then(setSurveys)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load your worklist."));
  }

  useEffect(() => {
    if (!admin) return;
    load();
    fetchTaxSurveyors()
      .then(setTaxSurveyors)
      .catch(() => setTaxSurveyors([]));
  }, [admin]);

  function openAssign(holdingNo: string) {
    setAssigning(holdingNo);
    setSelectedSurveyor("");
    setError(null);
  }

  async function handleAssign(holdingNo: string) {
    if (!selectedSurveyor) {
      setError("Choose a Tax Surveyor first.");
      return;
    }
    setActing(holdingNo);
    setError(null);
    try {
      await assignToTaxSurveyor(holdingNo, selectedSurveyor);
      setAssigning(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not assign this holding.");
    } finally {
      setActing(null);
    }
  }

  async function handleVerify(holdingNo: string) {
    setActing(holdingNo);
    setError(null);
    try {
      await verifyMigratedHoldingByTaxDaroga(holdingNo);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify this holding.");
    } finally {
      setActing(null);
    }
  }

  function openRevert(holdingNo: string) {
    setReverting(holdingNo);
    setRevertReason("");
    setRevertToSurveyor("");
    setError(null);
  }

  async function handleRevert(holdingNo: string) {
    if (!revertReason.trim()) {
      setError("A reason is required to revert a submission.");
      return;
    }
    setActing(holdingNo);
    setError(null);
    try {
      await revertMigratedHoldingToSurveyor(holdingNo, revertReason.trim(), revertToSurveyor || undefined);
      setReverting(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not revert this submission.");
    } finally {
      setActing(null);
    }
  }

  if (!admin) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  if (admin.role !== "tax_daroga") {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <main className="mx-auto max-w-2xl px-6 py-10">
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            This is restricted to the Tax Daroga.
          </div>
        </main>
      </div>
    );
  }

  const awaitingSurveyor = surveys?.filter((s) => s.status === "assigned_to_surveyor") ?? [];
  const awaitingVerification = surveys?.filter((s) => s.status === "pending_verification") ?? [];

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />

      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <ClipboardList className="h-6 w-6" />
          My Migrated Holding Surveys
        </h1>
        <p className="mb-6 text-sm text-slate-500">Old holdings assigned to you for survey.</p>

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {!surveys ? (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <>
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Awaiting surveyor assignment ({awaitingSurveyor.length})</h2>
            {awaitingSurveyor.length === 0 ? (
              <p className="mb-6 text-sm text-slate-400">Nothing here.</p>
            ) : (
              <div className="mb-8 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                {awaitingSurveyor.map((s) => (
                  <div key={s.holding_no} className="p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-800">
                        {s.holding_no} <span className="font-normal text-slate-500">- Ward {s.ward}</span>
                      </p>
                      {assigning !== s.holding_no && (
                        <button
                          onClick={() => openAssign(s.holding_no)}
                          className="rounded-md bg-nnm-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-nnm-blue-dark"
                        >
                          Assign Surveyor
                        </button>
                      )}
                    </div>
                    {assigning === s.holding_no && (
                      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-3">
                        <select value={selectedSurveyor} onChange={(e) => setSelectedSurveyor(e.target.value)} className={inputClass}>
                          <option value="">Choose a Tax Surveyor…</option>
                          {taxSurveyors.map((t) => (
                            <option key={t.username} value={t.username}>
                              {t.displayName}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleAssign(s.holding_no)}
                          disabled={acting === s.holding_no}
                          className="shrink-0 rounded-md bg-nnm-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
                        >
                          {acting === s.holding_no ? "Assigning…" : "Confirm"}
                        </button>
                        <button onClick={() => setAssigning(null)} className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <h2 className="mb-3 text-sm font-semibold text-slate-700">Awaiting your verification ({awaitingVerification.length})</h2>
            {awaitingVerification.length === 0 ? (
              <p className="text-sm text-slate-400">Nothing here.</p>
            ) : (
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                {awaitingVerification.map((s) => (
                  <div key={s.holding_no} className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">
                          {s.holding_no} <span className="font-normal text-slate-500">- Ward {s.ward}</span>
                        </p>
                        <p className="text-xs text-slate-500">
                          Surveyed by {s.assigned_to_tax_surveyor_display_name}
                          {s.revision_count > 0 ? ` (revision ${s.revision_count})` : ""}
                        </p>
                      </div>
                      {reverting !== s.holding_no && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleVerify(s.holding_no)}
                            disabled={acting === s.holding_no}
                            className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-60"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {acting === s.holding_no ? "Verifying…" : "Verify"}
                          </button>
                          <button
                            onClick={() => openRevert(s.holding_no)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Revert
                          </button>
                        </div>
                      )}
                    </div>

                    {reverting === s.holding_no && (
                      <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3">
                        <label className="mb-1 block text-xs font-medium text-slate-600">Reason for reverting</label>
                        <textarea
                          value={revertReason}
                          onChange={(e) => setRevertReason(e.target.value)}
                          rows={2}
                          className={`${inputClass} mb-2`}
                          autoFocus
                        />
                        <label className="mb-1 block text-xs font-medium text-slate-600">Send back to</label>
                        <select value={revertToSurveyor} onChange={(e) => setRevertToSurveyor(e.target.value)} className={`${inputClass} mb-2`}>
                          <option value="">Same surveyor ({s.assigned_to_tax_surveyor_display_name})</option>
                          {taxSurveyors
                            .filter((t) => t.username !== s.assigned_to_tax_surveyor_username)
                            .map((t) => (
                              <option key={t.username} value={t.username}>
                                {t.displayName}
                              </option>
                            ))}
                        </select>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleRevert(s.holding_no)}
                            disabled={acting === s.holding_no}
                            className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
                          >
                            {acting === s.holding_no ? "Reverting…" : "Confirm Revert"}
                          </button>
                          <button onClick={() => setReverting(null)} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
