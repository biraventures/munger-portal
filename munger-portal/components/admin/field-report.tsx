"use client";

import { useEffect, useState } from "react";
import { surveyorOfWard } from "@/lib/admin-api";
import { Camera, Loader2, MapPin, Trash2 } from "lucide-react";
import {
  fieldReportPhotoUrl,
  fetchSurveyors,
  HOLDING_OWNER_PHOTOS,
  MAX_REPORT_PHOTOS,
  reportPhoto,
  SELF_ASSESSMENT_PAGES,
  type FieldReport,
  type FieldReportBody,
  type TaxSurveyor,
} from "@/lib/field-report";

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
  /** New holding only. */
  selfAssessment: "" | "yes" | "no";
  formPages: ({ base64: string; mimeType: string; preview: string } | null)[];
  ownerPhotos: ({ base64: string; mimeType: string; preview: string } | null)[];
}
type Shot = { base64: string; mimeType: string; preview: string };

export function blankFieldReport(): FieldReportDraft {
  const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  return {
    visitedOn: today,
    siteMatches: "",
    measuredPlotAreaSqft: "",
    measuredBuiltupSqft: "",
    remarks: "",
    gps: null,
    photos: [],
    selfAssessment: "",
    formPages: Array(SELF_ASSESSMENT_PAGES).fill(null),
    ownerPhotos: Array(HOLDING_OWNER_PHOTOS).fill(null),
  };
}

/** Checks the draft; returns the request body, or a message saying what is missing. */
export function fieldReportBody(d: FieldReportDraft, newHolding = false): FieldReportBody | string {
  if (!d.visitedOn) return "Enter the date of the site visit.";
  if (!d.siteMatches) return "Say whether the site matches the application.";
  if (newHolding) {
    if (!d.selfAssessment) return "Say whether all the details in the applicant's self-assessment form are correct.";
    const missingPage = d.formPages.findIndex((p) => !p);
    if (missingPage >= 0) return `Take the photo of page ${missingPage + 1} of the self-assessment form.`;
    if (d.ownerPhotos.some((p) => !p)) return `Take both photos of the holding with its owner (${HOLDING_OWNER_PHOTOS} needed).`;
  }
  if (d.remarks.trim().length < 10) return "Write the field report (at least a line on what was found at the site).";
  if (newHolding && d.selfAssessment === "no" && d.remarks.trim().length < 20)
    return "Write in the report which details of the self-assessment form are wrong.";
  const n = (v: string) => (v.trim() ? Number(v) : null);
  const bare = (p: Shot | null) => ({ base64: p!.base64, mimeType: p!.mimeType });
  if (newHolding) {
    return {
      visitedOn: d.visitedOn,
      siteMatches: d.siteMatches === "yes",
      measuredPlotAreaSqft: n(d.measuredPlotAreaSqft),
      measuredBuiltupSqft: n(d.measuredBuiltupSqft),
      remarks: d.remarks.trim(),
      latitude: d.gps?.lat ?? null,
      longitude: d.gps?.lng ?? null,
      selfAssessmentCorrect: d.selfAssessment === "yes",
      formPagePhotos: d.formPages.map(bare),
      holdingOwnerPhotos: d.ownerPhotos.map(bare),
    };
  }
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
function ShotSlot({ label, shot, onTake, onClear }: { label: string; shot: Shot | null; onTake: (f: File) => void; onClear: () => void }) {
  return (
    <div
      className={`flex flex-col items-center gap-1 rounded-md border-2 border-dashed p-2 text-center ${shot ? "border-green-300 bg-green-50" : "border-nnm-blue/40 bg-blue-50/40"}`}
    >
      {shot ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={shot.preview} alt={label} className="h-20 w-full rounded object-cover" />
      ) : (
        <Camera className="h-6 w-6 text-nnm-blue" />
      )}
      <span className="text-xs font-semibold text-slate-700">{label}</span>
      <div className="flex gap-2">
        <label className="cursor-pointer text-xs font-semibold text-nnm-blue underline">
          {shot ? "Retake" : "Take photo"}
          <input
            type="file"
            accept="image/jpeg,image/png"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onTake(f);
              e.target.value = "";
            }}
          />
        </label>
        {shot && (
          <button type="button" onClick={onClear} className="text-xs font-semibold text-red-600" aria-label={`Remove ${label}`}>
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

export function FieldReportForm({
  value,
  onChange,
  onError,
  newHolding = false,
}: {
  value: FieldReportDraft;
  onChange: (d: FieldReportDraft) => void;
  onError: (m: string | null) => void;
  /** New holding request: self-assessment check, its 4 pages and 2 photos of the holding with its owner. */
  newHolding?: boolean;
}) {
  async function takeShot(which: "formPages" | "ownerPhotos", i: number, f: File) {
    onError(null);
    try {
      const shot = await reportPhoto(f);
      const list = [...value[which]];
      list[i] = shot;
      onChange({ ...value, [which]: list });
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not add the photo.");
    }
  }
  function clearShot(which: "formPages" | "ownerPhotos", i: number) {
    const list = [...value[which]];
    list[i] = null;
    onChange({ ...value, [which]: list });
  }
  const [busy, setBusy] = useState(false);
  const set = (k: keyof FieldReportDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    onChange({ ...value, [k]: e.target.value });

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
          <input
            type="number"
            min="0"
            step="0.01"
            value={value.measuredPlotAreaSqft}
            onChange={set("measuredPlotAreaSqft")}
            className={input}
          />
        </div>
        <div>
          <label className={label}>Measured built-up area (sq ft)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={value.measuredBuiltupSqft}
            onChange={set("measuredBuiltupSqft")}
            className={input}
          />
        </div>
      </div>
      {newHolding && (
        <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50/50 p-3">
          <div>
            <label className={label}>Are all the details in the self-assessment form filled by the applicant correct?</label>
            <select value={value.selfAssessment} onChange={set("selfAssessment")} className={input}>
              <option value="">Select</option>
              <option value="yes">Yes - all details are correct</option>
              <option value="no">No - write the wrong details in the report below</option>
            </select>
          </div>
          <div>
            <p className={label}>
              Photo of each page of the self-assessment form ({value.formPages.filter(Boolean).length}/{SELF_ASSESSMENT_PAGES})
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {value.formPages.map((p, i) => (
                <ShotSlot
                  key={i}
                  label={`Page ${i + 1}`}
                  shot={p}
                  onTake={(f) => takeShot("formPages", i, f)}
                  onClear={() => clearShot("formPages", i)}
                />
              ))}
            </div>
          </div>
          <div>
            <p className={label}>
              Photos of the holding with its owner ({value.ownerPhotos.filter(Boolean).length}/{HOLDING_OWNER_PHOTOS})
            </p>
            <div className="grid grid-cols-2 gap-2 sm:max-w-sm">
              {value.ownerPhotos.map((p, i) => (
                <ShotSlot
                  key={i}
                  label={`Holding with owner ${i + 1}`}
                  shot={p}
                  onTake={(f) => takeShot("ownerPhotos", i, f)}
                  onClear={() => clearShot("ownerPhotos", i)}
                />
              ))}
            </div>
          </div>
        </div>
      )}
      <div>
        <label className={label}>Report - what was found at the site (owner / occupant, building, floors, use, boundaries)</label>
        <textarea value={value.remarks} onChange={set("remarks")} rows={4} maxLength={3000} className={input} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={gps}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700"
        >
          <MapPin className="h-3.5 w-3.5" />
          {value.gps ? `${value.gps.lat.toFixed(5)}, ${value.gps.lng.toFixed(5)}` : "Capture GPS at the site"}
        </button>
        {!newHolding && value.photos.length < MAX_REPORT_PHOTOS && (
          <label
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 ${busy ? "opacity-50" : ""}`}
          >
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

function ReportPhoto({ id, caption }: { id: string; caption?: string }) {
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
    <figure>
      <a href={url} target="_blank" rel="noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={caption ?? "Site photo"} className="h-20 w-28 rounded border border-slate-200 object-cover" />
      </a>
      {caption && <figcaption className="mt-0.5 text-[11px] text-slate-500">{caption}</figcaption>}
    </figure>
  );
}

/** The field report(s) on record. */
export function FieldReportList({ reports }: { reports: FieldReport[] }) {
  if (!reports.length) return null;
  return (
    <div className="space-y-3">
      {reports.map((r) => (
        <div
          key={r.id}
          className={`rounded-lg border p-3 text-sm ${r.site_matches ? "border-green-200 bg-green-50/40" : "border-red-300 bg-red-50"}`}
        >
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <b className="text-slate-900">Field report - {r.surveyor_name}</b>
            <span className="text-xs text-slate-500">visited {new Date(r.visited_on).toLocaleDateString("en-IN")}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.site_matches ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}
            >
              {r.site_matches ? "Site matches" : "Site does not match"}
            </span>
          </div>
          <p className="whitespace-pre-wrap text-slate-800">{r.remarks}</p>
          <p className="mt-1 text-xs text-slate-600">
            {r.measured_plot_area_sqft ? `Measured plot ${Number(r.measured_plot_area_sqft).toLocaleString("en-IN")} sq ft. ` : ""}
            {r.measured_builtup_sqft ? `Measured built-up ${Number(r.measured_builtup_sqft).toLocaleString("en-IN")} sq ft. ` : ""}
            {r.latitude && r.longitude ? (
              <a
                href={`https://www.google.com/maps?q=${r.latitude},${r.longitude}`}
                target="_blank"
                rel="noreferrer"
                className="text-nnm-blue hover:underline"
              >
                GPS {Number(r.latitude).toFixed(5)}, {Number(r.longitude).toFixed(5)}
              </a>
            ) : null}
          </p>
          {r.self_assessment_correct !== null && r.self_assessment_correct !== undefined && (
            <p className={`mt-1 text-xs font-semibold ${r.self_assessment_correct ? "text-green-800" : "text-red-700"}`}>
              Self-assessment form: {r.self_assessment_correct ? "all details correct" : "details NOT correct - see report"}
            </p>
          )}
          {(r.photos?.length ?? r.photo_ids.length) > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {r.photos
                ? r.photos.map((p) => (
                    <ReportPhoto
                      key={p.id}
                      id={p.id}
                      caption={
                        p.kind === "sa_form" ? `Form page ${p.page_no}` : p.kind === "holding_owner" ? "Holding with owner" : undefined
                      }
                    />
                  ))
                : r.photo_ids.map((p) => <ReportPhoto key={p} id={p} />)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Tax Daroga: picks the Tax Surveyor for the field report. */
/**
 * Tax Surveyor picker. Given the holding's `ward`, the surveyor the Municipal Commissioner assigned to that ward is
 * selected automatically (the Tax Daroga can still choose another).
 */
export function SurveyorSelect({
  value,
  onChange,
  className,
  ward,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  ward?: string | null;
}) {
  const [list, setList] = useState<TaxSurveyor[] | null>(null);
  useEffect(() => {
    fetchSurveyors()
      .then(setList)
      .catch(() => setList([]));
  }, []);
  const wardSurveyor = list ? surveyorOfWard(list, ward) : undefined;
  useEffect(() => {
    if (!value && wardSurveyor) onChange(wardSurveyor.username);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wardSurveyor?.username]);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={className ?? input}>
      <option value="">{list === null ? "Loading…" : list.length ? "Choose the Tax Surveyor" : "No Tax Surveyor login found"}</option>
      {(list ?? []).map((s) => (
        <option key={s.username} value={s.username}>
          {s.displayName}
          {s.wards?.length ? ` - Ward ${s.wards.join(", ")}` : ""}
          {wardSurveyor?.username === s.username ? " (this ward)" : ""}
        </option>
      ))}
    </select>
  );
}
