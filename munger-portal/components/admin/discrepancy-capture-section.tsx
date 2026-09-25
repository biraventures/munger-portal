"use client";

import { useState } from "react";
import { Camera, CheckCircle2, CreditCard, FileText, Loader2, MapPin, MapPinOff } from "lucide-react";
import { getCurrentGpsPosition } from "@/lib/geolocation";

export interface CaptureState {
  gpsLat: number | null;
  gpsLng: number | null;
  photoFile: File | null;
  previousReceiptFile: File | null;
  aadhaarFile: File | null;
}

export function blankCaptureState(): CaptureState {
  return { gpsLat: null, gpsLng: null, photoFile: null, previousReceiptFile: null, aadhaarFile: null };
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function PhotoSlot({
  label,
  icon,
  required,
  file,
  onChange,
}: {
  label: string;
  icon: React.ReactNode;
  required?: boolean;
  file: File | null;
  onChange: (file: File | null) => void;
}) {
  const previewUrl = file ? URL.createObjectURL(file) : null;
  const inputId = `photo-slot-${label.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <div className={`rounded-lg border-2 border-dashed p-4 text-center ${file ? "border-green-300 bg-green-50" : "border-nnm-blue/40 bg-blue-50/50"}`}>
      <label htmlFor={inputId} className="flex cursor-pointer flex-col items-center gap-2">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- local file preview, not a static asset
          <img src={previewUrl} alt={label} className="h-24 w-24 rounded-md border border-slate-200 object-cover" />
        ) : (
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-nnm-blue shadow-sm">{icon}</span>
        )}
        <span className="text-sm font-semibold text-slate-800">
          {label}
          {required && <span className="text-red-500"> *</span>}
        </span>
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
      <input
        id={inputId}
        type="file"
        accept="image/jpeg,image/png"
        capture="environment"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        className="hidden"
      />
    </div>
  );
}

/** Prominent photo + GPS capture block for a discrepancy submission - this was previously a plain file input and small text note, hard to notice; now large, clearly-labeled buttons with visible captured/not-captured state. */
export function DiscrepancyCaptureSection({ state, onChange }: { state: CaptureState; onChange: (next: CaptureState) => void }) {
  const [capturingGps, setCapturingGps] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  async function handleCaptureGps() {
    setCapturingGps(true);
    setGpsError(null);
    try {
      const gps = await getCurrentGpsPosition();
      if (!gps) {
        setGpsError("Could not get your location - check that location access is allowed for this site.");
        return;
      }
      onChange({ ...state, gpsLat: gps.lat, gpsLng: gps.lng });
    } finally {
      setCapturingGps(false);
    }
  }

  return (
    <div className="rounded-xl border-2 border-nnm-blue bg-white p-6">
      <h2 className="mb-1 text-base font-semibold text-slate-900">Photos &amp; Location</h2>
      <p className="mb-4 text-sm text-slate-500">Required before you can submit.</p>

      <div className="mb-4">
        <button
          type="button"
          onClick={handleCaptureGps}
          disabled={capturingGps}
          className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3.5 text-sm font-semibold shadow-sm disabled:opacity-60 ${
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <PhotoSlot label="Holding Photo" icon={<Camera className="h-5 w-5" />} file={state.photoFile} onChange={(f) => onChange({ ...state, photoFile: f })} />
        <PhotoSlot
          label="Previous Year's Tax Receipt"
          icon={<FileText className="h-5 w-5" />}
          file={state.previousReceiptFile}
          onChange={(f) => onChange({ ...state, previousReceiptFile: f })}
        />
        <PhotoSlot label="Owner's Aadhaar Card" icon={<CreditCard className="h-5 w-5" />} file={state.aadhaarFile} onChange={(f) => onChange({ ...state, aadhaarFile: f })} />
      </div>
    </div>
  );
}
