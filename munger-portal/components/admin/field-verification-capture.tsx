"use client";

import { useState } from "react";
import { Camera, CheckCircle2, ChevronDown, ChevronUp, CreditCard, FileText, Loader2, MapPin, MapPinOff, ScrollText } from "lucide-react";
import { getCurrentGpsPosition } from "@/lib/geolocation";
import { fileToBase64 } from "@/components/admin/discrepancy-capture-section";
import { recordFieldVerification } from "@/lib/admin-api";

interface FieldVerificationState {
  gpsLat: number | null;
  gpsLng: number | null;
  aadhaarNumber: string;
  holdingFile: File | null;
  aadhaarFile: File | null;
  previousReceiptFile: File | null;
  landDocumentFile: File | null;
}

function blankState(): FieldVerificationState {
  return { gpsLat: null, gpsLng: null, aadhaarNumber: "", holdingFile: null, aadhaarFile: null, previousReceiptFile: null, landDocumentFile: null };
}

function PhotoSlot({
  label,
  icon,
  file,
  onChange,
}: {
  label: string;
  icon: React.ReactNode;
  file: File | null;
  onChange: (file: File | null) => void;
}) {
  const previewUrl = file ? URL.createObjectURL(file) : null;
  const inputId = `field-verification-slot-${label.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <div className={`rounded-lg border-2 border-dashed p-4 text-center ${file ? "border-green-300 bg-green-50" : "border-nnm-blue/40 bg-blue-50/50"}`}>
      <label htmlFor={inputId} className="flex cursor-pointer flex-col items-center gap-2">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- local file preview, not a static asset
          <img src={previewUrl} alt={label} className="h-24 w-24 rounded-md border border-slate-200 object-cover" />
        ) : (
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-nnm-blue shadow-sm">{icon}</span>
        )}
        <span className="text-sm font-semibold text-slate-800">{label}</span>
        <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${file ? "bg-green-600 text-white" : "bg-nnm-blue text-white"}`}>
          {file ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" />
              Captured - tap to retake
            </>
          ) : (
            <>
              <Camera className="h-3.5 w-3.5" />
              Take / Choose Photo
            </>
          )}
        </span>
      </label>
      <input id={inputId} type="file" accept="image/jpeg,image/png" capture="environment" onChange={(e) => onChange(e.target.files?.[0] ?? null)} className="hidden" />
    </div>
  );
}

/**
 * Optional GPS + photo + Aadhaar-number capture for an ORDINARY
 * collection/survey visit - available every time a Tax Collector or
 * Tax Surveyor looks up a holding, not only when they flag a
 * discrepancy. Purely an evidence log: submitting this never changes
 * the property record. Collapsed by default so it doesn't get in the
 * way of the main collection/survey task; everything inside it is
 * optional, and a partial submission (e.g. just GPS + one photo) is
 * accepted.
 */
export function FieldVerificationCapture({ holdingNo }: { holdingNo: string }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<FieldVerificationState>(blankState());
  const [capturingGps, setCapturingGps] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleCaptureGps() {
    setCapturingGps(true);
    setGpsError(null);
    try {
      const gps = await getCurrentGpsPosition();
      if (!gps) {
        setGpsError("Could not get your location - check that location access is allowed for this site.");
        return;
      }
      setState((s) => ({ ...s, gpsLat: gps.lat, gpsLng: gps.lng }));
    } finally {
      setCapturingGps(false);
    }
  }

  async function handleSave() {
    if (state.aadhaarNumber && !/^\d{12}$/.test(state.aadhaarNumber)) {
      setError("Aadhaar number must be exactly 12 digits.");
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const [holdingPhoto, aadhaarPhoto, previousReceiptPhoto, landDocumentPhoto] = await Promise.all([
        state.holdingFile ? fileToBase64(state.holdingFile) : Promise.resolve(undefined),
        state.aadhaarFile ? fileToBase64(state.aadhaarFile) : Promise.resolve(undefined),
        state.previousReceiptFile ? fileToBase64(state.previousReceiptFile) : Promise.resolve(undefined),
        state.landDocumentFile ? fileToBase64(state.landDocumentFile) : Promise.resolve(undefined),
      ]);
      await recordFieldVerification(holdingNo, {
        gpsLat: state.gpsLat,
        gpsLng: state.gpsLng,
        aadhaarNumber: state.aadhaarNumber.trim() || null,
        holdingPhotoBase64Data: holdingPhoto,
        holdingPhotoMimeType: state.holdingFile?.type,
        aadhaarPhotoBase64Data: aadhaarPhoto,
        aadhaarPhotoMimeType: state.aadhaarFile?.type,
        previousReceiptPhotoBase64Data: previousReceiptPhoto,
        previousReceiptPhotoMimeType: state.previousReceiptFile?.type,
        landDocumentPhotoBase64Data: landDocumentPhoto,
        landDocumentPhotoMimeType: state.landDocumentFile?.type,
      });
      setSaved(true);
      setState(blankState());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this field verification.");
    } finally {
      setSaving(false);
    }
  }

  const hasAnything = state.gpsLat !== null || state.aadhaarNumber.trim() || state.holdingFile || state.aadhaarFile || state.previousReceiptFile || state.landDocumentFile;

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-6 py-4 text-left"
      >
        <span className="text-sm font-semibold text-slate-800">Field Verification (GPS, Photos &amp; Aadhaar) - optional</span>
        {open ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
      </button>

      {open && (
        <div className="border-t border-slate-100 px-6 pb-6 pt-4">
          <p className="mb-4 text-xs text-slate-500">
            Record what you find at this holding while you&apos;re here - none of this changes the property record. Everything below is optional and can be
            submitted in any combination.
          </p>

          {saved && (
            <div role="status" className="mb-4 flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Field verification saved.
            </div>
          )}

          <div className="mb-4">
            <button
              type="button"
              onClick={handleCaptureGps}
              disabled={capturingGps}
              className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold shadow-sm disabled:opacity-60 ${
                state.gpsLat !== null ? "bg-green-600 text-white" : "bg-nnm-blue text-white hover:bg-nnm-blue-dark"
              }`}
            >
              {capturingGps ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Getting your location…
                </>
              ) : state.gpsLat !== null ? (
                <>
                  <CheckCircle2 className="h-5 w-5" />
                  Location Captured ({state.gpsLat.toFixed(5)}, {state.gpsLng?.toFixed(5)}) - Tap to Recapture
                </>
              ) : (
                <>
                  <MapPin className="h-5 w-5" />
                  Capture Holding&apos;s GPS Location
                </>
              )}
            </button>
            {gpsError && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-red-600">
                <MapPinOff className="h-3.5 w-3.5" />
                {gpsError}
              </p>
            )}
          </div>

          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium text-slate-600">Owner&apos;s Aadhaar number</label>
            <input
              value={state.aadhaarNumber}
              onChange={(e) => setState((s) => ({ ...s, aadhaarNumber: e.target.value.replace(/\D/g, "").slice(0, 12) }))}
              placeholder="12-digit Aadhaar number"
              inputMode="numeric"
              className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <PhotoSlot label="Holding Photo" icon={<Camera className="h-5 w-5" />} file={state.holdingFile} onChange={(f) => setState((s) => ({ ...s, holdingFile: f }))} />
            <PhotoSlot
              label="Owner's Aadhaar Card"
              icon={<CreditCard className="h-5 w-5" />}
              file={state.aadhaarFile}
              onChange={(f) => setState((s) => ({ ...s, aadhaarFile: f }))}
            />
            <PhotoSlot
              label="Previous Year's Tax Receipt"
              icon={<FileText className="h-5 w-5" />}
              file={state.previousReceiptFile}
              onChange={(f) => setState((s) => ({ ...s, previousReceiptFile: f }))}
            />
            <PhotoSlot
              label="Land-Related Document"
              icon={<ScrollText className="h-5 w-5" />}
              file={state.landDocumentFile}
              onChange={(f) => setState((s) => ({ ...s, landDocumentFile: f }))}
            />
          </div>

          {error && (
            <p role="alert" className="mt-4 text-xs text-red-600">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !hasAnything}
            className="mt-4 w-full rounded-md bg-nnm-blue px-4 py-2.5 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save Field Verification"}
          </button>
        </div>
      )}
    </div>
  );
}
