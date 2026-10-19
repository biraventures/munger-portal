"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Plus, Trash2, Upload } from "lucide-react";
import {
  DOC_TYPES,
  fyOptions,
  OWNERSHIP_BASIS,
  removeDocument,
  ROAD_TYPES,
  SURVEY_WARDS,
  uploadDocument,
  WARDS,
  type ApplicantRequest,
  type DocSession,
  type FloorInput,
  type RequestBody,
  type UploadedDoc,
} from "@/lib/new-holding-api";
import { formatBytes, isPdfFile, MAX_PDF_BYTES } from "@/lib/upload-limits";

export const inputClass = "w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue disabled:bg-slate-100";
export const labelClass = "mb-1 block text-xs font-medium text-slate-600";
export const cardClass = "rounded-xl border border-slate-200 bg-white p-5 sm:p-6";

export const FLOOR_LABELS: { value: string; label: string }[] = [
  { value: "Basement - B", label: "Basement" },
  { value: "Ground Floor - 0", label: "Ground floor" },
  { value: "First Floor - 1", label: "1st floor" },
  { value: "Second Floor - 2", label: "2nd floor" },
  { value: "Third Floor - 3", label: "3rd floor" },
  { value: "Fourth Floor - 4", label: "4th floor" },
  { value: "Fifth Floor - 5", label: "5th floor" },
  { value: "Sixth Floor - 6", label: "6th floor" },
  { value: "Seventh Floor - 7", label: "7th floor" },
  { value: "Eighth Floor - 8", label: "8th floor" },
];

export interface FloorState {
  key: string;
  floorLabel: string;
  buildupSqft: string;
  constType: "RCC" | "Asbestos" | "Other";
  usageType: string;
  occupancy: "self" | "rented";
  yearBuilt: string;
}

export interface FormState {
  ownerName: string;
  relationType: string;
  relationName: string;
  ownerMobile: string;
  ownerAadhaar: string;
  ownerEmail: string;
  applicantIsOwner: boolean;
  applicantName: string;
  applicantMobile: string;
  address: string;
  landmark: string;
  ward: string;
  pincode: string;
  ownershipBasis: string;
  khataNo: string;
  khesraNo: string;
  surveySheetNo: string;
  surveyWard: string;
  plotAreaSqft: string;
  roadType: "" | "PMR" | "MR" | "OR";
  rainWaterHarvesting: boolean;
  constructionYear: string;
  floors: FloorState[];
}

let floorSeq = 0;
export function blankFloor(i: number): FloorState {
  floorSeq += 1;
  return { key: `f${Date.now()}-${floorSeq}`, floorLabel: FLOOR_LABELS[Math.min(i + 1, FLOOR_LABELS.length - 1)]!.value, buildupSqft: "", constType: "RCC", usageType: "", occupancy: "self", yearBuilt: "" };
}

/** The floor above the highest one entered that is still free (the basement only when every other floor is taken). */
export function nextFloorLabel(used: string[]): string {
  const idx = used.map((u) => FLOOR_LABELS.findIndex((l) => l.value === u));
  const free = FLOOR_LABELS.map((l, i) => ({ l, i })).filter((x) => !used.includes(x.l.value));
  const above = free.find((x) => x.i > Math.max(0, ...idx));
  return (above ?? free[0] ?? { l: FLOOR_LABELS[1]! }).l.value;
}

export function blankForm(): FormState {
  return {
    ownerName: "",
    relationType: "",
    relationName: "",
    ownerMobile: "",
    ownerAadhaar: "",
    ownerEmail: "",
    applicantIsOwner: true,
    applicantName: "",
    applicantMobile: "",
    address: "",
    landmark: "",
    ward: "",
    pincode: "",
    ownershipBasis: "",
    khataNo: "",
    khesraNo: "",
    surveySheetNo: "",
    surveyWard: "",
    plotAreaSqft: "",
    roadType: "",
    rainWaterHarvesting: false,
    constructionYear: "",
    floors: [{ ...blankFloor(-1), floorLabel: "Ground Floor - 0" }],
  };
}

export function formFromRequest(r: ApplicantRequest): FormState {
  const same = r.applicantName === r.ownerName && r.applicantMobile === r.ownerMobile;
  return {
    ownerName: r.ownerName,
    relationType: r.relationType ?? "",
    relationName: r.relationName ?? "",
    ownerMobile: r.ownerMobile,
    ownerAadhaar: "",
    ownerEmail: r.ownerEmail ?? "",
    applicantIsOwner: same,
    applicantName: same ? "" : r.applicantName,
    applicantMobile: same ? "" : r.applicantMobile,
    address: r.address,
    landmark: r.landmark ?? "",
    ward: r.ward,
    pincode: r.pincode ?? "",
    ownershipBasis: r.ownershipBasis,
    khataNo: r.khataNo ?? "",
    khesraNo: r.khesraNo ?? "",
    surveySheetNo: r.surveySheetNo ?? "",
    surveyWard: r.surveyWard ?? "",
    plotAreaSqft: String(Number(r.plotAreaSqft)),
    roadType: r.roadType,
    rainWaterHarvesting: r.rainWaterHarvesting,
    constructionYear: r.constructionYear,
    floors: r.floors.map((f, i) => ({ ...blankFloor(i), floorLabel: f.floorLabel, buildupSqft: String(f.buildupSqft), constType: f.constType, usageType: f.usageType, occupancy: f.occupancy, yearBuilt: f.yearBuilt ?? "" })),
  };
}

const cleanMobile = (m: string) => m.replace(/[\s-]/g, "").replace(/^(\+91|91|0)(?=\d{10}$)/, "");

/** Checks the form and builds the request body; returns an error message instead when something is missing. */
/** The owner / applicant part only (first step of the form). */
export function ownerError(f: FormState, opts: { aadhaarRequired: boolean }): string | null {
  if (f.ownerName.trim().length < 2) return "Enter the owner's name.";
  if (!/^[6-9]\d{9}$/.test(cleanMobile(f.ownerMobile))) return "Enter the owner's 10-digit mobile number.";
  const aadhaar = f.ownerAadhaar.replace(/\s/g, "");
  if (opts.aadhaarRequired && !aadhaar) return "Enter the owner's Aadhaar number.";
  if (aadhaar && !/^\d{12}$/.test(aadhaar)) return "The Aadhaar number must be 12 digits.";
  const applicantName = f.applicantIsOwner ? f.ownerName : f.applicantName;
  const applicantMobile = f.applicantIsOwner ? f.ownerMobile : f.applicantMobile;
  if (applicantName.trim().length < 2 || !/^[6-9]\d{9}$/.test(cleanMobile(applicantMobile))) return "Enter the applicant's name and 10-digit mobile number.";
  return null;
}

export function bodyFromForm(f: FormState, opts: { aadhaarRequired: boolean }): RequestBody | string {
  const ownerProblem = ownerError(f, opts);
  if (ownerProblem) return ownerProblem;
  const aadhaar = f.ownerAadhaar.replace(/\s/g, "");
  const applicantName = f.applicantIsOwner ? f.ownerName : f.applicantName;
  const applicantMobile = f.applicantIsOwner ? f.ownerMobile : f.applicantMobile;
  if (f.address.trim().length < 5) return "Enter the full address of the property.";
  if (!f.ward) return "Choose the ward.";
  if (f.pincode && !/^\d{6}$/.test(f.pincode.trim())) return "The PIN code must be 6 digits.";
  if (!f.ownershipBasis) return "Choose how the land is owned.";
  const plot = Number(f.plotAreaSqft);
  if (!(plot > 0)) return "Enter the area of the plot in sq ft.";
  if (!f.roadType) return "Choose the type of road in front of the property.";
  if (!f.constructionYear) return "Choose the year of construction of the building.";
  if (!f.floors.length) return "Add at least one floor.";
  for (const fl of f.floors) {
    const name = FLOOR_LABELS.find((l) => l.value === fl.floorLabel)?.label ?? "floor";
    if (!(Number(fl.buildupSqft) > 0)) return `Enter the built-up area of the ${name}.`;
    if (!fl.usageType) return `Choose the use of the ${name}.`;
  }
  const labels = f.floors.map((x) => x.floorLabel);
  if (new Set(labels).size !== labels.length) return "Each floor can be entered only once.";
  return {
    ownerName: f.ownerName.trim(),
    relationType: f.relationType || null,
    relationName: f.relationName.trim() || null,
    ownerMobile: cleanMobile(f.ownerMobile),
    ownerAadhaar: aadhaar || null,
    ownerEmail: f.ownerEmail.trim() || null,
    applicantName: applicantName.trim(),
    applicantMobile: cleanMobile(applicantMobile),
    address: f.address.trim(),
    landmark: f.landmark.trim() || null,
    ward: f.ward,
    pincode: f.pincode.trim() || null,
    ownershipBasis: f.ownershipBasis,
    khataNo: f.khataNo.trim() || null,
    khesraNo: f.khesraNo.trim() || null,
    surveySheetNo: f.surveySheetNo.trim() || null,
    surveyWard: f.surveyWard || null,
    plotAreaSqft: plot,
    roadType: f.roadType,
    rainWaterHarvesting: f.rainWaterHarvesting,
    constructionYear: f.constructionYear,
    floors: f.floors.map(
      (x): FloorInput => ({ floorLabel: x.floorLabel, buildupSqft: Number(x.buildupSqft), constType: x.constType, usageType: x.usageType, occupancy: x.occupancy, yearBuilt: x.yearBuilt || null }),
    ),
  };
}

type SetForm = (updater: (prev: FormState) => FormState) => void;

export function OwnerApplicantFields({ f, setF, aadhaarMasked }: { f: FormState; setF: SetForm; aadhaarMasked?: string }) {
  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  return (
    <>
      <div className={cardClass}>
        <h2 className="mb-4 text-base font-semibold text-slate-900">Owner of the property</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass}>Name of the owner</label>
            <input value={f.ownerName} onChange={set("ownerName")} maxLength={255} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Relation (optional)</label>
            <select value={f.relationType} onChange={set("relationType")} className={inputClass}>
              <option value="">—</option>
              <option value="S/O">Son of (S/O)</option>
              <option value="D/O">Daughter of (D/O)</option>
              <option value="W/O">Wife of (W/O)</option>
              <option value="C/O">Care of (C/O)</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Father&apos;s / husband&apos;s name (optional)</label>
            <input value={f.relationName} onChange={set("relationName")} maxLength={255} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Mobile number of the owner</label>
            <input value={f.ownerMobile} onChange={set("ownerMobile")} inputMode="tel" maxLength={14} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Aadhaar number of the owner</label>
            <input value={f.ownerAadhaar} onChange={set("ownerAadhaar")} inputMode="numeric" maxLength={14} placeholder={aadhaarMasked ? `${aadhaarMasked} (leave blank to keep)` : ""} className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Email of the owner (optional)</label>
            <input type="email" value={f.ownerEmail} onChange={set("ownerEmail")} maxLength={120} className={inputClass} />
          </div>
        </div>
      </div>

      <div className={cardClass}>
        <h2 className="mb-4 text-base font-semibold text-slate-900">Applicant</h2>
        <label className="mb-3 flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={f.applicantIsOwner} onChange={(e) => setF((p) => ({ ...p, applicantIsOwner: e.target.checked }))} />
          The owner is applying
        </label>
        {!f.applicantIsOwner && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Name of the applicant</label>
              <input value={f.applicantName} onChange={set("applicantName")} maxLength={255} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Mobile number of the applicant</label>
              <input value={f.applicantMobile} onChange={set("applicantMobile")} inputMode="tel" maxLength={14} className={inputClass} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export function PropertyFields({ f, setF, usageTypes }: { f: FormState; setF: SetForm; usageTypes: string[] }) {
  const years = fyOptions(1950);
  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  const setFloor = (key: string, patch: Partial<FloorState>) => setF((p) => ({ ...p, floors: p.floors.map((x) => (x.key === key ? { ...x, ...patch } : x)) }));
  const totalBuilt = f.floors.reduce((s, x) => s + (Number(x.buildupSqft) || 0), 0);
  return (
    <>
      <div className={cardClass}>
        <h2 className="mb-4 text-base font-semibold text-slate-900">Location of the property</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass}>Full address (house / mohalla / road)</label>
            <textarea value={f.address} onChange={set("address")} rows={2} maxLength={500} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Landmark (optional)</label>
            <input value={f.landmark} onChange={set("landmark")} maxLength={255} className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Ward</label>
              <select value={f.ward} onChange={set("ward")} className={inputClass}>
                <option value="">Select</option>
                {WARDS.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>PIN code</label>
              <input value={f.pincode} onChange={set("pincode")} inputMode="numeric" maxLength={6} className={inputClass} />
            </div>
          </div>
        </div>
      </div>

      <div className={cardClass}>
        <h2 className="mb-4 text-base font-semibold text-slate-900">Land</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>How is the land owned?</label>
            <select value={f.ownershipBasis} onChange={set("ownershipBasis")} className={inputClass}>
              <option value="">Select</option>
              {OWNERSHIP_BASIS.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Area of the plot (sq ft)</label>
            <input type="number" min="0" step="0.01" inputMode="decimal" value={f.plotAreaSqft} onChange={set("plotAreaSqft")} className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <p className="mb-2 text-xs text-slate-500">Land record details (from the jamabandi / khatian / sale deed, if you have them)</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <label className={labelClass}>Khata no.</label>
                <input value={f.khataNo} onChange={set("khataNo")} maxLength={64} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Khesra no.</label>
                <input value={f.khesraNo} onChange={set("khesraNo")} maxLength={64} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Survey sheet no.</label>
                <input value={f.surveySheetNo} onChange={set("surveySheetNo")} maxLength={64} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Survey ward</label>
                <select value={f.surveyWard} onChange={set("surveyWard")} className={inputClass}>
                  <option value="">—</option>
                  {SURVEY_WARDS.map((w) => (
                    <option key={w}>{w}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={cardClass}>
        <h2 className="mb-4 text-base font-semibold text-slate-900">Building</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Road in front of the property</label>
            <select value={f.roadType} onChange={set("roadType")} className={inputClass}>
              <option value="">Select</option>
              {ROAD_TYPES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Year of construction of the building</label>
            <select value={f.constructionYear} onChange={set("constructionYear")} className={inputClass}>
              <option value="">Select</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
            <input type="checkbox" checked={f.rainWaterHarvesting} onChange={(e) => setF((p) => ({ ...p, rainWaterHarvesting: e.target.checked }))} />
            Rain water harvesting is installed
          </label>
        </div>

        <h3 className="mb-2 mt-5 text-sm font-semibold text-slate-800">Floors</h3>
        <div className="space-y-3">
          {f.floors.map((fl) => (
            <div key={fl.key} className="rounded-lg border border-slate-200 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <select value={fl.floorLabel} onChange={(e) => setFloor(fl.key, { floorLabel: e.target.value })} className={`${inputClass} max-w-[200px] font-medium`}>
                  {FLOOR_LABELS.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
                {f.floors.length > 1 && (
                  <button type="button" onClick={() => setF((p) => ({ ...p, floors: p.floors.filter((x) => x.key !== fl.key) }))} className="rounded-md p-1.5 text-red-500 hover:bg-red-50" aria-label="Remove floor">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div>
                  <label className={labelClass}>Built-up area (sq ft)</label>
                  <input type="number" min="0" step="0.01" inputMode="decimal" value={fl.buildupSqft} onChange={(e) => setFloor(fl.key, { buildupSqft: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Construction</label>
                  <select value={fl.constType} onChange={(e) => setFloor(fl.key, { constType: e.target.value as FloorState["constType"] })} className={inputClass}>
                    <option value="RCC">Pucca (RCC roof)</option>
                    <option value="Asbestos">Asbestos / tin roof</option>
                    <option value="Other">Other (kutcha etc.)</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Occupied by</label>
                  <select value={fl.occupancy} onChange={(e) => setFloor(fl.key, { occupancy: e.target.value as FloorState["occupancy"] })} className={inputClass}>
                    <option value="self">Owner (self)</option>
                    <option value="rented">Tenant (rented)</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className={labelClass}>Use of this floor</label>
                  <select value={fl.usageType} onChange={(e) => setFloor(fl.key, { usageType: e.target.value })} className={inputClass}>
                    <option value="">Select</option>
                    {usageTypes.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Built in (if later)</label>
                  <select value={fl.yearBuilt} onChange={(e) => setFloor(fl.key, { yearBuilt: e.target.value })} className={inputClass}>
                    <option value="">Same as building</option>
                    {years.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setF((p) => ({ ...p, floors: [...p.floors, { ...blankFloor(0), floorLabel: nextFloorLabel(p.floors.map((x) => x.floorLabel)) }] }))}
            disabled={f.floors.length >= 10}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Add a floor
          </button>
          <span className="text-xs text-slate-500">Total built-up area: {totalBuilt.toLocaleString("en-IN")} sq ft</span>
        </div>
      </div>
    </>
  );
}

/** Upload slots for every document type; works for a draft (upload token) and for a request being corrected (edit token). */
export function DocumentsSection({
  session,
  docs,
  setDocs,
  onError,
  disabled,
}: {
  session: DocSession;
  docs: UploadedDoc[];
  setDocs: (updater: (prev: UploadedDoc[]) => UploadedDoc[]) => void;
  onError: (msg: string | null) => void;
  disabled?: boolean;
}) {
  const [uploading, setUploading] = useState<{ type: string; pct: number } | null>(null);
  const [otherLabels, setOtherLabels] = useState<Record<string, string>>({ other_1: "", other_2: "" });

  async function onPick(type: string, files: FileList | null) {
    if (!files?.length) return;
    onError(null);
    for (const file of Array.from(files)) {
      if (isPdfFile(file) && file.size > MAX_PDF_BYTES) {
        onError(`${file.name} is ${formatBytes(file.size)} - a PDF can be at most 2 MB. Scan it at a lower resolution or in black and white.`);
        continue;
      }
      setUploading({ type, pct: 0 });
      try {
        const d = await uploadDocument(session, type, file, (pct) => setUploading({ type, pct }), otherLabels[type] || undefined);
        setDocs((prev) => [...prev, d]);
      } catch (err) {
        onError(err instanceof Error ? err.message : "Upload failed.");
      } finally {
        setUploading(null);
      }
    }
  }

  async function onRemove(docId: string) {
    try {
      await removeDocument(session, docId);
      setDocs((prev) => prev.filter((d) => d.id !== docId));
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not remove the file.");
    }
  }

  return (
    <div className="divide-y divide-slate-100">
      {DOC_TYPES.map((spec) => {
        const mine = docs.filter((d) => d.doc_type === spec.type);
        return (
          <div key={spec.type} className="py-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-[220px] flex-1">
                <div className="text-sm font-medium text-slate-900">
                  {spec.label}
                  {spec.required && <span className="text-red-600"> *</span>}
                  {mine.length > 0 && <CheckCircle2 className="ml-1 inline h-4 w-4 text-green-600" />}
                </div>
                {spec.hint && <div className="text-xs text-slate-500">{spec.hint}</div>}
                {spec.named && !disabled && (
                  <input
                    value={otherLabels[spec.type] ?? ""}
                    onChange={(e) => setOtherLabels({ ...otherLabels, [spec.type]: e.target.value })}
                    placeholder="Name of the document (e.g. mutation order)"
                    maxLength={100}
                    className="mt-1.5 w-full max-w-xs rounded-md border border-slate-300 px-2 py-1 text-xs"
                  />
                )}
              </div>
              {!disabled && (
                <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 ${uploading ? "pointer-events-none opacity-50" : ""}`}>
                  {uploading?.type === spec.type ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  {uploading?.type === spec.type ? `${uploading.pct}%` : mine.length ? "Add another" : "Upload"}
                  <input
                    type="file"
                    className="hidden"
                    multiple
                    accept={spec.photoOnly ? "image/jpeg,image/png" : "application/pdf,image/jpeg,image/png"}
                    onChange={(e) => {
                      onPick(spec.type, e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>
            {mine.map((d) => (
              <div key={d.id} className="mt-1 flex items-center gap-2 text-xs text-slate-600">
                <span className="truncate">
                  {d.given_label ? `${d.given_label} - ` : ""}
                  {d.file_name}
                </span>
                <span className="text-slate-400">{formatBytes(Number(d.size_bytes))}</span>
                {!disabled && (
                  <button type="button" onClick={() => onRemove(d.id)} className="text-red-600" aria-label="Remove">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function missingRequiredDocs(docs: UploadedDoc[]): string[] {
  return DOC_TYPES.filter((s) => s.required && !docs.some((d) => d.doc_type === s.type)).map((s) => s.label);
}
