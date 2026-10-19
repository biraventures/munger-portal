"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Loader2, MapPin, Search, Trash2, Upload } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { PROPERTY_TAX_SEARCH_PATH } from "@/lib/config";
import {
  createApplication,
  updateApplication,
  SURVEY_WARDS,
  DOC_TYPES,
  isRequired,
  lookupHolding,
  removeDocument,
  submitApplication,
  TRANSFER_BASIS,
  uploadDocument,
  type HoldingLookup,
  type UploadedDoc,
} from "@/lib/mutation-api";
import { formatBytes, isPdfFile, MAX_PDF_BYTES } from "@/lib/upload-limits";
import { defaultArea, FloorChoice } from "@/components/mutation/floor-choice";

const inputClass = "w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue";
const labelClass = "mb-1 block text-xs font-medium text-slate-600";
const cardClass = "rounded-xl border border-slate-200 bg-white p-5 sm:p-6";

function yearOptions(): string[] {
  const now = new Date();
  const fyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const out: string[] = [];
  for (let y = fyStart; y >= 1990; y--) out.push(`${y}-${y + 1}`);
  return out;
}

function today(): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

type Step = "holding" | "details" | "documents" | "done";

export default function MutationApplicationPage() {
  const years = useMemo(yearOptions, []);
  const [step, setStep] = useState<Step>("holding");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Step 1 - holding
  const [mode, setMode] = useState<"holding" | "manual">("holding");
  const [holdingNo, setHoldingNo] = useState("");
  const [lookupMobile, setLookupMobile] = useState("");
  const [holding, setHolding] = useState<HoldingLookup | null>(null);
  const [manual, setManual] = useState({ oldHoldingNo: "", ward: "", address: "", taxPaidTillYear: "", solidWastePaidTillYear: "" });

  // Step 2 - details
  const [f, setF] = useState({
    newOwnerName: "",
    newOwnerRelationType: "",
    newOwnerRelationName: "",
    newOwnerMobile: "",
    newOwnerAadhaar: "",
    newOwnerEmail: "",
    applicantName: "",
    applicantMobile: "",
    transferBasis: "",
    transferDate: "",
    khataNo: "",
    khesraNo: "",
    surveySheetNo: "",
    surveyWard: "",
  });
  const [applicantIsOwner, setApplicantIsOwner] = useState(false);
  const [area, setArea] = useState({ total: "", entire: true, part: "" });
  // Floor-wise: floors being bought (all by default); areaTouched = the applicant changed the land area himself.
  const [floorSel, setFloorSel] = useState<string[]>([]);
  const [areaTouched, setAreaTouched] = useState(false);
  const holdingFloors = mode === "holding" ? holding?.floors ?? [] : [];
  const someFloors = holdingFloors.length > 1 && floorSel.length > 0 && floorSel.length < holdingFloors.length;
  const [otherLabels, setOtherLabels] = useState<Record<string, string>>({ other_1: "", other_2: "" });
  const [gps, setGps] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [gpsBusy, setGpsBusy] = useState(false);

  // Step 3 - documents
  const [draft, setDraft] = useState<{ id: string; token: string } | null>(null);
  const [docs, setDocs] = useState<UploadedDoc[]>([]);
  const [uploading, setUploading] = useState<{ type: string; pct: number } | null>(null);
  const [applicationNo, setApplicationNo] = useState<string | null>(null);
  const [submitStatus, setSubmitStatus] = useState<string | null>(null);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  async function checkHolding(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setHolding(null);
    const m = lookupMobile.replace(/[\s-]/g, "").replace(/^(\+91|91|0)(?=\d{10}$)/, "");
    if (!/^[6-9]\d{9}$/.test(m)) return setError("Enter your 10-digit mobile number first.");
    if (!holdingNo.trim()) return setError("Enter the holding number.");
    setBusy(true);
    try {
      const r = await lookupHolding(holdingNo, m);
      setF((p) => ({ ...p, applicantMobile: p.applicantMobile || m }));
      if (!r.found) setError("This holding number was not found. Check it, or apply with the old holding number and ward instead.");
      setHolding(r.found ? r : null);
      setFloorSel(r.found ? (r.floors ?? []).map((x) => x.floorLabel) : []);
      setAreaTouched(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not check the holding.");
    } finally {
      setBusy(false);
    }
  }

  function continueFromHolding() {
    setError(null);
    if (mode === "manual") {
      if (!manual.oldHoldingNo.trim() || !manual.ward.trim() || !manual.address.trim()) return setError("Enter the old holding number, ward and address.");
    } else if (!holding?.canApply) {
      return;
    }
    setStep("details");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function captureGps() {
    setError(null);
    if (!navigator.geolocation) return setError("This device cannot give a GPS location. Use a mobile phone at the holding.");
    setGpsBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy });
        setGpsBusy(false);
      },
      (err) => {
        setGpsBusy(false);
        setError(err.code === err.PERMISSION_DENIED ? "Allow location access in the browser to capture the GPS location." : "Could not get the GPS location - try again in the open.");
      },
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 },
    );
  }

  async function saveDetails(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const applicantName = applicantIsOwner ? f.newOwnerName : f.applicantName;
    const applicantMobile = applicantIsOwner ? f.newOwnerMobile : f.applicantMobile;
    if (!f.newOwnerName.trim() || !f.newOwnerMobile.trim() || !f.newOwnerAadhaar.trim()) return setError("Enter the new owner's name, mobile number and Aadhaar number.");
    if (!applicantName.trim() || !applicantMobile.trim()) return setError("Enter the applicant's name and mobile number.");
    if (!f.transferBasis || !f.transferDate) return setError("Choose the basis of mutation and the date of transfer.");
    if (!gps) return setError("Capture the GPS location of the holding (stand at the holding and tap the button).");
    const total = recordArea ?? Number(area.total);
    if (!(total > 0)) return setError("Enter the total area of the holding in sq ft.");
    const part = area.entire ? total : Number(area.part);
    if (!(part > 0) && !(someFloors && area.part.trim() !== "" && part === 0)) return setError("Enter the area to be mutated in sq ft, or tick 'Entire area'.");
    if (part > total) return setError(`The area to be mutated cannot be more than the total area (${total} sq ft).`);
    setBusy(true);
    try {
      const body = {
        holdingNo: mode === "holding" ? holding?.holdingNo ?? holdingNo.trim() : null,
        manual: mode === "manual" ? { ...manual } : null,
        newOwnerName: f.newOwnerName,
        newOwnerRelationType: f.newOwnerRelationType || null,
        newOwnerRelationName: f.newOwnerRelationName || null,
        newOwnerMobile: f.newOwnerMobile,
        newOwnerAadhaar: f.newOwnerAadhaar,
        newOwnerEmail: f.newOwnerEmail || null,
        applicantName,
        applicantMobile,
        transferBasis: f.transferBasis,
        transferDate: f.transferDate,
        latitude: gps.lat,
        longitude: gps.lng,
        gpsAccuracy: gps.acc,
        khataNo: f.khataNo || null,
        khesraNo: f.khesraNo || null,
        surveySheetNo: f.surveySheetNo || null,
        surveyWard: f.surveyWard || null,
        holdingAreaSqft: total,
        mutateEntire: area.entire || part >= total,
        mutateAreaSqft: part,
        mutateFloors: someFloors ? floorSel : null,
      };
      // Coming back from the documents step: the same draft is updated, its documents are kept.
      if (draft) await updateApplication(draft.id, draft.token, body);
      else {
        const r = await createApplication(body);
        setDraft({ id: r.applicationId, token: r.uploadToken });
      }
      setStep("documents");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the details.");
    } finally {
      setBusy(false);
    }
  }

  const recordArea = mode === "holding" && holding?.areaSqft ? Number(holding.areaSqft) : null;

  async function onPick(type: string, files: FileList | null) {
    if (!draft || !files?.length) return;
    setError(null);
    for (const file of Array.from(files)) {
      if (isPdfFile(file) && file.size > MAX_PDF_BYTES) {
        setError(`${file.name} is ${formatBytes(file.size)} - a PDF can be at most 2 MB. Scan it at a lower resolution or in black and white.`);
        continue;
      }
      setUploading({ type, pct: 0 });
      try {
        const d = await uploadDocument(draft.id, draft.token, type, file, (pct) => setUploading({ type, pct }), otherLabels[type] || undefined);
        setDocs((prev) => [...prev, d]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed.");
      } finally {
        setUploading(null);
      }
    }
  }

  async function onRemove(docId: string) {
    if (!draft) return;
    try {
      await removeDocument(draft.id, draft.token, docId);
      setDocs((prev) => prev.filter((d) => d.id !== docId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the file.");
    }
  }

  async function onSubmit() {
    if (!draft) return;
    setError(null);
    const missing = DOC_TYPES.filter((s) => isRequired(s, f.transferBasis) && !docs.some((d) => d.doc_type === s.type));
    if (missing.length) return setError(`Upload: ${missing.map((m) => m.label).join("; ")}.`);
    setBusy(true);
    try {
      const r = await submitApplication(draft.id, draft.token);
      setApplicationNo(r.applicationNo);
      setSubmitStatus(r.status);
      setStep("done");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit the application.");
    } finally {
      setBusy(false);
    }
  }

  const stepsList: { id: Step; label: string }[] = [
    { id: "holding", label: "Holding" },
    { id: "details", label: "Details" },
    { id: "documents", label: "Documents" },
    { id: "done", label: "Submitted" },
  ];
  const stepIndex = stepsList.findIndex((s) => s.id === step);

  return (
    <div>
      <SiteHeader />
      <main>
        <section className="bg-gradient-to-br from-nnm-blue to-nnm-blue-dark py-14 text-white">
          <div className="mx-auto max-w-6xl px-6">
            <span className="mb-2.5 block font-mono text-[12.5px] uppercase tracking-[0.14em] text-nnm-gold">Counter 01B</span>
            <h1 className="mb-3 font-display text-3xl font-semibold sm:text-4xl">Mutation of Holding</h1>
            <p className="max-w-xl text-[17px] text-white/80">
              Apply to change the owner&apos;s name on a holding after sale, partition, gift, inheritance or auction. Dues of earlier
              years must be cleared first; this year&apos;s tax can be paid after the mutation. One mobile number can be used for at most
              two applications.{" "}
              <Link href="/mutation/status" className="font-semibold text-nnm-gold underline">
                Track an application
              </Link>{" "}
              ·{" "}
              <Link href="/mutation/edit" className="font-semibold text-nnm-gold underline">
                View / correct my application
              </Link>
            </p>
          </div>
        </section>

        <section className="bg-paper-dim py-10">
          <div className="mx-auto max-w-3xl space-y-5 px-4 sm:px-6">
            <ol className="flex flex-wrap gap-2 text-xs">
              {stepsList.map((s, i) => (
                <li key={s.id} className={`rounded-full px-3 py-1 font-semibold ${i === stepIndex ? "bg-nnm-blue text-white" : i < stepIndex ? "bg-green-100 text-green-800" : "bg-white text-slate-400"}`}>
                  {i + 1}. {s.label}
                </li>
              ))}
            </ol>

            {error && (
              <div role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            {step === "holding" && (
              <div className={cardClass}>
                <h2 className="mb-4 text-base font-semibold text-slate-900">Which holding?</h2>
                <div className="mb-4 flex flex-wrap gap-2">
                  <button onClick={() => setMode("holding")} className={`rounded-md px-3 py-1.5 text-sm font-medium ${mode === "holding" ? "bg-nnm-blue text-white" : "border border-slate-300 text-slate-700"}`}>
                    I know the holding number
                  </button>
                  <button onClick={() => setMode("manual")} className={`rounded-md px-3 py-1.5 text-sm font-medium ${mode === "manual" ? "bg-nnm-blue text-white" : "border border-slate-300 text-slate-700"}`}>
                    I have the old holding number
                  </button>
                </div>

                {mode === "holding" ? (
                  <>
                    <form onSubmit={checkHolding} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
                      <div>
                        <label className={labelClass}>Your mobile number</label>
                        <input value={lookupMobile} onChange={(e) => setLookupMobile(e.target.value)} inputMode="tel" placeholder="10-digit mobile" className={inputClass} maxLength={14} />
                      </div>
                      <div>
                        <label className={labelClass}>Holding number</label>
                        <input value={holdingNo} onChange={(e) => setHoldingNo(e.target.value)} placeholder="e.g. MUNG-02002" className={inputClass} maxLength={32} />
                      </div>
                      <button disabled={busy} className="inline-flex items-center justify-center gap-2 self-end rounded-md bg-nnm-blue px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                        Check
                      </button>
                    </form>
                    {holding?.found && (
                      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
                        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                          <div>
                            <span className="text-slate-500">Holding no:</span> <b>{holding.holdingNo}</b>
                          </div>
                          <div>
                            <span className="text-slate-500">Ward:</span> {holding.ward ?? "-"}
                          </div>
                          <div className="sm:col-span-2">
                            <span className="text-slate-500">Address:</span> {holding.address}
                          </div>
                          <div>
                            <span className="text-slate-500">Tax paid till:</span> {holding.taxPaidTillYear ?? "-"}
                          </div>
                          <div>
                            <span className="text-slate-500">User charge paid till:</span> {holding.solidWastePaidTillYear ?? "-"}
                          </div>
                        </div>
                        {!holding.canApply && (
                          <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900">
                            {holding.message}
                            {Number(holding.duesPending) > 0 && (
                              <div className="mt-2">
                                Earlier years&apos; dues: <b>₹{Number(holding.duesPending).toLocaleString("en-IN")}</b>{" "}
                                <Link href={PROPERTY_TAX_SEARCH_PATH} className="ml-2 inline-block rounded-md bg-nnm-blue px-3 py-1.5 text-xs font-semibold text-white">
                                  Pay property tax
                                </Link>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className={labelClass}>Old holding number</label>
                      <input value={manual.oldHoldingNo} onChange={(e) => setManual({ ...manual, oldHoldingNo: e.target.value })} maxLength={32} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Ward</label>
                      <input value={manual.ward} onChange={(e) => setManual({ ...manual, ward: e.target.value })} maxLength={16} className={inputClass} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelClass}>Address of the holding</label>
                      <input value={manual.address} onChange={(e) => setManual({ ...manual, address: e.target.value })} maxLength={500} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Tax paid till year</label>
                      <select value={manual.taxPaidTillYear} onChange={(e) => setManual({ ...manual, taxPaidTillYear: e.target.value })} className={inputClass}>
                        <option value="">Not known</option>
                        {years.map((y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Solid waste user charge paid till year</label>
                      <select value={manual.solidWastePaidTillYear} onChange={(e) => setManual({ ...manual, solidWastePaidTillYear: e.target.value })} className={inputClass}>
                        <option value="">Not known</option>
                        {years.map((y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))}
                      </select>
                    </div>
                    <p className="text-xs text-slate-500 sm:col-span-2">
                      The Nagar Nigam will identify the holding from these details. Holding tax and user charge of earlier years must be paid before the mutation is done; this year&apos;s can be paid after it.
                    </p>
                  </div>
                )}

                <div className="mt-5">
                  <button
                    onClick={continueFromHolding}
                    disabled={mode === "holding" && !holding?.canApply}
                    className="rounded-md bg-nnm-blue px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Continue
                  </button>
                </div>
              </div>
            )}

            {step === "details" && (
              <form onSubmit={saveDetails} className="space-y-5">
                <div className={cardClass}>
                  <h2 className="mb-4 text-base font-semibold text-slate-900">New holding owner</h2>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className={labelClass}>Name of the new holding owner</label>
                      <input value={f.newOwnerName} onChange={set("newOwnerName")} maxLength={255} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Relation (optional)</label>
                      <select value={f.newOwnerRelationType} onChange={set("newOwnerRelationType")} className={inputClass}>
                        <option value="">—</option>
                        <option value="S/O">Son of (S/O)</option>
                        <option value="D/O">Daughter of (D/O)</option>
                        <option value="W/O">Wife of (W/O)</option>
                        <option value="C/O">Care of (C/O)</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Father&apos;s / husband&apos;s name (optional)</label>
                      <input value={f.newOwnerRelationName} onChange={set("newOwnerRelationName")} maxLength={255} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Mobile number of the new owner</label>
                      <input value={f.newOwnerMobile} onChange={set("newOwnerMobile")} inputMode="tel" maxLength={14} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Aadhaar number of the new owner</label>
                      <input value={f.newOwnerAadhaar} onChange={set("newOwnerAadhaar")} inputMode="numeric" maxLength={14} className={inputClass} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelClass}>Email of the new owner (optional)</label>
                      <input type="email" value={f.newOwnerEmail} onChange={set("newOwnerEmail")} maxLength={120} className={inputClass} />
                    </div>
                  </div>
                </div>

                <div className={cardClass}>
                  <h2 className="mb-4 text-base font-semibold text-slate-900">Applicant</h2>
                  <label className="mb-3 flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={applicantIsOwner} onChange={(e) => setApplicantIsOwner(e.target.checked)} />
                    The new owner is applying
                  </label>
                  {!applicantIsOwner && (
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

                <div className={cardClass}>
                  <h2 className="mb-4 text-base font-semibold text-slate-900">Area</h2>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FloorChoice
                      floors={holdingFloors}
                      selected={floorSel}
                      onChange={(next) => {
                        setFloorSel(next);
                        if (!areaTouched) setArea((a) => ({ ...a, ...defaultArea(next, holdingFloors) }));
                      }}
                    />
                    <div>
                      <label className={labelClass}>Total area of the holding (sq ft)</label>
                      {recordArea ? (
                        <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">{recordArea.toLocaleString("en-IN")} sq ft (as in the holding record)</p>
                      ) : (
                        <input type="number" min="0" step="0.01" inputMode="decimal" value={area.total} onChange={(e) => setArea({ ...area, total: e.target.value })} className={inputClass} />
                      )}
                    </div>
                    <div>
                      <label className={labelClass}>{someFloors ? "Land area going to the buyer (sq ft)" : "Area to be mutated (sq ft)"}</label>
                      <label className="mb-2 flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={area.entire}
                          onChange={(e) => {
                            setAreaTouched(true);
                            setArea({ ...area, entire: e.target.checked });
                          }}
                          className="h-4 w-4"
                        />
                        Entire area of the holding
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        disabled={area.entire}
                        value={area.entire ? String(recordArea ?? area.total) : area.part}
                        onChange={(e) => {
                          setAreaTouched(true);
                          setArea({ ...area, part: e.target.value });
                        }}
                        className={`${inputClass} disabled:bg-slate-100`}
                      />
                    </div>
                  </div>
                  {!area.entire && !someFloors && (
                    <p className="mt-3 rounded-md bg-amber-50 p-3 text-xs text-amber-900">
                      Only part of the holding is being transferred: once approved, the existing holding continues (with its area reduced) and a new
                      holding with a new MMC number is created for the transferred part in the new owner&apos;s name.
                    </p>
                  )}
                </div>

                <div className={cardClass}>
                  <h2 className="mb-4 text-base font-semibold text-slate-900">Transfer</h2>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className={labelClass}>Basis of mutation</label>
                      <select value={f.transferBasis} onChange={set("transferBasis")} className={inputClass}>
                        <option value="">Select</option>
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
                    <div className="sm:col-span-2">
                      <p className="mb-2 text-xs text-slate-500">Land record details (from the jamabandi / khatian, if you have them)</p>
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
                    <div className="sm:col-span-2">
                      <label className={labelClass}>GPS location of the holding</label>
                      <div className="flex flex-wrap items-center gap-3">
                        <button type="button" onClick={captureGps} disabled={gpsBusy} className="inline-flex items-center gap-2 rounded-md border border-nnm-blue px-4 py-2 text-sm font-semibold text-nnm-blue disabled:opacity-60">
                          {gpsBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                          {gps ? "Capture again" : "Capture location"}
                        </button>
                        {gps && (
                          <span className="text-sm text-slate-600">
                            {gps.lat.toFixed(6)}, {gps.lng.toFixed(6)} <span className="text-xs text-slate-400">(±{Math.round(gps.acc)} m)</span>
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-500">Stand at the holding with your phone and tap the button.</p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button type="button" onClick={() => setStep("holding")} className="rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700">
                    Back
                  </button>
                  <button disabled={busy} className="inline-flex items-center gap-2 rounded-md bg-nnm-blue px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                    Save &amp; upload documents
                  </button>
                </div>
              </form>
            )}

            {step === "documents" && (
              <div className="space-y-4">
                <div className={cardClass}>
                  <h2 className="mb-1 text-base font-semibold text-slate-900">Upload documents</h2>
                  <p className="mb-4 text-xs text-slate-500">PDF up to 2 MB each; JPG / PNG photos are reduced to 750 KB automatically. Clear scans or photos. Required ones are marked *.</p>
                  <div className="divide-y divide-slate-100">
                    {DOC_TYPES.map((spec) => {
                      const mine = docs.filter((d) => d.doc_type === spec.type);
                      const req = isRequired(spec, f.transferBasis);
                      return (
                        <div key={spec.type} className="py-3">
                          <div className="flex flex-wrap items-center gap-3">
                            <div className="min-w-[220px] flex-1">
                              <div className="text-sm font-medium text-slate-900">
                                {spec.label}
                                {req && <span className="text-red-600"> *</span>}
                                {mine.length > 0 && <CheckCircle2 className="ml-1 inline h-4 w-4 text-green-600" />}
                              </div>
                              {spec.hint && <div className="text-xs text-slate-500">{spec.hint}</div>}
                              {spec.named && (
                                <input
                                  value={otherLabels[spec.type] ?? ""}
                                  onChange={(e) => setOtherLabels({ ...otherLabels, [spec.type]: e.target.value })}
                                  placeholder="Name of the document (e.g. registered will)"
                                  maxLength={100}
                                  className="mt-1.5 w-full max-w-xs rounded-md border border-slate-300 px-2 py-1 text-xs"
                                />
                              )}
                            </div>
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
                          </div>
                          {mine.map((d) => (
                            <div key={d.id} className="mt-1 flex items-center gap-2 text-xs text-slate-600">
                              <span className="truncate">{d.file_name}</span>
                              <span className="text-slate-400">{(Number(d.size_bytes) / 1048576).toFixed(1)} MB</span>
                              <button onClick={() => onRemove(d.id)} className="text-red-600" aria-label="Remove">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <p className="text-xs text-slate-500">
                  By submitting, I declare that the information and documents given are true. A false declaration may lead to rejection and
                  action under law.
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setStep("details");
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    disabled={busy || !!uploading}
                    className="rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
                  >
                    Back to details
                  </button>
                  <button onClick={onSubmit} disabled={busy || !!uploading} className="inline-flex items-center gap-2 rounded-md bg-nnm-blue px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                    Submit application
                  </button>
                </div>
              </div>
            )}

            {step === "done" && applicationNo && (
              <div className="rounded-xl border border-green-200 bg-green-50 p-8 text-center">
                <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-green-600" />
                <h2 className="mb-2 text-lg font-semibold text-green-800">Application submitted</h2>
                <p className="mb-1 text-sm text-green-800">Your application number is</p>
                <p className="mb-4 font-mono text-2xl font-bold tracking-wider text-green-900">{applicationNo}</p>
                <p className="mb-5 text-sm text-green-800">
                  Note it down. {submitStatus === "awaiting_holding" ? "The Nagar Nigam will first identify the holding, then process the mutation." : "It has been sent to the Tax Daroga for processing."}
                </p>
                <Link href={`/mutation/status?no=${applicationNo}`} className="text-sm font-semibold text-nnm-blue hover:underline">
                  Track this application
                </Link>
              </div>
            )}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
