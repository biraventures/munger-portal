"use client";

import { useEffect, useState } from "react";
import { Camera, Loader2, MapPin, Trash2 } from "lucide-react";
import { fieldReportPhotoUrl, fetchSurveyors, MAX_REPORT_PHOTOS, reportPhoto, type FieldReport, type FieldReportBody, type TaxSurveyor } from "@/lib/field-report";

const input = "w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-nnm-blue";
const label = "mb-1 block text-xs font-medium text-slate-600";

export interface FieldReportDraft {
  visitedOn: string;
  siteMatches: "" | "yes" | "no";
  measuredPlotAreaSqft: string;
  measuredBuiltupSqft: string;
  remarks: string;
  gps: { lat: number; lng: number } | null;
  photos: { base64: string; mimeType: string; preview: string }[];
}

export function blankFieldReport(): FieldReportDraft {
  const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  return { visitedOn: today, siteMatches: "", measuredPlotAreaSqft: "", measuredBuiltupSqft: "", remarks: "", gps: null, photos: [] };
}

/** Checks the draft; returns the request body, or a message saying what is missing. */
export function fieldReportBody(d: FieldReportDraft): FieldReportBody | string {
  if (!d.visitedOn) return "Enter the date of the site visit.";
  if (!d.siteMatches) return "Say whether the site matches the application.";
  if (d.remarks.trim().length < 10) return "Write the field report (at least a line on what was found at the site).";
  const n = (v: string) => (v.trim() ? Number(v) : null);
  return {
    visitedOn: d.visitedOn,
    siteMatches: d.siteMatches === "yes",
    measuredPlotAreaSqft: n(d.measuredPlotAreaSqft),
    measuredBuiltupSqft: n(d.measuredBuiltupSqft),
    remarks: d.remarks.trim(),
    latitude: d.gps?.lat ?? null,
    longitude: d.gps?.lng ?? null,
    photos: d.photos.map(({ base64, mimeType }) => ({ base64, mimeType })),
  };
}

/** Tax Surveyor: the field report form. */
export function FieldReportForm({ value, onChange, onError }: { value: FieldReportDraft; onChange: (d: FieldReportDraft) => void; onError: (m: string | null) => void }) {
  const [busy, setBusy] = useState(false);
  const set = (k: keyof FieldReportDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => onChange({ ...value, [k]: e.target.value });

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    setBusy(true);
    onError(null);
    try {
      const added = [];
      for (const f of Array.from(files).slice(0, MAX_REPORT_PHOTOS - value.photos.length)) added.push(await reportPhoto(f));
      onChange({ ...value, photos: [...value.photos, ...added] });
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not add the photo.");
    } finally {
      setBusy(false);
    }
  }

  function gps() {
    if (!navigator.geolocation) return onError("This device cannot give a GPS location.");
    navigator.geolocation.getCurrentPosition(
      (p) => onChange({ ...value, gps: { lat: p.coords.latitude, lng: p.coords.longitude } }),
      () => onError("Could not get the GPS location - allow location access and try in the open."),
      { enableHighAccuracy: true, timeout: 30000 },
    );
  }

  return (
    <div className="mb-4 space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold text-slate-900">Field report (required to forward)</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div>
          <label className={label}>Date of site visit</label>
          <input type="date" value={value.visitedOn} onChange={set("visitedOn")} className={input} />
        </div>
        <div>
          <label className={label}>Site matches the application?</label>
          <select value={value.siteMatches} onChange={set("siteMatches")} className={input}>
            <option value="">Select</option>
            <option value="yes">Yes</option>
            <option value="no">No - see remarks</option>
          </select>
        </div>
        <div>
          <label className={label}>Measured plot area (sq ft)</label>
          <input type="number" min="0" step="0.01" value={value.measuredPlotAreaSqft} onChange={set("measuredPlotAreaSqft")} className={input} />
        </div>
        <div>
          <label className={label}>Measured built-up area (sq ft)</label>
          <input type="number" min="0" step="0.01" value={value.measuredBuiltupSqft} onChange={set("measuredBuiltupSqft")} className={input} />
        </div>
      </div>
      <div>
        <label className={label}>Report - what was found at the site (owner / occupant, building, floors, use, boundaries)</label>
        <textarea value={value.remarks} onChange={set("remarks")} rows={4} maxLength={3000} className={input} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={gps} className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700">
          <MapPin className="h-3.5 w-3.5" />
          {value.gps ? `${value.gps.lat.toFixed(5)}, ${value.gps.lng.toFixed(5)}` : "Capture GPS at the site"}
        </button>
        {value.photos.length < MAX_REPORT_PHOTOS && (
          <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 ${busy ? "opacity-50" : ""}`}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
            Add site photo ({value.photos.length}/{MAX_REPORT_PHOTOS})
            <input
              type="file"
              accept="image/jpeg,image/png"
              capture="environment"
              multiple
              className="hidden"
              onChange={(e) => {
                addPhotos(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        )}
      </div>
      {value.photos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.photos.map((p, i) => (
            <div key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.preview} alt={`Site photo ${i + 1}`} className="h-20 w-28 rounded border border-slate-200 object-cover" />
              <button
                type="button"
                onClick={() => onChange({ ...value, photos: value.photos.filter((_, j) => j !== i) })}
                className="absolute right-1 top-1 rounded bg-white/90 p-0.5 text-red-600"
                aria-label="Remove photo"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReportPhoto({ id }: { id: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | null = null;
    fieldReportPhotoUrl(id)
      .then((x) => {
        u = x;
        setUrl(x);
      })
      .catch(() => setUrl(null));
    return () => {
      if (u) URL.revokeObjectURL(u);
    };
  }, [id]);
  if (!url) return <div className="h-20 w-28 animate-pulse rounded bg-slate-100" />;
  return (
    <a href={url} target="_blank" rel="noreferrer">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="Site photo" className="h-20 w-28 rounded border border-slate-200 object-cover" />
    </a>
  );
}

/** The field report(s) on record. */
export function FieldReportList({ reports }: { reports: FieldReport[] }) {
  if (!reports.length) return null;
  return (
    <div className="space-y-3">
      {reports.map((r) => (
        <div key={r.id} className={`rounded-lg border p-3 text-sm ${r.site_matches ? "border-green-200 bg-green-50/40" : "border-red-300 bg-red-50"}`}>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <b className="text-slate-900">Field report - {r.surveyor_name}</b>
            <span className="text-xs text-slate-500">visited {new Date(r.visited_on).toLocaleDateString("en-IN")}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.site_matches ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
              {r.site_matches ? "Site matches" : "Site does not match"}
            </span>
          </div>
          <p className="whitespace-pre-wrap text-slate-800">{r.remarks}</p>
          <p className="mt-1 text-xs text-slate-600">
            {r.measured_plot_area_sqft ? `Measured plot ${Number(r.measured_plot_area_sqft).toLocaleString("en-IN")} sq ft. ` : ""}
            {r.measured_builtup_sqft ? `Measured built-up ${Number(r.measured_builtup_sqft).toLocaleString("en-IN")} sq ft. ` : ""}
            {r.latitude && r.longitude ? (
              <a href={`https://www.google.com/maps?q=${r.latitude},${r.longitude}`} target="_blank" rel="noreferrer" className="text-nnm-blue hover:underline">
                GPS {Number(r.latitude).toFixed(5)}, {Number(r.longitude).toFixed(5)}
              </a>
            ) : null}
          </p>
          {r.photo_ids.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {r.photo_ids.map((p) => (
                <ReportPhoto key={p} id={p} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Tax Daroga: picks the Tax Surveyor for the field report. */
export function SurveyorSelect({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  const [list, setList] = useState<TaxSurveyor[] | null>(null);
  useEffect(() => {
    fetchSurveyors()
      .then(setList)
      .catch(() => setList([]));
  }, []);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={className ?? input}>
      <option value="">{list === null ? "Loading…" : list.length ? "Choose the Tax Surveyor" : "No Tax Surveyor login found"}</option>
      {(list ?? []).map((s) => (
        <option key={s.username} value={s.username}>
          {s.displayName}
        </option>
      ))}
    </select>
  );
}
