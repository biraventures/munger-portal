"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Loader2, Search } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { fetchFormOptions } from "@/lib/operator-api";
import { fetchRequestStatus, OWNERSHIP_BASIS, ROAD_TYPES, saveEdit, viewRequest, type RequestStatus, type TrailItem, type UploadedDoc, type ViewResult } from "@/lib/new-holding-api";
import {
  bodyFromForm,
  cardClass,
  DocumentsSection,
  FLOOR_LABELS,
  formFromRequest,
  inputClass,
  labelClass,
  missingRequiredDocs,
  OwnerApplicantFields,
  PropertyFields,
  type FormState,
} from "@/components/new-holding/request-form";

function fmt(v: string | null | undefined): string {
  return v ? new Date(v).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";
}

function Trail({ items }: { items: TrailItem[] }) {
  if (!items.length) return null;
  return (
    <ol className="space-y-2 text-sm">
      {items.map((t, i) => (
        <li key={i} className="flex gap-3">
          <span className="w-40 shrink-0 text-xs text-slate-500">{fmt(t.at)}</span>
          <span>
            <b className="text-slate-800">{t.label}</b> <span className="text-slate-500">· {t.by}</span>
            {t.remarks && <span className="block text-xs text-slate-600">“{t.remarks}”</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

function StatusBox({ status, remarks, newHoldingNo }: { status: string; remarks: string | null; newHoldingNo: string | null }) {
  return (
    <div className={`rounded-xl border p-4 text-sm ${newHoldingNo ? "border-green-200 bg-green-50 text-green-900" : "border-slate-200 bg-white text-slate-800"}`}>
      <div className="font-semibold">{status}</div>
      {remarks && <div className="mt-1 text-slate-700">Remarks: {remarks}</div>}
      {newHoldingNo && (
        <div className="mt-2">
          Use this number to{" "}
          <Link href="/property-tax" className="font-semibold underline">
            see the dues and pay holding tax
          </Link>
          .
        </div>
      )}
    </div>
  );
}

function ReadOnly({ v }: { v: ViewResult }) {
  const r = v.request;
  const row = (label: string, value: React.ReactNode) => (
    <div>
      <span className="text-slate-500">{label}:</span> <span className="text-slate-900">{value || "-"}</span>
    </div>
  );
  return (
    <div className={`${cardClass} space-y-3 text-sm`}>
      <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        {row("Owner", `${r.ownerName}${r.relationType ? ` ${r.relationType} ${r.relationName ?? ""}` : ""}`)}
        {row("Owner's mobile / Aadhaar", `${r.ownerMobile} / ${r.ownerAadhaarMasked}`)}
        {row("Applicant", `${r.applicantName} (${r.applicantMobile})`)}
        {row("Address", `${r.address}${r.landmark ? `, near ${r.landmark}` : ""}, ward ${r.ward}`)}
        {row("Land", `${OWNERSHIP_BASIS.find((b) => b.value === r.ownershipBasis)?.label ?? r.ownershipBasis}; plot ${Number(r.plotAreaSqft)} sq ft`)}
        {row("Land record", `Khata ${r.khataNo ?? "-"}, Khesra ${r.khesraNo ?? "-"}, Sheet ${r.surveySheetNo ?? "-"}, Survey ward ${r.surveyWard ?? "-"}`)}
        {row("Road / built in", `${ROAD_TYPES.find((x) => x.value === r.roadType)?.label ?? r.roadType}; ${r.constructionYear}`)}
      </div>
      <div>
        <div className="mb-1 text-slate-500">Floors</div>
        <ul className="list-inside list-disc text-slate-800">
          {r.floors.map((f, i) => (
            <li key={i}>
              {FLOOR_LABELS.find((l) => l.value === f.floorLabel)?.label}: {f.buildupSqft} sq ft, {f.constType}, {f.usageType}, {f.occupancy === "self" ? "owner" : "rented"}
              {f.yearBuilt ? `, built ${f.yearBuilt}` : ""}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ViewContent() {
  const params = useSearchParams();
  const [no, setNo] = useState(params.get("no") ?? "");
  const [mobile, setMobile] = useState("");
  const [status, setStatus] = useState<RequestStatus | null>(null);
  const [view, setView] = useState<ViewResult | null>(null);
  const [f, setFState] = useState<FormState | null>(null);
  const setF = (u: (p: FormState) => FormState) => setFState((p) => (p ? u(p) : p));
  const [docs, setDocs] = useState<UploadedDoc[]>([]);
  const [usageTypes, setUsageTypes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchFormOptions()
      .then((o) => setUsageTypes(o.usageTypes))
      .catch(() => undefined);
    const initial = params.get("no");
    if (initial) fetchRequestStatus(initial).then(setStatus).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function open(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setView(null);
    setStatus(null);
    if (!no.trim()) return setError("Enter the application number.");
    setBusy(true);
    try {
      if (!mobile.trim()) {
        setStatus(await fetchRequestStatus(no));
      } else {
        const v = await viewRequest(no.trim().toUpperCase(), mobile.trim());
        setView(v);
        setDocs(v.documents);
        setFState(formFromRequest(v.request));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the request.");
    } finally {
      setBusy(false);
    }
  }

  async function save(resubmit: boolean) {
    if (!view?.editToken || !f) return;
    setError(null);
    setNotice(null);
    const b = bodyFromForm(f, { aadhaarRequired: false });
    if (typeof b === "string") return setError(b);
    if (resubmit) {
      const missing = missingRequiredDocs(docs);
      if (missing.length) return setError(`Upload: ${missing.join("; ")}.`);
    }
    setBusy(true);
    try {
      const r = await saveEdit(view.requestId, view.editToken, { ...b, resubmit });
      setNotice(
        r.resubmitted
          ? "Saved and sent to the Tax Daroga again."
          : r.changed.length
            ? `Saved. Changed: ${r.changed.join(", ")}.`
            : "Nothing was changed.",
      );
      if (r.resubmitted) setView({ ...view, sentBack: false, status: "Received - with the Tax Daroga for verification", remarks: null });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the changes.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={open} className={`${cardClass} grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]`}>
        <div>
          <label className={labelClass}>Application number</label>
          <input value={no} onChange={(e) => setNo(e.target.value.toUpperCase())} placeholder="e.g. NHR26000012K" maxLength={24} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Mobile number (to view or correct)</label>
          <input value={mobile} onChange={(e) => setMobile(e.target.value)} inputMode="tel" maxLength={14} placeholder="Owner's or applicant's" className={inputClass} />
        </div>
        <button disabled={busy} className="inline-flex items-center justify-center gap-2 self-end rounded-md bg-nnm-blue px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {mobile.trim() ? "Open" : "Track"}
        </button>
        <p className="text-xs text-slate-500 sm:col-span-3">Without a mobile number only the progress is shown. With the mobile number you can see the full request and correct it while it is allowed.</p>
      </form>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      {notice && (
        <div className="flex items-start gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          {notice}
        </div>
      )}

      {status && !view && (
        <>
          <StatusBox status={status.status} remarks={status.remarks} newHoldingNo={status.newHoldingNo} />
          <div className={cardClass}>
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Progress</h2>
            <Trail items={status.trail} />
          </div>
        </>
      )}

      {view && f && (
        <>
          <StatusBox status={view.status} remarks={view.remarks} newHoldingNo={view.request.newHoldingNo} />
          {view.sentBack && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              The Tax Daroga has sent this request back to you. Correct it below (and upload any missing document), then press <b>Save &amp; resubmit</b>.
            </div>
          )}
          {!view.editable && view.reason && <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">{view.reason}</div>}

          {view.editable && view.editToken ? (
            <>
              <OwnerApplicantFields f={f} setF={setF} aadhaarMasked={view.request.ownerAadhaarMasked} />
              <PropertyFields f={f} setF={setF} usageTypes={usageTypes} />
              <div className={cardClass}>
                <h2 className="mb-1 text-base font-semibold text-slate-900">Documents and photos</h2>
                <p className="mb-4 text-xs text-slate-500">Add a corrected file first, then remove the wrong one. PDF up to 2 MB; photos are reduced to 750 KB automatically.</p>
                <DocumentsSection session={{ id: view.requestId, editToken: view.editToken }} docs={docs} setDocs={setDocs} onError={setError} />
              </div>
              <div className="flex flex-wrap gap-3">
                <button onClick={() => save(false)} disabled={busy} className="inline-flex items-center gap-2 rounded-md border border-nnm-blue bg-white px-5 py-2.5 text-sm font-semibold text-nnm-blue disabled:opacity-60">
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save changes
                </button>
                {view.sentBack && (
                  <button onClick={() => save(true)} disabled={busy} className="inline-flex items-center gap-2 rounded-md bg-nnm-blue px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                    Save &amp; resubmit
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-500">The editing session lasts 60 minutes; open the request again after that.</p>
            </>
          ) : (
            <>
              <ReadOnly v={view} />
              <div className={cardClass}>
                <h2 className="mb-2 text-base font-semibold text-slate-900">Documents</h2>
                <DocumentsSection session={{ id: view.requestId }} docs={docs} setDocs={setDocs} onError={setError} disabled />
              </div>
            </>
          )}

          <div className={cardClass}>
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Progress</h2>
            <Trail items={view.trail} />
          </div>
        </>
      )}
    </div>
  );
}

export default function NewHoldingViewPage() {
  return (
    <div>
      <SiteHeader />
      <main>
        <section className="bg-gradient-to-br from-nnm-blue to-nnm-blue-dark py-12 text-white">
          <div className="mx-auto max-w-6xl px-6">
            <span className="mb-2.5 block font-mono text-[12.5px] uppercase tracking-[0.14em] text-nnm-gold">Counter 01C</span>
            <h1 className="mb-2 font-display text-3xl font-semibold">My New Holding Request</h1>
            <p className="max-w-xl text-white/80">
              Track your request, see what you submitted, and correct it if the Tax Daroga has not yet taken it up or has sent it back to you.{" "}
              <Link href="/new-holding" className="font-semibold text-nnm-gold underline">
                Make a new request
              </Link>
            </p>
          </div>
        </section>
        <section className="bg-paper-dim py-10">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <Suspense fallback={<p className="text-sm text-slate-400">Loading…</p>}>
              <ViewContent />
            </Suspense>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
