"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertCircle, Loader2, RotateCcw } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { fetchDiscrepancyRequestDetail, resubmitDiscrepancyRequest } from "@/lib/admin-api";
import { fetchFormOptions, type FormOptions } from "@/lib/operator-api";
import { AdminPropertyDetailsForm, propertyFormFromProposedData, propertyFormToPayload, type AdminPropertyFormState } from "@/components/admin/property-details-form";
import { DiscrepancyCaptureSection, blankCaptureState, fileToBase64, type CaptureState } from "@/components/admin/discrepancy-capture-section";

const inputClass = "w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";

export default function ResubmitDiscrepancyPage() {
  const admin = useAdminGuard();
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);

  const [holdingNo, setHoldingNo] = useState("");
  const [revertComment, setRevertComment] = useState<string | null>(null);
  const [discrepancyNotes, setDiscrepancyNotes] = useState("");
  const [form, setForm] = useState<AdminPropertyFormState | null>(null);
  const [formOptions, setFormOptions] = useState<FormOptions | null>(null);
  const [capture, setCapture] = useState<CaptureState>(blankCaptureState());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!admin || !id) return;
    fetchFormOptions().then(setFormOptions).catch(() => setFormOptions(null));
    fetchDiscrepancyRequestDetail(id)
      .then(({ request }) => {
        if (request.status !== "reverted") {
          setLoadError("This request isn't currently awaiting correction.");
          return;
        }
        setHoldingNo(request.holding_no);
        setDiscrepancyNotes(request.discrepancy_notes);
        setRevertComment(request.revert_comment ? `${request.reverted_by ?? "Reviewer"}: "${request.revert_comment}"` : null);
        setForm(propertyFormFromProposedData(request.proposed_data));
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Could not load this request."));
  }, [admin, id]);

  async function handleSubmit() {
    if (!form || !discrepancyNotes.trim()) {
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
      await resubmitDiscrepancyRequest(id, {
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
      router.push("/admin/my-discrepancy-reports");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not resubmit this report.");
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
          <RotateCcw className="h-6 w-6" />
          Correct &amp; Resubmit
        </h1>
        <p className="mb-6 text-sm text-slate-500">
          {holdingNo ? `Holding ${holdingNo}` : "Loading…"} - correct what needed fixing and resubmit; it re-enters review from the Tax Surveyor.
        </p>

        {revertComment && (
          <div className="mb-6 rounded-md border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
            <span className="font-semibold">Why this was sent back:</span> {revertComment}
          </div>
        )}

        {loadError && (
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {loadError}
          </div>
        )}

        {!form && !loadError ? (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : form ? (
          <div className="space-y-6">
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <label className="mb-1 block text-xs font-medium text-slate-600">What doesn&apos;t match? (required)</label>
              <textarea
                value={discrepancyNotes}
                onChange={(e) => setDiscrepancyNotes(e.target.value)}
                rows={3}
                className={`${inputClass} mb-2`}
              />
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="mb-4 text-sm font-semibold text-slate-800">Corrected details</h2>
              <AdminPropertyDetailsForm form={form} onChange={setForm} usageTypes={formOptions?.usageTypes ?? []} solidWasteChargeTypes={formOptions?.solidWasteChargeTypes ?? []} />
            </div>

            <DiscrepancyCaptureSection state={capture} onChange={setCapture} />
            <p className="-mt-4 text-xs text-slate-400">Leaving a photo slot empty on resubmission keeps the one already on file from your original report.</p>

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
              {submitting ? "Resubmitting…" : "Resubmit for Review"}
            </button>
          </div>
        ) : null}
      </main>
    </div>
  );
}
