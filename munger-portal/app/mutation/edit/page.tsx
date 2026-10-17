"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Loader2, Lock, Trash2, Upload } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import {
  DOC_TYPES,
  isRequired,
  openForEdit,
  removeEditDocument,
  saveEdit,
  SURVEY_WARDS,
  TRANSFER_BASIS,
  uploadEditDocument,
  type EditableApplication,
  type UploadedDoc,
} from "@/lib/mutation-api";

const inputClass = "w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue";
const labelClass = "mb-1 block text-xs font-medium text-slate-600";
const cardClass = "rounded-xl border border-slate-200 bg-white p-5 sm:p-6";

function today(): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

type Form = Omit<EditableApplication, "applicationNo" | "holdingNo" | "manual" | "newOwnerAadhaarMasked"> & {
  newOwnerAadhaar: string;
  manual: { oldHoldingNo: string; ward: string; address: string } | null;
};

export default function MutationEditPage() {
  const [lookup, setLookup] = useState({ applicationNo: "", mobile: "", holdingNo: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState<string | null>(null);
  const [session, setSession] = useState<{ id: string; token: string; app: EditableApplication; sentBack: boolean; revertComment: string | null } | null>(null);
  const [f, setF] = useState<Form | null>(null);
  const [docs, setDocs] = useState<UploadedDoc[]>([]);
  const [uploading, setUploading] = useState<{ type: string; pct: number } | null>(null);
  const [done, setDone] = useState<{ resubmitted: boolean; changed: string[] } | null>(null);

  async function open(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLocked(null);
    if (!lookup.applicationNo.trim() || !lookup.mobile.trim() || !lookup.holdingNo.trim()) return setError("Enter all three: application number, mobile number and holding number.");
    setBusy(true);
    try {
      const r = await openForEdit(lookup.applicationNo.trim().toUpperCase(), lookup.mobile.trim(), lookup.holdingNo.trim());
      if (!r.editable || !r.application || !r.applicationId || !r.editToken) {
        setLocked(r.reason ?? "This application can no longer be changed.");
        return;
      }
      const a = r.application;
      setSession({ id: r.applicationId, token: r.editToken, app: a, sentBack: !!r.sentBack, revertComment: r.revertComment ?? null });
      setF({
        newOwnerName: a.newOwnerName,
        newOwnerRelationType: a.newOwnerRelationType ?? "",
        newOwnerRelationName: a.newOwnerRelationName ?? "",
        newOwnerMobile: a.newOwnerMobile,
        newOwnerAadhaar: "",
        newOwnerEmail: a.newOwnerEmail ?? "",
        applicantName: a.applicantName,
        applicantMobile: a.applicantMobile,
        transferBasis: a.transferBasis,
        transferDate: a.transferDate,
        khataNo: a.khataNo ?? "",
        khesraNo: a.khesraNo ?? "",
        surveySheetNo: a.surveySheetNo ?? "",
        surveyWard: a.surveyWard ?? "",
        manual: a.manual ? { oldHoldingNo: a.manual.oldHoldingNo ?? "", ward: a.manual.ward ?? "", address: a.manual.address ?? "" } : null,
      });
      setDocs(r.documents);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the application.");
    } finally {
      setBusy(false);
    }
  }

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((p) => (p ? { ...p, [k]: e.target.value } : p));
  const setManual = (k: "oldHoldingNo" | "ward" | "address") => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((p) => (p && p.manual ? { ...p, manual: { ...p.manual, [k]: e.target.value } } : p));

  async function onPick(type: string, files: FileList | null) {
    if (!session || !files) return;
    setError(null);
    for (const file of Array.from(files)) {
      if (file.size > 10 * 1024 * 1024) {
        setError(`${file.name} is larger than 10 MB.`);
        continue;
      }
      setUploading({ type, pct: 0 });
      try {
        const d = await uploadEditDocument(session.id, session.token, type, file, (pct) => setUploading({ type, pct }));
        setDocs((prev) => [...prev, d]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed.");
      } finally {
        setUploading(null);
      }
    }
  }

  async function onRemove(docId: string) {
    if (!session) return;
    setError(null);
    try {
      await removeEditDocument(session.id, session.token, docId);
      setDocs((prev) => prev.filter((d) => d.id !== docId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the file.");
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!session || !f) return;
    setError(null);
    const missing = DOC_TYPES.filter((s) => isRequired(s, f.transferBasis) && !docs.some((d) => d.doc_type === s.type));
    if (missing.length) return setError(`Upload: ${missing.map((m) => m.label).join("; ")}.`);
    setBusy(true);
    try {
      const r = await saveEdit(session.id, session.token, {
        manual: f.manual,
        newOwnerName: f.newOwnerName,
        newOwnerRelationType: f.newOwnerRelationType || null,
        newOwnerRelationName: f.newOwnerRelationName || null,
        newOwnerMobile: f.newOwnerMobile,
        newOwnerAadhaar: f.newOwnerAadhaar || null,
        newOwnerEmail: f.newOwnerEmail || null,
        applicantName: f.applicantName,
        applicantMobile: f.applicantMobile,
        transferBasis: f.transferBasis,
        transferDate: f.transferDate,
        khataNo: f.khataNo || null,
        khesraNo: f.khesraNo || null,
        surveySheetNo: f.surveySheetNo || null,
        surveyWard: f.surveyWard || null,
      });
      setDone(r);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the changes.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <SiteHeader />
      <main>
        <section className="bg-gradient-to-br from-nnm-blue to-nnm-blue-dark py-14 text-white">
          <div className="mx-auto max-w-6xl px-6">
            <span className="mb-2.5 block font-mono text-[12.5px] uppercase tracking-[0.14em] text-nnm-gold">Counter 01B</span>
            <h1 className="mb-3 font-display text-3xl font-semibold sm:text-4xl">Change a Mutation Application</h1>
            <p className="max-w-xl text-[17px] text-white/80">
              Correct the details or documents of an application you submitted — possible until the office starts examining it, or when it
              has been sent back to you for correction.
            </p>
          </div>
        </section>

        <section className="bg-paper-dim py-10">
          <div className="mx-auto max-w-3xl space-y-5 px-4 sm:px-6">
            {error && (
              <div role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            {done ? (
              <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-sm text-green-800">
                <p className="flex items-center gap-2 text-base font-semibold">
                  <CheckCircle2 className="h-5 w-5" /> {done.resubmitted ? "Corrected and resubmitted" : done.changed.length ? "Changes saved" : "No changes were made"}
                </p>
                {done.changed.length > 0 && <p className="mt-2">Changed: {done.changed.join(", ")}.</p>}
                {done.resubmitted && <p className="mt-2">Your application has gone back to the Tax Daroga for examination.</p>}
                <Link href={`/mutation/status?no=${session?.app.applicationNo ?? ""}`} className="mt-3 inline-block font-semibold text-nnm-blue hover:underline">
                  Track the application
                </Link>
              </div>
            ) : !session || !f ? (
              <form onSubmit={open} className={cardClass}>
                <h2 className="mb-4 text-base font-semibold text-slate-900">Open your application</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className={labelClass}>Application number</label>
                    <input
                      value={lookup.applicationNo}
                      onChange={(e) => setLookup({ ...lookup, applicationNo: e.target.value.toUpperCase() })}
                      placeholder="MUT26000123K"
                      maxLength={24}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Mobile number (applicant or new owner)</label>
                    <input value={lookup.mobile} onChange={(e) => setLookup({ ...lookup, mobile: e.target.value })} inputMode="tel" maxLength={14} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Holding number (old or new, as given)</label>
                    <input value={lookup.holdingNo} onChange={(e) => setLookup({ ...lookup, holdingNo: e.target.value })} maxLength={32} className={inputClass} />
                  </div>
                </div>
                <button disabled={busy} className="mt-4 inline-flex items-center gap-2 rounded-md bg-nnm-blue px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  Open
                </button>
                {locked && (
                  <p className="mt-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                    {locked}
                  </p>
                )}
              </form>
            ) : (
              <form onSubmit={save} className="space-y-5">
                <div className={`${cardClass} text-sm`}>
                  <p>
                    Application <b className="font-mono">{session.app.applicationNo}</b>
                    {session.app.holdingNo ? (
                      <>
                        {" "}
                        · Holding <b>{session.app.holdingNo}</b>
                      </>
                    ) : null}
                  </p>
                  {session.sentBack && (
                    <p className="mt-2 rounded-md bg-amber-50 p-3 text-amber-900">
                      Sent back for correction{session.revertComment ? `: “${session.revertComment}”` : "."} Saving resubmits it to the Tax Daroga.
                    </p>
                  )}
                  <p className="mt-2 text-xs text-slate-500">This page stays open for 60 minutes. Every change is recorded.</p>
                </div>

                {f.manual && (
                  <div className={cardClass}>
                    <h2 className="mb-4 text-base font-semibold text-slate-900">Holding (entered by you)</h2>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <div>
                        <label className={labelClass}>Old holding number</label>
                        <input value={f.manual.oldHoldingNo} onChange={setManual("oldHoldingNo")} maxLength={32} className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>Ward</label>
                        <input value={f.manual.ward} onChange={setManual("ward")} maxLength={16} className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>Address</label>
                        <input value={f.manual.address} onChange={setManual("address")} maxLength={500} className={inputClass} />
                      </div>
                    </div>
                  </div>
                )}

                <div className={cardClass}>
                  <h2 className="mb-4 text-base font-semibold text-slate-900">New holding owner</h2>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className={labelClass}>Name</label>
                      <input value={f.newOwnerName} onChange={set("newOwnerName")} maxLength={255} className={inputClass} />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className={labelClass}>Relation</label>
                        <select value={f.newOwnerRelationType ?? ""} onChange={set("newOwnerRelationType")} className={inputClass}>
                          <option value="">—</option>
                          {["S/O", "D/O", "W/O", "C/O"].map((r) => (
                            <option key={r}>{r}</option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className={labelClass}>Name</label>
                        <input value={f.newOwnerRelationName ?? ""} onChange={set("newOwnerRelationName")} maxLength={255} className={inputClass} />
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>Mobile</label>
                      <input value={f.newOwnerMobile} onChange={set("newOwnerMobile")} inputMode="tel" maxLength={14} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Aadhaar number (on file: {session.app.newOwnerAadhaarMasked}) — leave blank to keep</label>
                      <input value={f.newOwnerAadhaar} onChange={set("newOwnerAadhaar")} inputMode="numeric" maxLength={14} className={inputClass} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelClass}>Email (optional)</label>
                      <input type="email" value={f.newOwnerEmail ?? ""} onChange={set("newOwnerEmail")} maxLength={120} className={inputClass} />
                    </div>
                  </div>
                </div>

                <div className={cardClass}>
                  <h2 className="mb-4 text-base font-semibold text-slate-900">Applicant &amp; transfer</h2>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className={labelClass}>Applicant&apos;s name</label>
                      <input value={f.applicantName} onChange={set("applicantName")} maxLength={255} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Applicant&apos;s mobile</label>
                      <input value={f.applicantMobile} onChange={set("applicantMobile")} inputMode="tel" maxLength={14} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Basis of mutation</label>
                      <select value={f.transferBasis} onChange={set("transferBasis")} className={inputClass}>
                        {TRANSFER_BASIS.map((b) => (
                          <option key={b.value} value={b.value}>
                            {b.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Date of transfer</label>
                      <input type="date" max={today()} value={f.transferDate} onChange={set("transferDate")} className={inputClass} />
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div>
                      <label className={labelClass}>Khata no.</label>
                      <input value={f.khataNo ?? ""} onChange={set("khataNo")} maxLength={64} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Khesra no.</label>
                      <input value={f.khesraNo ?? ""} onChange={set("khesraNo")} maxLength={64} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Survey sheet no.</label>
                      <input value={f.surveySheetNo ?? ""} onChange={set("surveySheetNo")} maxLength={64} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Survey ward</label>
                      <select value={f.surveyWard ?? ""} onChange={set("surveyWard")} className={inputClass}>
                        <option value="">—</option>
                        {SURVEY_WARDS.map((w) => (
                          <option key={w}>{w}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className={cardClass}>
                  <h2 className="mb-1 text-base font-semibold text-slate-900">Documents</h2>
                  <p className="mb-3 text-xs text-slate-500">Add a corrected file first, then remove the wrong one. PDF, JPG or PNG, up to 10 MB.</p>
                  <div className="divide-y divide-slate-100">
                    {DOC_TYPES.map((spec) => {
                      const mine = docs.filter((d) => d.doc_type === spec.type);
                      const req = isRequired(spec, f.transferBasis);
                      return (
                        <div key={spec.type} className="py-3">
                          <div className="flex flex-wrap items-center gap-3">
                            <div className="min-w-[220px] flex-1 text-sm font-medium text-slate-900">
                              {spec.label}
                              {req && <span className="text-red-600"> *</span>}
                              {mine.length > 0 && <CheckCircle2 className="ml-1 inline h-4 w-4 text-green-600" />}
                            </div>
                            <label
                              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 ${uploading ? "pointer-events-none opacity-50" : ""}`}
                            >
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
                          </div>
                          {mine.map((d) => (
                            <div key={d.id} className="mt-1 flex items-center gap-2 text-xs text-slate-600">
                              <span className="truncate">{d.file_name}</span>
                              <button type="button" onClick={() => onRemove(d.id)} className="text-red-600" aria-label="Remove">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <button disabled={busy || uploading !== null} className="inline-flex items-center gap-2 rounded-md bg-nnm-blue px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  {session.sentBack ? "Save & resubmit" : "Save changes"}
                </button>
              </form>
            )}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
