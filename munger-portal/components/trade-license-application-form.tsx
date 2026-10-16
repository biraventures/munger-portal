"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Search, Upload, X } from "lucide-react";
import { sanitizeHoldingNoInput } from "@/lib/holding-no";
import {
  submitPublicTradeLicenseApplication,
  submitOperatorTradeLicenseApplication,
  fetchRenewalAutofill,
  uploadTradeLicenseDocument,
  BUSINESS_CATEGORIES,
  type TradeLicenseApplicationInput,
  type TradeLicenseDocType,
  type SubmitResult,
} from "@/lib/trade-license-api";

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";
const labelClass = "mb-1.5 block text-sm font-medium text-slate-700";

const emptyForm: TradeLicenseApplicationInput = {
  applicationType: "new",
  bplProofAttached: false,
  applicantName: "",
  relationType: "",
  relationName: "",
  entityName: "",
  entityNameHindi: "",
  entityType: null,
  completeAddress: "",
  holdingNo: "",
  holdingReceiptAttached: false,
  typeOfBusiness: "",
  durationYears: 1,
  tanOrGstrNumber: "",
  panNumber: "",
  mobile: "",
  email: "",
  commercialAreaSqft: null,
  areaOwnership: null,
  houseownerName: "",
  annualTurnoverBracket: null,
  isBpl: null,
  isGstRegistered: null,
  firmPanNumber: "",
  businessCategory: "",
  isNnmShop: null,
  nnmShopNo: "",
};

type Uploaded = { id: string; token: string; name: string };

function YesNo({ label, value, onChange }: { label: string; value: boolean | null | undefined; onChange: (v: boolean) => void }) {
  return (
    <div>
      <p className={labelClass}>{label}</p>
      <div className="flex gap-2">
        {[
          { v: true, t: "Yes / हाँ" },
          { v: false, t: "No / नहीं" },
        ].map((o) => (
          <button
            key={o.t}
            type="button"
            onClick={() => onChange(o.v)}
            className={`flex-1 rounded-md border px-4 py-2 text-sm font-semibold ${value === o.v ? "border-nnm-blue bg-blue-50 text-nnm-blue" : "border-slate-200 text-slate-600"}`}
          >
            {o.t}
          </button>
        ))}
      </div>
    </div>
  );
}

function FileField({
  label,
  hint,
  required,
  photoOnly,
  value,
  busy,
  onPick,
  onClear,
}: {
  label: string;
  hint?: string;
  required: boolean;
  photoOnly?: boolean;
  value: Uploaded | undefined;
  busy: boolean;
  onPick: (file: File) => void;
  onClear: () => void;
}) {
  return (
    <div>
      <p className={labelClass}>
        {label} {required ? <span className="text-red-600">*</span> : <span className="font-normal text-slate-400">(optional)</span>}
      </p>
      {value ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          <span className="flex min-w-0 items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span className="truncate">{value.name}</span>
          </span>
          <button type="button" onClick={onClear} className="shrink-0 text-green-700 hover:text-red-600" aria-label="Remove">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <label className={`flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-slate-300 px-3 py-2.5 text-sm text-slate-600 hover:border-nnm-blue ${busy ? "opacity-60" : ""}`}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {busy ? "Uploading…" : photoOnly ? "Take / choose a photo (JPG, PNG)" : "Choose file (PDF, JPG, PNG — up to 8 MB)"}
          <input
            type="file"
            className="hidden"
            disabled={busy}
            accept={photoOnly ? "image/jpeg,image/png" : "application/pdf,image/jpeg,image/png"}
            {...(photoOnly ? { capture: "environment" as const } : {})}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) onPick(f);
            }}
          />
        </label>
      )}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function TradeLicenseApplicationForm({
  mode,
  onSubmitted,
}: {
  mode: "public" | "operator";
  onSubmitted: (result: SubmitResult) => void;
}) {
  const [form, setForm] = useState<TradeLicenseApplicationInput>(emptyForm);
  const [autofillChecking, setAutofillChecking] = useState(false);
  const [renewalMobile, setRenewalMobile] = useState("");
  const [autofillMessage, setAutofillMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [docs, setDocs] = useState<Partial<Record<TradeLicenseDocType, Uploaded>>>({});
  const [uploading, setUploading] = useState<TradeLicenseDocType | null>(null);
  const isPublic = mode === "public";

  async function pick(docType: TradeLicenseDocType, file: File) {
    setError(null);
    setUploading(docType);
    try {
      const r = await uploadTradeLicenseDocument(file, docType);
      setDocs((d) => ({ ...d, [docType]: { ...r, name: file.name } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload the file.");
    } finally {
      setUploading(null);
    }
  }
  const clear = (docType: TradeLicenseDocType) => setDocs((d) => ({ ...d, [docType]: undefined }));
  const fileProps = (docType: TradeLicenseDocType) => ({
    value: docs[docType],
    busy: uploading === docType,
    onPick: (f: File) => pick(docType, f),
    onClear: () => clear(docType),
  });

  function update<K extends keyof TradeLicenseApplicationInput>(key: K, value: TradeLicenseApplicationInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleCheckRenewal() {
    if (!form.holdingNo?.trim()) {
      setAutofillMessage("Enter a holding number first.");
      return;
    }
    if (!renewalMobile.trim()) {
      setAutofillMessage("Enter the mobile number registered on your last application.");
      return;
    }
    setAutofillChecking(true);
    setAutofillMessage(null);
    try {
      const result = await fetchRenewalAutofill(form.holdingNo, renewalMobile);
      if (!result.found) {
        setAutofillMessage("No record matches this holding number and mobile number — please check them, or fill in the details manually.");
        return;
      }
      setForm((f) => ({
        ...f,
        applicantName: result.applicantName ?? f.applicantName,
        relationType: result.relationType ?? f.relationType,
        relationName: result.relationName ?? f.relationName,
        mobile: f.mobile || renewalMobile,
        email: result.email ?? f.email,
        entityName: result.entityName ?? f.entityName,
        entityNameHindi: result.entityNameHindi ?? f.entityNameHindi,
        entityType: (result.entityType as TradeLicenseApplicationInput["entityType"]) ?? f.entityType,
        typeOfBusiness: result.typeOfBusiness ?? f.typeOfBusiness,
        completeAddress: result.completeAddress ?? f.completeAddress,
        commercialAreaSqft: result.commercialAreaSqft ? Number(result.commercialAreaSqft) : f.commercialAreaSqft,
        areaOwnership: (result.areaOwnership as TradeLicenseApplicationInput["areaOwnership"]) ?? f.areaOwnership,
        houseownerName: result.houseownerName ?? f.houseownerName,
        tanOrGstrNumber: result.tanOrGstrNumber ?? f.tanOrGstrNumber,
        panNumber: result.panNumber ?? f.panNumber,
        firmPanNumber: result.firmPanNumber ?? f.firmPanNumber,
        businessCategory: result.businessCategory ?? f.businessCategory,
        isGstRegistered: result.isGstRegistered ?? f.isGstRegistered,
        isNnmShop: result.isNnmShop ?? f.isNnmShop,
        nnmShopNo: result.nnmShopNo ?? f.nnmShopNo,
      }));
      setAutofillMessage("Details filled in from your previous application — please review and update anything that's changed.");
    } catch (err) {
      setAutofillMessage(err instanceof Error ? err.message : "Could not check for existing records.");
    } finally {
      setAutofillChecking(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.applicantName.trim()) {
      setError("Applicant name is required.");
      return;
    }
    if (!form.entityName.trim()) {
      setError("Name of the commercial/industrial entity is required.");
      return;
    }
    if (!form.completeAddress.trim()) {
      setError("Complete address is required.");
      return;
    }
    if (isPublic) {
      const problems: string[] = [];
      if (form.isNnmShop === null || form.isNnmShop === undefined) problems.push("whether it is a Nagar Nigam stall/shop");
      if (form.isBpl === null || form.isBpl === undefined) problems.push("whether the applicant is BPL");
      if (form.isGstRegistered === null || form.isGstRegistered === undefined) problems.push("whether the business is GST registered");
      if (!form.businessCategory) problems.push("the type of business");
      if (problems.length) {
        setError(`Please answer ${problems.join(", ")}.`);
        return;
      }
      const need: [TradeLicenseDocType, boolean, string][] = [
        ["holding_receipt", !form.isNnmShop, "holding tax payment receipt"],
        ["bpl_proof", !!form.isBpl, "BPL proof"],
        ["gstr_3b", !!form.isGstRegistered, "GSTR-3B return"],
        ["pan_applicant", true, "PAN card of applicant"],
        ["shop_photo", true, "photo of shop"],
      ];
      const missing = need.filter(([t, when]) => when && !docs[t]).map(([, , l]) => l);
      if (missing.length) {
        setError(`Please upload: ${missing.join(", ")}.`);
        return;
      }
    }
    if (form.businessCategory === "Others" && !form.typeOfBusiness?.trim()) {
      setError('Describe the business when the type is "Others".');
      return;
    }
    if (form.isGstRegistered && !form.tanOrGstrNumber?.trim()) {
      setError("Enter the GSTIN of the business.");
      return;
    }
    setSubmitting(true);
    try {
      const payload: TradeLicenseApplicationInput = {
        ...form,
        relationType: form.relationType || null,
        relationName: form.relationName || null,
        entityNameHindi: form.entityNameHindi || null,
        holdingNo: form.holdingNo || null,
        typeOfBusiness: form.typeOfBusiness || null,
        tanOrGstrNumber: form.tanOrGstrNumber || null,
        panNumber: form.panNumber || null,
        mobile: form.mobile || null,
        email: form.email || null,
        houseownerName: form.houseownerName || null,
        firmPanNumber: form.firmPanNumber || null,
        businessCategory: form.businessCategory || null,
        nnmShopNo: form.isNnmShop ? form.nnmShopNo || null : null,
        // Documents only where the matching answer is Yes (a BPL proof is dropped if BPL was changed to No).
        documents: (Object.entries(docs) as [TradeLicenseDocType, Uploaded | undefined][])
          .filter(([t, d]) => d && !(t === "bpl_proof" && !form.isBpl) && !(t === "gstr_3b" && !form.isGstRegistered))
          .map(([, d]) => ({ id: d!.id, token: d!.token })),
      };
      const result = mode === "public" ? await submitPublicTradeLicenseApplication(payload) : await submitOperatorTradeLicenseApplication(payload);
      onSubmitted(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit application.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div role="alert" className="flex items-start gap-2.5 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-base font-semibold text-slate-900">Application For</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => update("applicationType", "new")}
            className={`flex-1 rounded-md border px-4 py-2.5 text-sm font-semibold ${
              form.applicationType === "new" ? "border-nnm-blue bg-blue-50 text-nnm-blue" : "border-slate-200 text-slate-600"
            }`}
          >
            New Trade License
          </button>
          <button
            type="button"
            onClick={() => update("applicationType", "renewal")}
            className={`flex-1 rounded-md border px-4 py-2.5 text-sm font-semibold ${
              form.applicationType === "renewal" ? "border-nnm-blue bg-blue-50 text-nnm-blue" : "border-slate-200 text-slate-600"
            }`}
          >
            Trade License Renewal
          </button>
        </div>

        {form.applicationType === "renewal" && (
          <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4">
            <label className={labelClass}>Holding number</label>
            <div className="flex gap-2">
              <input value={form.holdingNo ?? ""} onChange={(e) => update("holdingNo", sanitizeHoldingNoInput(e.target.value))} className={inputClass} />
              <button
                type="button"
                onClick={handleCheckRenewal}
                disabled={autofillChecking}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-nnm-blue px-4 py-2.5 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
              >
                {autofillChecking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Fetch Details
              </button>
            </div>
            <label className={`${labelClass} mt-3`}>Mobile number registered on your last application</label>
            <input inputMode="tel" value={renewalMobile} onChange={(e) => setRenewalMobile(e.target.value)} className={inputClass} placeholder="10-digit mobile" />
            <p className="mt-1 text-xs text-slate-500">Details are shown only when the holding number and this mobile number match our records.</p>
            {autofillMessage && <p className="mt-2 text-xs text-slate-600">{autofillMessage}</p>}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-base font-semibold text-slate-900">Applicant Details</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Applicant name</label>
            <input required value={form.applicantName} onChange={(e) => update("applicantName", e.target.value)} className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>Relation</label>
              <select value={form.relationType ?? ""} onChange={(e) => update("relationType", e.target.value)} className={inputClass}>
                <option value="">—</option>
                <option value="S/O">S/O</option>
                <option value="W/O">W/O</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Name</label>
              <input value={form.relationName ?? ""} onChange={(e) => update("relationName", e.target.value)} className={inputClass} />
            </div>
          </div>
          <div>
            <label className={labelClass}>Mobile{isPublic && <span className="text-red-600"> *</span>}</label>
            <input inputMode="tel" required={isPublic} value={form.mobile ?? ""} onChange={(e) => update("mobile", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Email ID</label>
            <input type="email" value={form.email ?? ""} onChange={(e) => update("email", e.target.value)} className={inputClass} />
          </div>
          {form.applicationType === "new" && (
            <div>
              <label className={labelClass}>Holding number (optional)</label>
              <input value={form.holdingNo ?? ""} onChange={(e) => update("holdingNo", sanitizeHoldingNoInput(e.target.value))} className={inputClass} />
            </div>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-base font-semibold text-slate-900">Entity Details</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Name of entity (English)</label>
            <input required value={form.entityName} onChange={(e) => update("entityName", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Name of entity (Hindi)</label>
            <input value={form.entityNameHindi ?? ""} onChange={(e) => update("entityNameHindi", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Type</label>
            <select value={form.entityType ?? ""} onChange={(e) => update("entityType", e.target.value as TradeLicenseApplicationInput["entityType"])} className={inputClass}>
              <option value="">Select…</option>
              <option value="fully_owned">Fully Owned</option>
              <option value="partnership">Partnership</option>
              <option value="pvt_limited">Private Limited</option>
              <option value="public_ltd">Public Limited</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Type of business{isPublic && <span className="text-red-600"> *</span>}</label>
            <select value={form.businessCategory ?? ""} onChange={(e) => update("businessCategory", e.target.value)} className={inputClass}>
              <option value="">Select…</option>
              {BUSINESS_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>
              {form.businessCategory === "Others" ? (
                <>
                  Describe the business <span className="text-red-600">*</span>
                </>
              ) : (
                "What the business does (e.g. kirana store, mobile repair)"
              )}
            </label>
            <input value={form.typeOfBusiness ?? ""} onChange={(e) => update("typeOfBusiness", e.target.value)} maxLength={200} className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Complete address</label>
            <input required value={form.completeAddress} onChange={(e) => update("completeAddress", e.target.value)} className={inputClass} />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-base font-semibold text-slate-900">Commercial Area</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Commercial area (sqft)</label>
            <input
              type="number"
              min="0"
              value={form.commercialAreaSqft ?? ""}
              onChange={(e) => update("commercialAreaSqft", e.target.value ? Number(e.target.value) : null)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Ownership of area</label>
            <select
              value={form.areaOwnership ?? ""}
              onChange={(e) => update("areaOwnership", e.target.value as TradeLicenseApplicationInput["areaOwnership"])}
              className={inputClass}
            >
              <option value="">Select…</option>
              <option value="self_owned">Self Owned</option>
              <option value="rented">Rented</option>
            </select>
          </div>
          {form.areaOwnership === "rented" && (
            <div>
              <label className={labelClass}>Name of houseowner</label>
              <input value={form.houseownerName ?? ""} onChange={(e) => update("houseownerName", e.target.value)} className={inputClass} />
            </div>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-1 text-base font-semibold text-slate-900">Questions &amp; Documents</h2>
        <p className="mb-4 text-xs text-slate-500">
          {isPublic ? "Upload clear copies — fields marked * are required." : "Upload any documents received with the paper application (or tick them in the checklist later)."}
        </p>
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <YesNo label="Is it a stall / shop of Nagar Nigam Munger?" value={form.isNnmShop} onChange={(v) => update("isNnmShop", v)} />
            {form.isNnmShop && (
              <div>
                <label className={labelClass}>Stall / shop number</label>
                <input value={form.nnmShopNo ?? ""} onChange={(e) => update("nnmShopNo", e.target.value)} maxLength={50} className={inputClass} />
              </div>
            )}
          </div>

          <FileField
            label="Holding tax payment receipt"
            hint={form.isNnmShop ? "Not needed for a Nagar Nigam stall/shop — attach it if you have one." : "Latest receipt of the holding where the business runs."}
            required={isPublic && !form.isNnmShop}
            {...fileProps("holding_receipt")}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <YesNo label="Is the applicant BPL?" value={form.isBpl} onChange={(v) => update("isBpl", v)} />
            {form.isBpl && <FileField label="BPL proof" required={isPublic} {...fileProps("bpl_proof")} />}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <YesNo label="Is the business registered under GST?" value={form.isGstRegistered} onChange={(v) => update("isGstRegistered", v)} />
            {form.isGstRegistered && (
              <div>
                <label className={labelClass}>
                  GSTIN <span className="text-red-600">*</span>
                </label>
                <input value={form.tanOrGstrNumber ?? ""} onChange={(e) => update("tanOrGstrNumber", e.target.value.toUpperCase())} maxLength={50} className={inputClass} />
              </div>
            )}
          </div>
          {form.isGstRegistered && <FileField label="GSTR-3B return (latest)" required={isPublic} {...fileProps("gstr_3b")} />}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>PAN of applicant</label>
              <input value={form.panNumber ?? ""} onChange={(e) => update("panNumber", e.target.value.toUpperCase())} maxLength={20} className={inputClass} />
            </div>
            <FileField label="PAN card of applicant" required={isPublic} {...fileProps("pan_applicant")} />
            <div>
              <label className={labelClass}>PAN of firm (if any)</label>
              <input value={form.firmPanNumber ?? ""} onChange={(e) => update("firmPanNumber", e.target.value.toUpperCase())} maxLength={20} className={inputClass} />
            </div>
            <FileField label="PAN card of firm" required={false} {...fileProps("pan_firm")} />
          </div>

          <FileField label="Photo of shop" hint="A clear photo of the shop front with its name board." required={isPublic} photoOnly {...fileProps("shop_photo")} />
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-base font-semibold text-slate-900">License Terms</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Duration of license applied for</label>
            <select value={form.durationYears} onChange={(e) => update("durationYears", Number(e.target.value))} className={inputClass}>
              <option value={1}>1 year</option>
              <option value={3}>3 years</option>
              <option value={5}>5 years</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Annual turnover</label>
            <select
              value={form.annualTurnoverBracket ?? ""}
              onChange={(e) => update("annualTurnoverBracket", e.target.value as TradeLicenseApplicationInput["annualTurnoverBracket"])}
              className={inputClass}
            >
              <option value="">Select…</option>
              <option value="upto_10L">Up to ₹10 lakh</option>
              <option value="above_10L">Above ₹10 lakh</option>
            </select>
          </div>
        </div>
        <p className="mt-4 text-xs text-slate-500">
          The licence is valid from its date of issue for the duration applied for (e.g. 1 year from issue). All documents submitted must be
          self-attested.
        </p>
      </section>

      <button
        type="submit"
        disabled={submitting || uploading !== null}
        className="inline-flex items-center gap-2 rounded-md bg-nnm-blue px-6 py-3 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
      >
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        {submitting ? "Submitting…" : "Submit Application"}
      </button>
    </form>
  );
}

export function TradeLicenseSubmitSuccess({ result }: { result: SubmitResult }) {
  return (
    <div role="status" className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-6 text-sm text-green-800">
      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
      <div>
        <p className="font-semibold">Application submitted — reference {result.applicationNumber}</p>
        <p className="mt-1 text-green-700">
          Reviewed by Trade License Nodal, then City Manager, then Deputy Municipal Commissioner (final approval).
          Keep this reference number to check on its status.
        </p>
      </div>
    </div>
  );
}