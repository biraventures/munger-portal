"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Search, ClipboardCheck } from "lucide-react";
import { sanitizeHoldingNoInput } from "@/lib/holding-no";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { fetchFullPropertyAdmin, savePropertyAdmin, type AdminSaveError } from "@/lib/admin-api";
import { fetchFormOptions, type FormOptions } from "@/lib/operator-api";
import { AdminPropertyDetailsForm, blankAdminPropertyForm, propertyFormFromExisting, propertyFormToPayload, type AdminPropertyFormState } from "@/components/admin/property-details-form";

const inputClass = "w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";

export default function InitiateSurveyPage() {
  const admin = useAdminGuard();
  const [holdingNo, setHoldingNo] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [found, setFound] = useState(false);
  const [isNewHolding, setIsNewHolding] = useState(false);
  const [formOptions, setFormOptions] = useState<FormOptions | null>(null);
  const [form, setForm] = useState<AdminPropertyFormState>(blankAdminPropertyForm());
  const [changeReference, setChangeReference] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ applied: boolean } | null>(null);

  useEffect(() => {
    fetchFormOptions().then(setFormOptions).catch(() => setFormOptions(null));
  }, []);

  async function handleSearch() {
    if (!holdingNo.trim()) return;
    setSearching(true);
    setSearchError(null);
    setFound(false);
    setSuccess(null);
    try {
      const result = await fetchFullPropertyAdmin(holdingNo.trim());
      if (!result.found || !result.property) {
        // No existing holding under this number - the survey creates it fresh.
        setIsNewHolding(true);
        setForm(blankAdminPropertyForm());
        setFound(true);
        return;
      }
      setIsNewHolding(false);
      setForm(propertyFormFromExisting(result.property, result.floors ?? []));
      setFound(true);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setSearching(false);
    }
  }

  async function handleSubmit() {
    if (!isNewHolding && !changeReference.trim()) {
      setSubmitError("Describe what the resurvey found/corrected.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload = propertyFormToPayload(form);
      if (!isNewHolding) {
        payload.changeBasis = "Resurvey/Reassessment";
        payload.changeReference = changeReference.trim();
      }
      const result = await savePropertyAdmin(holdingNo.trim(), payload);
      setSuccess({ applied: result.applied });
      setFound(false);
      setHoldingNo("");
      setChangeReference("");
    } catch (err) {
      const saveErr = err as AdminSaveError;
      setSubmitError(saveErr.message || "Could not save.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!admin) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  if (admin.role !== "tax_surveyor") {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <main className="mx-auto max-w-2xl px-6 py-10">
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            This is restricted to the Tax Surveyor.
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
          <ClipboardCheck className="h-6 w-6" />
          Initiate Survey / Resurvey
        </h1>
        <p className="mb-6 text-sm text-slate-500">
          Search a holding number. If it exists, submit a resurvey with the corrected details - it goes to Tax Daroga for approval like any other
          property change. If it doesn&apos;t exist yet, you can survey it fresh.
        </p>

        {success && (
          <div role="status" className="mb-5 flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {success.applied ? "New holding created." : "Resurvey submitted - pending Tax Daroga approval before it's applied."}
          </div>
        )}

        <div className="mb-6 flex items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-500">Holding number</label>
            <input
              value={holdingNo}
              onChange={(e) => setHoldingNo(sanitizeHoldingNoInput(e.target.value))}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className={inputClass}
              placeholder="e.g. MUNG-00123"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={searching || !holdingNo.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-nnm-blue px-5 py-2.5 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
          >
            <Search className="h-4 w-4" />
            {searching ? "Searching…" : "Search"}
          </button>
        </div>

        {searchError && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {searchError}
          </div>
        )}

        {found && (
          <div className="space-y-6">
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <p className="mb-4 text-sm text-slate-600">
                {isNewHolding ? (
                  <>No existing holding under this number - enter the details found during the field survey.</>
                ) : (
                  <>Existing holding found. Correct the fields below to match the field resurvey.</>
                )}
              </p>
              {!isNewHolding && (
                <>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Resurvey notes (required)</label>
                  <textarea
                    value={changeReference}
                    onChange={(e) => setChangeReference(e.target.value)}
                    rows={3}
                    className={`${inputClass} mb-2`}
                    placeholder="What was found/corrected during this resurvey?"
                  />
                </>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="mb-4 text-sm font-semibold text-slate-800">Property details</h2>
              <AdminPropertyDetailsForm form={form} onChange={setForm} usageTypes={formOptions?.usageTypes ?? []} solidWasteChargeTypes={formOptions?.solidWasteChargeTypes ?? []} />
            </div>

            {submitError && (
              <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {submitError}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full rounded-md bg-nnm-blue px-4 py-3 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
            >
              {submitting ? "Submitting…" : isNewHolding ? "Create Holding" : "Submit Resurvey"}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
