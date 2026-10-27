"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, FileText, Loader2, Plus, Trash2, Upload } from "lucide-react";
import {
  APPLICANT_DOCS,
  computeFees,
  createApplication,
  removeApplicantDocument,
  rupees,
  submitApplication,
  updateApplication,
  uploadApplicantDocument,
  USE_TYPES,
  type ApplicationDetails,
  type BpDocSpec,
  type UploadedDoc,
} from "@/lib/building-permit-api";
import { DEFAULT_FLOORS, type CalculatorFigures } from "./fee-calculator";

const inputClass = "w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue";
const labelClass = "mb-1 block text-xs font-medium text-slate-600";
const cardClass = "rounded-xl border border-slate-200 bg-white p-5 sm:p-6";
const WARDS = Array.from({ length: 45 }, (_, i) => String(i + 1));

type FormState = Omit<ApplicationDetails, "plotAreaSqm" | "floors"> & { plotAreaSqm: string; floors: { floor: string; areaSqm: string }[] };

function blank(prefill?: CalculatorFigures | null): FormState {
  return {
    applicantName: "",
    relationName: "",
    mobile: "",
    email: "",
    applicantAddress: "",
    aadhaarNo: "",
    panNo: "",
    holdingNo: "",
    ward: "",
    mauza: "",
    thanaNo: "",
    khataNo: "",
    khesraNo: "",
    siteAddress: "",
    plotAreaSqm: prefill ? String(prefill.plotAreaSqm) : "",
    useType: prefill?.useType ?? "residential",
    floors: prefill?.floors.length ? prefill.floors.map((f) => ({ floor: f.floor, areaSqm: String(f.areaSqm) })) : [{ floor: "Ground floor", areaSqm: "" }],
    architectName: "",
    architectRegNo: "",
    architectMobile: "",
  };
}

function fromDetails(d: ApplicationDetails): FormState {
  const s = (v: string | null | undefined) => v ?? "";
  return {
    ...d,
    relationName: s(d.relationName),
    email: s(d.email),
    panNo: s(d.panNo),
    holdingNo: s(d.holdingNo),
    mauza: s(d.mauza),
    thanaNo: s(d.thanaNo),
    architectMobile: s(d.architectMobile),
    plotAreaSqm: String(d.plotAreaSqm),
    floors: d.floors.map((f) => ({ floor: f.floor, areaSqm: String(f.areaSqm) })),
  };
}

function toDetails(f: FormState): ApplicationDetails {
  return { ...f, plotAreaSqm: Number(f.plotAreaSqm) || 0, floors: f.floors.map((x) => ({ floor: x.floor, areaSqm: Number(x.areaSqm) || 0 })) };
}

export interface ExistingApplication {
  applicationId: string;
  token: string;
  details: ApplicationDetails;
  documents: UploadedDoc[];
}

/**
 * Step 1 details -> step 2 documents -> submit. Used for a new application, and (with `existing`) to correct an
 * application the office returned.
 */
export function ApplicationForm({
  prefill,
  existing,
  onSubmitted,
}: {
  prefill?: CalculatorFigures | null;
  existing?: ExistingApplication;
  onSubmitted: (r: { applicationNo: string; resubmitted: boolean }) => void;
}) {
  const [form, setForm] = useState<FormState>(existing ? fromDetails(existing.details) : blank(prefill));
  const [step, setStep] = useState<1 | 2>(1);
  const [app, setApp] = useState<{ id: string; token: string } | null>(existing ? { id: existing.applicationId, token: existing.token } : null);
  const [docs, setDocs] = useState<UploadedDoc[]>(existing?.documents ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<Record<string, number>>({});
  const [docError, setDocError] = useState<Record<string, string>>({});

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });
  const builtUp = Math.round(form.floors.reduce((t, f) => t + (Number(f.areaSqm) || 0), 0) * 100) / 100;
  const fees = computeFees(form.useType, Number(form.plotAreaSqm) || 0, builtUp);

  async function saveDetails(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const d = toDetails(form);
      if (app) await updateApplication(app.id, app.token, d);
      else {
        const r = await createApplication(d);
        setApp({ id: r.applicationId, token: r.uploadToken });
      }
      setStep(2);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  async function upload(spec: BpDocSpec, file: File) {
    if (!app) return;
    setDocError({ ...docError, [spec.type]: "" });
    setUploading((u) => ({ ...u, [spec.type]: 0 }));
    try {
      const d = await uploadApplicantDocument(app.id, app.token, spec, file, (p) => setUploading((u) => ({ ...u, [spec.type]: p })));
      setDocs((ds) => [...ds, d]);
    } catch (err) {
      setDocError((x) => ({ ...x, [spec.type]: err instanceof Error ? err.message : "Upload failed." }));
    } finally {
      setUploading((u) => {
        const n = { ...u };
        delete n[spec.type];
        return n;
      });
    }
  }

  async function remove(d: UploadedDoc) {
    if (!app) return;
    try {
      await removeApplicantDocument(app.id, app.token, d.id);
      setDocs((ds) => ds.filter((x) => x.id !== d.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove.");
    }
  }

  async function submit() {
    if (!app) return;
    setError(null);
    setBusy(true);
    try {
      const r = await submitApplication(app.id, app.token);
      onSubmitted({ applicationNo: r.applicationNo, resubmitted: !!existing });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit.");
    } finally {
      setBusy(false);
    }
  }

  const missing = APPLICANT_DOCS.filter((s) => s.required && !docs.some((d) => d.doc_type === s.type));

  return (
    <div className="space-y-5">
      <ol className="flex gap-2 text-xs font-semibold">
        {["Details", "Documents & submit"].map((t, i) => (
          <li key={t} className={`flex-1 rounded-md px-3 py-2 text-center ${step === i + 1 ? "bg-nnm-blue text-white" : "bg-slate-100 text-slate-500"}`}>
            {i + 1}. {t}
          </li>
        ))}
      </ol>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {step === 1 && (
        <form onSubmit={saveDetails} className="space-y-5">
          <section className={cardClass}>
            <h3 className="mb-4 text-sm font-semibold text-slate-800">Applicant</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="bp-name" className={labelClass}>Name of applicant *</label>
                <input id="bp-name" value={form.applicantName} onChange={set("applicantName")} className={inputClass} required />
              </div>
              <div>
                <label htmlFor="bp-rel" className={labelClass}>Father&apos;s / husband&apos;s name</label>
                <input id="bp-rel" value={form.relationName} onChange={set("relationName")} className={inputClass} />
              </div>
              <div>
                <label htmlFor="bp-mobile" className={labelClass}>Mobile number *</label>
                <input
                  id="bp-mobile"
                  inputMode="numeric"
                  value={form.mobile}
                  onChange={(e) => setForm({ ...form, mobile: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                  className={inputClass}
                  required
                  readOnly={!!existing}
                />
                <p className="mt-1 text-xs text-slate-500">Needed with the application number to track the application.</p>
              </div>
              <div>
                <label htmlFor="bp-email" className={labelClass}>Email</label>
                <input id="bp-email" type="email" value={form.email} onChange={set("email")} className={inputClass} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="bp-addr" className={labelClass}>Address of applicant *</label>
                <textarea id="bp-addr" rows={2} value={form.applicantAddress} onChange={set("applicantAddress")} className={inputClass} required />
              </div>
              <div>
                <label htmlFor="bp-aadhaar" className={labelClass}>Aadhaar number *</label>
                <input
                  id="bp-aadhaar"
                  inputMode="numeric"
                  value={form.aadhaarNo}
                  onChange={(e) => setForm({ ...form, aadhaarNo: e.target.value.replace(/\D/g, "").slice(0, 12) })}
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <label htmlFor="bp-pan" className={labelClass}>PAN</label>
                <input id="bp-pan" value={form.panNo} onChange={(e) => setForm({ ...form, panNo: e.target.value.toUpperCase().slice(0, 10) })} className={inputClass} />
              </div>
            </div>
          </section>

          <section className={cardClass}>
            <h3 className="mb-4 text-sm font-semibold text-slate-800">Site / plot</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="bp-ward" className={labelClass}>Ward *</label>
                <select id="bp-ward" value={form.ward} onChange={set("ward")} className={inputClass} required>
                  <option value="">Select ward</option>
                  {WARDS.map((w) => (
                    <option key={w} value={w}>Ward {w}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="bp-holding" className={labelClass}>Holding number (if any)</label>
                <input id="bp-holding" value={form.holdingNo} onChange={(e) => setForm({ ...form, holdingNo: e.target.value.toUpperCase() })} className={inputClass} />
              </div>
              <div>
                <label htmlFor="bp-mauza" className={labelClass}>Mauza</label>
                <input id="bp-mauza" value={form.mauza} onChange={set("mauza")} className={inputClass} />
              </div>
              <div>
                <label htmlFor="bp-thana" className={labelClass}>Thana number</label>
                <input id="bp-thana" value={form.thanaNo} onChange={set("thanaNo")} className={inputClass} />
              </div>
              <div>
                <label htmlFor="bp-khata" className={labelClass}>Khata number *</label>
                <input id="bp-khata" value={form.khataNo} onChange={set("khataNo")} className={inputClass} required />
              </div>
              <div>
                <label htmlFor="bp-khesra" className={labelClass}>Khesra (plot) number *</label>
                <input id="bp-khesra" value={form.khesraNo} onChange={set("khesraNo")} className={inputClass} required />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="bp-site" className={labelClass}>Address of the site *</label>
                <textarea id="bp-site" rows={2} value={form.siteAddress} onChange={set("siteAddress")} className={inputClass} required />
              </div>
              <div>
                <label htmlFor="bp-plot" className={labelClass}>Plot area (sq m) *</label>
                <input
                  id="bp-plot"
                  inputMode="decimal"
                  value={form.plotAreaSqm}
                  onChange={(e) => setForm({ ...form, plotAreaSqm: e.target.value.replace(/[^\d.]/g, "") })}
                  className={inputClass}
                  required
                />
              </div>
            </div>
          </section>

          <section className={cardClass}>
            <h3 className="mb-4 text-sm font-semibold text-slate-800">Proposed building</h3>
            <div className="mb-4">
              <label htmlFor="bp-use" className={labelClass}>Use of the building *</label>
              <select id="bp-use" value={form.useType} onChange={set("useType")} className={inputClass}>
                {USE_TYPES.map((u) => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
              </select>
            </div>
            <span className={labelClass}>Built-up area, floor-wise (sq m) *</span>
            <div className="space-y-2">
              {form.floors.map((f, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    aria-label={`Floor ${i + 1} name`}
                    value={f.floor}
                    onChange={(e) => setForm({ ...form, floors: form.floors.map((x, j) => (j === i ? { ...x, floor: e.target.value } : x)) })}
                    className={`${inputClass} min-w-0 flex-1`}
                  />
                  <input
                    aria-label={`${f.floor} area in sq m`}
                    inputMode="decimal"
                    value={f.areaSqm}
                    placeholder="sq m"
                    onChange={(e) => setForm({ ...form, floors: form.floors.map((x, j) => (j === i ? { ...x, areaSqm: e.target.value.replace(/[^\d.]/g, "") } : x)) })}
                    className={`${inputClass} !w-28 shrink-0`}
                  />
                  {form.floors.length > 1 && (
                    <button
                      type="button"
                      aria-label="Remove floor"
                      onClick={() => setForm({ ...form, floors: form.floors.filter((_, j) => j !== i) })}
                      className="rounded-md border border-slate-200 px-2 text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setForm({ ...form, floors: [...form.floors, { floor: DEFAULT_FLOORS[form.floors.length] ?? `Floor ${form.floors.length}`, areaSqm: "" }] })}
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-nnm-blue"
            >
              <Plus className="h-3.5 w-3.5" /> Add floor
            </button>
            <div className="mt-4 rounded-md bg-slate-50 p-3 text-sm">
              Total built-up area <b>{builtUp.toFixed(2)} sq m</b>
              {builtUp > 0 && Number(form.plotAreaSqm) > 0 && (
                <>
                  {" "}- estimated fee <b>{rupees(fees.total)}</b>
                  <span className="block text-xs text-slate-500">
                    Development {rupees(fees.development)} + permit {rupees(fees.permit)} + labour cess {rupees(fees.labourCess)}. Paid after technical scrutiny.
                  </span>
                </>
              )}
            </div>
          </section>

          <section className={cardClass}>
            <h3 className="mb-4 text-sm font-semibold text-slate-800">Architect (UDHD registered)</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="bp-arch" className={labelClass}>Name *</label>
                <input id="bp-arch" value={form.architectName} onChange={set("architectName")} className={inputClass} required />
              </div>
              <div>
                <label htmlFor="bp-archreg" className={labelClass}>UDHD registration no. *</label>
                <input id="bp-archreg" value={form.architectRegNo} onChange={set("architectRegNo")} className={inputClass} required />
              </div>
              <div>
                <label htmlFor="bp-archmob" className={labelClass}>Mobile</label>
                <input
                  id="bp-archmob"
                  inputMode="numeric"
                  value={form.architectMobile}
                  onChange={(e) => setForm({ ...form, architectMobile: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                  className={inputClass}
                />
              </div>
            </div>
          </section>

          <button type="submit" disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-nnm-blue px-4 py-3 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save and continue to documents
          </button>
        </form>
      )}

      {step === 2 && (
        <div className="space-y-5">
          <section className={cardClass}>
            <h3 className="mb-1 text-sm font-semibold text-slate-800">Documents</h3>
            <p className="mb-4 text-xs text-slate-500">PDF up to 2 MB (drawing set up to 10 MB), or a photo (shrunk automatically). Up to 3 files per document.</p>
            <div className="divide-y divide-slate-100">
              {APPLICANT_DOCS.map((spec) => {
                const mine = docs.filter((d) => d.doc_type === spec.type);
                const pct = uploading[spec.type];
                return (
                  <div key={spec.type} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm">
                        <span className="font-medium text-slate-800">
                          {spec.label}
                          {spec.required && <span className="text-red-600"> *</span>}
                        </span>
                        {spec.hint && <span className="block text-xs text-slate-500">{spec.hint}</span>}
                      </div>
                      {mine.length < 3 && (
                        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-nnm-blue px-3 py-1.5 text-xs font-semibold text-nnm-blue hover:bg-blue-50">
                          {pct !== undefined ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                          {pct !== undefined ? `${pct}%` : mine.length ? "Add file" : "Upload"}
                          <input
                            type="file"
                            className="hidden"
                            aria-label={`Upload ${spec.label}`}
                            accept={spec.photoOnly ? "image/jpeg,image/png" : spec.pdfOnly ? "application/pdf" : "application/pdf,image/jpeg,image/png"}
                            disabled={pct !== undefined}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              e.target.value = "";
                              if (f) void upload(spec, f);
                            }}
                          />
                        </label>
                      )}
                    </div>
                    {mine.map((d) => (
                      <div key={d.id} className="mt-1.5 flex items-center justify-between gap-2 rounded bg-green-50 px-2 py-1 text-xs text-green-800">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{d.file_name}</span>
                        </span>
                        <button type="button" onClick={() => remove(d)} className="text-slate-500 hover:text-red-600" aria-label={`Remove ${d.file_name}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    {docError[spec.type] && <p className="mt-1 text-xs text-red-600">{docError[spec.type]}</p>}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="mb-1 flex items-center gap-1.5 font-semibold">
              <FileText className="h-4 w-4" /> To be submitted at the Map Section, Nagar Nigam office
            </p>
            3 printed sets of the drawing, countersigned by a UDHD registered architect, and the original joint affidavit. The file is processed after these are received.
          </section>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={() => setStep(1)} className="rounded-md border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Back to details
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy || missing.length > 0 || Object.keys(uploading).length > 0}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-nnm-blue px-4 py-3 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} {existing ? "Resubmit corrected application" : "Submit application"}
            </button>
          </div>
          {missing.length > 0 && <p className="text-xs text-slate-500">Still to upload: {missing.map((m) => m.label).join("; ")}.</p>}
        </div>
      )}
    </div>
  );
}
