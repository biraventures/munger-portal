"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, ClipboardList, Loader2 } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { fetchMyMigratedAssignments, recordMigratedHoldingSurveyor, verifyMigratedHoldingByTaxDaroga, type MigratedHoldingSurvey } from "@/lib/admin-api";

const inputClass = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";

export default function MigratedHoldingsSurveyorPage() {
  const admin = useAdminGuard();
  const [surveys, setSurveys] = useState<MigratedHoldingSurvey[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [recording, setRecording] = useState<string | null>(null);
  const [surveyorName, setSurveyorName] = useState("");
  const [surveyorIdNumber, setSurveyorIdNumber] = useState("");
  const [surveyDate, setSurveyDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [acting, setActing] = useState<string | null>(null);

  function load() {
    fetchMyMigratedAssignments()
      .then(setSurveys)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load your worklist."));
  }

  useEffect(() => {
    if (!admin) return;
    load();
  }, [admin]);

  function openRecord(holdingNo: string) {
    setRecording(holdingNo);
    setSurveyorName("");
    setSurveyorIdNumber("");
    setSurveyDate(new Date().toISOString().slice(0, 10));
    setError(null);
  }

  async function handleRecordSubmit(holdingNo: string) {
    if (!surveyorName.trim() || !surveyorIdNumber.trim()) {
      setError("Surveyor name and ID number are both required.");
      return;
    }
    setActing(holdingNo);
    setError(null);
    try {
      await recordMigratedHoldingSurveyor(holdingNo, surveyorName.trim(), surveyorIdNumber.trim(), surveyDate);
      setRecording(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record this survey.");
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
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Awaiting surveyor details ({awaitingSurveyor.length})</h2>
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
                      {recording !== s.holding_no && (
                        <button
                          onClick={() => openRecord(s.holding_no)}
                          className="rounded-md bg-nnm-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-nnm-blue-dark"
                        >
                          Record Survey
                        </button>
                      )}
                    </div>
                    {recording === s.holding_no && (
                      <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3">
                        <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                          <div>
                            <label className="mb-1 block text-xs font-medium text-slate-600">Surveyor name</label>
                            <input value={surveyorName} onChange={(e) => setSurveyorName(e.target.value)} className={inputClass} autoFocus />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-slate-600">Surveyor ID number</label>
                            <input value={surveyorIdNumber} onChange={(e) => setSurveyorIdNumber(e.target.value)} className={inputClass} />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-slate-600">Survey date</label>
                            <input type="date" value={surveyDate} onChange={(e) => setSurveyDate(e.target.value)} className={inputClass} />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleRecordSubmit(s.holding_no)}
                            disabled={acting === s.holding_no}
                            className="rounded-md bg-nnm-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
                          >
                            {acting === s.holding_no ? "Saving…" : "Save & Forward to Operator"}
                          </button>
                          <button
                            onClick={() => setRecording(null)}
                            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                          >
                            Cancel
                          </button>
                        </div>
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
                  <div key={s.holding_no} className="flex items-center justify-between p-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        {s.holding_no} <span className="font-normal text-slate-500">- Ward {s.ward}</span>
                      </p>
                      <p className="text-xs text-slate-500">Entered by {s.operator_entered_by}</p>
                    </div>
                    <button
                      onClick={() => handleVerify(s.holding_no)}
                      disabled={acting === s.holding_no}
                      className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-60"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {acting === s.holding_no ? "Verifying…" : "Verify"}
                    </button>
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
