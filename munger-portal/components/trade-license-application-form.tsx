"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Search } from "lucide-react";
import { sanitizeHoldingNoInput } from "@/lib/holding-no";
import {
  submitPublicTradeLicenseApplication,
  submitOperatorTradeLicenseApplication,
  fetchRenewalAutofill,
  type TradeLicenseApplicationInput,
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
};

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
            <label className={labelClass}>Mobile</label>
            <input value={form.mobile ?? ""} onChange={(e) => update("mobile", e.target.value)} className={inputClass} />
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
          <div className="flex items-center gap-2 pt-6">
            <input
              type="checkbox"
              id="holdingReceiptAttached"
              checked={form.holdingReceiptAttached}
              onChange={(e) => update("holdingReceiptAttached", e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            <label htmlFor="holdingReceiptAttached" className="text-sm text-slate-700">Holding receipt attached</label>
          </div>
          <div className="flex items-center gap-2 pt-6">
            <input
              type="checkbox"
              id="bplProofAttached"
              checked={form.bplProofAttached}
              onChange={(e) => update("bplProofAttached", e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            <label htmlFor="bplProofAttached" className="text-sm text-slate-700">BPL category proof attached</label>
          </div>
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
          <div>
            <label className={labelClass}>Type of business</label>
            <input value={form.typeOfBusiness ?? ""} onChange={(e) => update("typeOfBusiness", e.target.value)} className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Complete address</label>
            <input required value={form.completeAddress} onChange={(e) => update("completeAddress", e.target.value)} className={inputClass} />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-base font-semibold text-slate-900">Commercial Area &amp; IDs</h2>
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
          <div>
            <label className={labelClass}>TAN Number / GSTR Number</label>
            <input value={form.tanOrGstrNumber ?? ""} onChange={(e) => update("tanOrGstrNumber", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>PAN Number</label>
            <input value={form.panNumber ?? ""} onChange={(e) => update("panNumber", e.target.value)} className={inputClass} />
          </div>
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
          All documents submitted must be self-attested.
        </p>
      </section>

      <button
        type="submit"
        disabled={submitting}
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