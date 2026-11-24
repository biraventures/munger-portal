"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, Loader2, MapPin } from "lucide-react";

const inputClass = "w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue";
const labelClass = "mb-1 block text-xs font-medium text-slate-600";

function todayIst(): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

export interface LocationReport {
  wardId: number;
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  landmark: string;
  nonFunctionalSince: string;
  remarks: string | null;
}

/**
 * For a citizen who cannot find the streetlight / submersible in the list: they stand at it, capture its GPS location
 * and describe the spot. The responsible officer identifies the registered asset there when verifying the complaint.
 * `extra` holds the asset-specific questions; `extraProblem` says what is still missing in them.
 */
export function ReportByLocation({
  what,
  loadWards,
  defaultWardId,
  extra,
  extraProblem,
  send,
  onSent,
}: {
  /** "streetlight / High Mast" or "submersible". */
  what: string;
  loadWards: () => Promise<{ id: number; name: string }[]>;
  defaultWardId: number | null;
  extra: ReactNode;
  extraProblem: () => string | null;
  send: (r: LocationReport) => Promise<void>;
  onSent: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [wards, setWards] = useState<{ id: number; name: string }[]>([]);
  const [wardId, setWardId] = useState<string>(defaultWardId ? String(defaultWardId) : "");
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [landmark, setLandmark] = useState("");
  const [date, setDate] = useState(todayIst());
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open && !wards.length)
      loadWards()
        .then(setWards)
        .catch(() => undefined);
  }, [open, wards.length, loadWards]);

  function capture() {
    setErr(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) return setErr("This phone / browser cannot read the location.");
    setGpsBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setGps({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) });
        setGpsBusy(false);
      },
      (e) => {
        setGpsBusy(false);
        setErr(
          e.code === e.PERMISSION_DENIED
            ? "Location permission is blocked - allow location for this site in the browser settings, switch on GPS and try again."
            : "Could not read the location - switch on GPS, step outside and try again.",
        );
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  }

  async function submit() {
    setErr(null);
    if (!wardId) return setErr("Choose the ward.");
    if (!gps) return setErr(`Stand near the ${what} and press "Capture location".`);
    if (landmark.trim().length < 3) return setErr("Describe where it is - a landmark, the house or shop near it.");
    const p = extraProblem();
    if (p) return setErr(p);
    setBusy(true);
    try {
      await send({
        wardId: Number(wardId),
        latitude: gps.lat,
        longitude: gps.lng,
        accuracyM: gps.accuracy,
        landmark: landmark.trim(),
        nonFunctionalSince: date,
        remarks: remarks.trim() || null,
      });
      setOpen(false);
      setGps(null);
      setLandmark("");
      setRemarks("");
      onSent(
        `Thank you - your complaint has been sent with the location. The officer will find the ${what} there, verify it and then send it for repair. Follow it under "My reports".`,
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not send the report.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-dashed border-slate-300 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-slate-800">
          <MapPin className="h-4 w-4 text-nnm-blue" />
          Cannot find the {what} in the list? Report it by its location
        </span>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-100 px-4 py-4">
          <p className="text-xs text-slate-500">
            Stand next to the {what} and capture the location with your phone. You do not need its number - the officer will identify it
            from the location.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Ward</label>
              <select value={wardId} onChange={(e) => setWardId(e.target.value)} className={inputClass}>
                <option value="">Choose the ward</option>
                {wards.map((w) => (
                  <option key={w.id} value={w.id}>
                    {/^\s*ward/i.test(w.name) ? w.name : `Ward ${w.name}`}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Not working since</label>
              <input type="date" value={date} max={todayIst()} onChange={(e) => setDate(e.target.value)} className={inputClass} />
            </div>
          </div>
          <div className="rounded-md bg-slate-50 p-3">
            <button
              type="button"
              onClick={capture}
              disabled={gpsBusy}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-60"
            >
              {gpsBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
              {gps ? "Capture again" : "Capture location"}
            </button>
            {gps && (
              <p className="mt-2 text-xs text-green-700">
                ✓ {gps.lat.toFixed(6)}, {gps.lng.toFixed(6)} (within about {gps.accuracy} m) ·{" "}
                <a href={`https://www.google.com/maps?q=${gps.lat},${gps.lng}`} target="_blank" rel="noreferrer" className="underline">
                  check on map
                </a>
                {gps.accuracy > 50 && (
                  <span className="block text-amber-700">Not precise - wait a few seconds in the open and capture again.</span>
                )}
              </p>
            )}
          </div>
          <div>
            <label className={labelClass}>Where is it? (landmark, the house / shop near it)</label>
            <input value={landmark} onChange={(e) => setLandmark(e.target.value)} maxLength={300} className={inputClass} />
          </div>
          {extra}
          <div>
            <label className={labelClass}>Anything else (optional)</label>
            <input value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={500} className={inputClass} />
          </div>
          {err && <p className="text-xs text-red-700">{err}</p>}
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Send report
          </button>
        </div>
      )}
    </div>
  );
}
