"use client";

import { useEffect, useState } from "react";
import { Camera, CheckCircle2, Loader2, MapPin, MapPinOff } from "lucide-react";
import { getCurrentGpsPosition } from "@/lib/geolocation";

export function GpsButton({
  lat,
  lng,
  onCapture,
  label = "Capture GPS Location",
}: {
  lat: number | null;
  lng: number | null;
  onCapture: (lat: number, lng: number) => void;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function capture() {
    setBusy(true);
    setError(null);
    try {
      const gps = await getCurrentGpsPosition();
      if (!gps) {
        setError("Could not get your location - check that location access is allowed for this site.");
        return;
      }
      onCapture(gps.lat, gps.lng);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={capture}
        disabled={busy}
        className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3.5 text-sm font-semibold shadow-sm disabled:opacity-60 ${
          lat !== null ? "bg-green-600 text-white" : "bg-nnm-blue text-white hover:bg-nnm-blue-dark"
        }`}
      >
        {busy ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            Getting your location…
          </>
        ) : lat !== null ? (
          <>
            <CheckCircle2 className="h-5 w-5" />
            Location captured ({lat.toFixed(5)}, {lng?.toFixed(5)}) - tap to recapture
          </>
        ) : (
          <>
            <MapPin className="h-5 w-5" />
            {label}
          </>
        )}
      </button>
      {error && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-red-600">
          <MapPinOff className="h-3.5 w-3.5" />
          {error}
        </p>
      )}
    </div>
  );
}

export function PhotoPicker({ label, file, onChange, required }: { label: string; file: File | null; onChange: (file: File | null) => void; required?: boolean }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const inputId = `photo-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className={`rounded-lg border-2 border-dashed p-4 text-center ${file ? "border-green-300 bg-green-50" : "border-nnm-blue/40 bg-blue-50/50"}`}>
      <label htmlFor={inputId} className="flex cursor-pointer flex-col items-center gap-2">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- local file preview
          <img src={previewUrl} alt={label} className="h-32 w-32 rounded-md border border-slate-200 object-cover" />
        ) : (
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-nnm-blue shadow-sm">
            <Camera className="h-5 w-5" />
          </span>
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
      <input id={inputId} type="file" accept="image/jpeg,image/png" capture="environment" onChange={(e) => onChange(e.target.files?.[0] ?? null)} className="hidden" />
    </div>
  );
}

/** Loads a photo through the authenticated API and shows it in a dialog. */
export function PhotoDialog({ url, title, onClose }: { url: string; title: string; onClose: () => void }) {
  return (
    <div role="dialog" aria-label={title} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="max-h-full w-full max-w-3xl rounded-xl bg-white p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          <button onClick={onClose} className="rounded-md px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100">
            Close
          </button>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- blob URL from an authenticated fetch */}
        <img src={url} alt={title} className="max-h-[75vh] w-full rounded-md object-contain" />
      </div>
    </div>
  );
}
