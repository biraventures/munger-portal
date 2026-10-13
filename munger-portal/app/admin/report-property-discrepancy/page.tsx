"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2, Search, AlertTriangle } from "lucide-react";
import { sanitizeHoldingNoInput } from "@/lib/holding-no";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { fetchFullPropertyAdmin, reportPropertyDiscrepancy } from "@/lib/admin-api";
import { fetchFormOptions, type FormOptions } from "@/lib/operator-api";
import { searchMigratedHoldings, type MigHoldingHit } from "@/lib/collector-field-api";
import { AdminPropertyDetailsForm, blankAdminPropertyForm, propertyFormFromExisting, propertyFormToPayload, type AdminPropertyFormState } from "@/components/admin/property-details-form";
import { DiscrepancyCaptureSection, blankCaptureState, fileToBase64, type CaptureState } from "@/components/admin/discrepancy-capture-section";

const inputClass = "w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";

export default function ReportPropertyDiscrepancyPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>}>
      <ReportPropertyDiscrepancyContent />
    </Suspense>
  );
}

function ReportPropertyDiscrepancyContent() {
  const admin = useAdminGuard();
  const searchParams = useSearchParams();
  const [holdingNo, setHoldingNo] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [found, setFound] = useState(false);
  const [ownerOnRecord, setOwnerOnRecord] = useState("");
  const [formOptions, setFormOptions] = useState<FormOptions | null>(null);
  const [form, setForm] = useState<AdminPropertyFormState>(blankAdminPropertyForm());
  const [discrepancyNotes, setDiscrepancyNotes] = useState("");
  const [capture, setCapture] = useState<CaptureState>(blankCaptureState());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [migOpen, setMigOpen] = useState(false);
  const [migQuery, setMigQuery] = useState("");
  const [migWard, setMigWard] = useState("");
  const [migSearching, setMigSearching] = useState(false);
  const [migError, setMigError] = useState<string | null>(null);
  const [migResults, setMigResults] = useState<MigHoldingHit[] | null>(null);

  useEffect(() => {
    fetchFormOptions().then(setFormOptions).catch(() => setFormOptions(null));
  }, []);

  async function runSearch(value: string) {
    if (!value.trim()) return;
    setSearching(true);
    setSearchError(null);
    setFound(false);
    setSuccess(false);
    try {
      const result = await fetchFullPropertyAdmin(value.trim());
      if (!result.found || !result.property) {
        setSearchError("No holding found with that number.");
        return;
      }
      setOwnerOnRecord(String(result.property.owner_name ?? ""));
      setForm(propertyFormFromExisting(result.property, result.floors ?? []));
      setFound(true);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setSearching(false);
    }
  }

  async function runMigSearch() {
    setMigSearching(true);
    setMigError(null);
    setMigResults(null);
    try {
      setMigResults(await searchMigratedHoldings(migQuery.trim(), migWard));
    } catch (err) {
      setMigError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setMigSearching(false);
    }
  }

  useEffect(() => {
    const preset = searchParams.get("holding");
    if (preset) {
      setHoldingNo(preset);
      runSearch(preset);
    }
  }, [searchParams]);

  async function handleSubmit() {
    if (!discrepancyNotes.trim()) {
      setSubmitError("Describe what you found that doesn't match the records.");
      return;
    }
    if (!form.aadhaarNumber.trim()) {
      setSubmitError("The holding owner's Aadhaar number is required.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const [photoBase64Data, previousReceiptPhotoBase64Data, aadhaarPhotoBase64Data] = await Promise.all([
        capture.photoFile ? fileToBase64(capture.photoFile) : undefined,
        capture.previousReceiptFile ? fileToBase64(capture.previousReceiptFile) : undefined,
        capture.aadhaarFile ? fileToBase64(capture.aadhaarFile) : undefined,
      ]);
      await reportPropertyDiscrepancy(holdingNo.trim(), {
        discrepancyNotes: discrepancyNotes.trim(),
        proposedData: propertyFormToPayload(form),
        gpsLat: capture.gpsLat,
        gpsLng: capture.gpsLng,
        photoBase64Data,
        photoMimeType: capture.photoFile?.type,
        previousReceiptPhotoBase64Data,
        previousReceiptPhotoMimeType: capture.previousReceiptFile?.type,
        aadhaarPhotoBase64Data,
        aadhaarPhotoMimeType: capture.aadhaarFile?.type,
      });
      setSuccess(true);
      setFound(false);
      setHoldingNo("");
      setDiscrepancyNotes("");
      setCapture(blankCaptureState());
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not submit this discrepancy report.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!admin) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  if (admin.role !== "tax_collector") {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <main className="mx-auto max-w-2xl px-6 py-10">
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            This is restricted to the Tax Collector.
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
          <AlertTriangle className="h-6 w-6" />
          Report Property Discrepancy
        </h1>
        <p className="mb-6 text-sm text-slate-500">
          Found something during collection that doesn&apos;t match the records? Search the holding, enter the complete corrected details, and it will go
          through Tax Surveyor, Tax Daroga, City Manager, and DMC review before anything changes.
        </p>

        {success && (
          <div role="status" className="mb-5 flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Submitted for review. Nothing changes on the record until all four stages approve it.
          </div>
        )}

        <div className="mb-6 flex items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-500">Holding number</label>
            <input
              value={holdingNo}
              onChange={(e) => setHoldingNo(sanitizeHoldingNoInput(e.target.value))}
              onKeyDown={(e) => e.key === "Enter" && runSearch(holdingNo)}
              className={inputClass}
              placeholder="e.g. MUNG-00123"
            />
          </div>
          <button
            onClick={() => runSearch(holdingNo)}
            disabled={searching || !holdingNo.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-nnm-blue px-5 py-2.5 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
          >
            <Search className="h-4 w-4" />
            {searching ? "Searching…" : "Search"}
          </button>
        </div>

        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
          <button type="button" onClick={() => setMigOpen((v) => !v)} className="text-sm font-semibold text-nnm-blue hover:underline">
            {migOpen ? "Hide" : "House not found by holding number? Find it in the MUNG-MIG data"}
          </button>
          {migOpen && (
            <div className="mt-3 space-y-3">
              <p className="text-xs text-slate-500">
                Search the old-record (MUNG-MIG-) holdings by owner name, address, old holding number or MUNG-MIG number. Pick the match, enter the real details, and it goes
                through the same four-stage review. When fully approved the house becomes a regular holding.
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-48 flex-1">
                  <label className="mb-1 block text-xs font-medium text-slate-500">Owner name / address / number (3+ letters)</label>
                  <input value={migQuery} onChange={(e) => setMigQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && migQuery.trim().length >= 3 && runMigSearch()} className={inputClass} />
                </div>
                <div className="w-24">
                  <label className="mb-1 block text-xs font-medium text-slate-500">Ward</label>
                  <input value={migWard} onChange={(e) => setMigWard(e.target.value)} className={inputClass} placeholder="Any" />
                </div>
                <button
                  type="button"
                  onClick={runMigSearch}
                  disabled={migSearching || migQuery.trim().length < 3}
                  className="inline-flex items-center gap-1.5 rounded-md bg-nnm-blue px-4 py-2.5 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
                >
                  <Search className="h-4 w-4" />
                  {migSearching ? "Searching…" : "Search"}
                </button>
              </div>
              {migError && <p className="text-sm text-red-600">{migError}</p>}
              {migResults && migResults.length === 0 && (
                <p className="text-sm text-slate-600">
                  Nothing found. If the house is in neither database, <Link href="/admin/unsurveyed-house-entry" className="font-semibold text-nnm-blue underline">record it as a house not in records</Link>.
                </p>
              )}
              {migResults && migResults.length > 0 && (
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {migResults.map((h) => (
                    <li key={h.holding_no} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span>
                        <b>{h.holding_no}</b> - {h.owner_name}
                        <span className="block text-xs text-slate-500">
                          {h.address ?? "no address"}
                          {h.ward ? ` - Ward ${h.ward}` : ""}
                          {h.old_holding_no ? ` - old no ${h.old_holding_no}` : ""}
                          {h.pending_reports > 0 ? " - a report is already pending review" : ""}
                        </span>
                      </span>
                      <button
                        type="button"
                        disabled={h.pending_reports > 0}
                        onClick={() => {
                          setHoldingNo(h.holding_no);
                          runSearch(h.holding_no);
                        }}
                        className="shrink-0 rounded-md border border-nnm-blue px-3 py-1.5 text-xs font-semibold text-nnm-blue hover:bg-blue-50 disabled:opacity-40"
                      >
                        Use this
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-slate-500">
                Not in the MUNG-MIG data either? <Link href="/admin/unsurveyed-house-entry" className="font-semibold text-nnm-blue underline">Record a house not in records</Link>.
              </p>
            </div>
          )}
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
                On record: <span className="font-semibold text-slate-800">{ownerOnRecord}</span>. Correct the fields below to match what you actually found.
              </p>
              <label className="mb-1 block text-xs font-medium text-slate-600">What doesn&apos;t match? (required)</label>
              <textarea
                value={discrepancyNotes}
                onChange={(e) => setDiscrepancyNotes(e.target.value)}
                rows={3}
                className={`${inputClass} mb-2`}
                placeholder="e.g. Found an extra floor not on record; owner's name is spelled differently on the nameplate"
              />
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="mb-4 text-sm font-semibold text-slate-800">Complete corrected details</h2>
              <AdminPropertyDetailsForm form={form} onChange={setForm} usageTypes={formOptions?.usageTypes ?? []} solidWasteChargeTypes={formOptions?.solidWasteChargeTypes ?? []} />
            </div>

            <DiscrepancyCaptureSection state={capture} onChange={setCapture} />

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
              {submitting ? "Submitting…" : "Submit for Review"}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
