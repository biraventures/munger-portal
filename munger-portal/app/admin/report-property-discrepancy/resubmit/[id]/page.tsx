"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertCircle, Camera, Loader2, MapPin, RotateCcw } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { fetchDiscrepancyRequestDetail, resubmitDiscrepancyRequest } from "@/lib/admin-api";
import { fetchFormOptions, type FormOptions } from "@/lib/operator-api";
import { getCurrentGpsPosition } from "@/lib/geolocation";
import { AdminPropertyDetailsForm, propertyFormFromProposedData, propertyFormToPayload, type AdminPropertyFormState } from "@/components/admin/property-details-form";

const inputClass = "w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

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
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
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

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreviewUrl(URL.createObjectURL(file));
  }

  async function handleSubmit() {
    if (!form || !discrepancyNotes.trim()) {
      setSubmitError("Describe what you found that doesn't match the records.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const gps = await getCurrentGpsPosition();
      let photoBase64Data: string | undefined;
      let photoMimeType: string | undefined;
      if (photoFile) {
        photoBase64Data = await fileToBase64(photoFile);
        photoMimeType = photoFile.type;
      }
      await resubmitDiscrepancyRequest(id, {
        discrepancyNotes: discrepancyNotes.trim(),
        proposedData: propertyFormToPayload(form),
        gpsLat: gps?.lat ?? null,
        gpsLng: gps?.lng ?? null,
        photoBase64Data,
        photoMimeType,
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
              <AdminPropertyDetailsForm form={form} onChange={setForm} usageTypes={formOptions?.usageTypes ?? []} />
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                <Camera className="h-4 w-4" />
                Photo of the holding
              </h2>
              <p className="mb-3 text-xs text-slate-500">Optional - re-attach a new photo if needed, or leave blank to keep the original.</p>
              <input type="file" accept="image/jpeg,image/png" capture="environment" onChange={handlePhotoChange} className="text-sm" />
              {photoPreviewUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- local file preview, not a static asset
                <img src={photoPreviewUrl} alt="Holding preview" className="mt-3 max-h-48 rounded-md border border-slate-200 object-contain" />
              )}
              <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
                <MapPin className="h-3.5 w-3.5" />
                Your current location will be captured automatically when you resubmit.
              </p>
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
              {submitting ? "Resubmitting…" : "Resubmit for Review"}
            </button>
          </div>
        ) : null}
      </main>
    </div>
  );
}
