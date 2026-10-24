"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Loader2, MapPin } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { fetchFormOptions } from "@/lib/operator-api";
import { createRequest, submitRequest, updateRequest, type UploadedDoc } from "@/lib/new-holding-api";
import {
  blankForm,
  bodyFromForm,
  cardClass,
  DocumentsSection,
  labelClass,
  missingRequiredDocs,
  OwnerApplicantFields,
  ownerError,
  PropertyFields,
  type FormState,
} from "@/components/new-holding/request-form";

type Step = "owner" | "property" | "documents" | "done";

const STEPS: { id: Step; label: string }[] = [
  { id: "owner", label: "Owner" },
  { id: "property", label: "Property" },
  { id: "documents", label: "Documents" },
  { id: "done", label: "Submitted" },
];

export default function NewHoldingRequestPage() {
  const [step, setStep] = useState<Step>("owner");
  const [f, setFState] = useState<FormState>(blankForm);
  const setF = (u: (p: FormState) => FormState) => setFState(u);
  const [usageTypes, setUsageTypes] = useState<string[]>([]);
  const [gps, setGps] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [draft, setDraft] = useState<{ id: string; token: string } | null>(null);
  const [docs, setDocs] = useState<UploadedDoc[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [applicationNo, setApplicationNo] = useState<string | null>(null);

  useEffect(() => {
    fetchFormOptions()
      .then((o) => setUsageTypes(o.usageTypes))
      .catch(() => setError("Could not load the form. Please refresh the page."));
  }, []);

  const go = (s: Step) => {
    setError(null);
    setStep(s);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  function continueFromOwner(e: React.FormEvent) {
    e.preventDefault();
    const problem = ownerError(f, { aadhaarRequired: true });
    if (problem) return setError(problem);
    go("property");
  }

  function captureGps() {
    setError(null);
    if (!navigator.geolocation) return setError("This device cannot give a GPS location. Use a mobile phone at the property.");
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

  async function saveProperty(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const b = bodyFromForm(f, { aadhaarRequired: true });
    if (typeof b === "string") return setError(b);
    if (!gps) return setError("Capture the GPS location of the property (stand at the property and tap the button).");
    const body = { ...b, latitude: gps.lat, longitude: gps.lng, gpsAccuracy: gps.acc };
    setBusy(true);
    try {
      // Coming back from the documents step: the same draft is updated and keeps its documents.
      if (draft) await updateRequest(draft.id, draft.token, body);
      else {
        const r = await createRequest(body);
        setDraft({ id: r.requestId, token: r.uploadToken });
      }
      go("documents");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the details.");
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit() {
    if (!draft) return;
    setError(null);
    const missing = missingRequiredDocs(docs);
    if (missing.length) return setError(`Upload: ${missing.join("; ")}.`);
    setBusy(true);
    try {
      const r = await submitRequest(draft.id, draft.token);
      setApplicationNo(r.applicationNo);
      go("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit the request.");
    } finally {
      setBusy(false);
    }
  }

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <div>
      <SiteHeader />
      <main>
        <section className="bg-gradient-to-br from-nnm-blue to-nnm-blue-dark py-14 text-white">
          <div className="mx-auto max-w-6xl px-6">
            <span className="mb-2.5 block font-mono text-[12.5px] uppercase tracking-[0.14em] text-nnm-gold">Counter 01C</span>
            <h1 className="mb-3 font-display text-3xl font-semibold sm:text-4xl">New Holding Request</h1>
            <p className="max-w-2xl text-[17px] text-white/80">
              For a house or building that has never been assessed for holding tax. Give the details of the property and upload the documents
              and photos. The Tax Daroga checks that no holding already exists and enters it in the demand register, a Tax Surveyor verifies it at
              the site, and after the DMC the Commissioner approves the new holding. Holding tax is due from the year of construction. One mobile number can be used for at most two requests.{" "}
              <Link href="/new-holding/view" className="font-semibold text-nnm-gold underline">
                View / correct / track my request
              </Link>
            </p>
          </div>
        </section>

        <section className="bg-paper-dim py-10">
          <div className="mx-auto max-w-3xl space-y-5 px-4 sm:px-6">
            <ol className="flex flex-wrap gap-2 text-xs">
              {STEPS.map((s, i) => (
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

            {step === "owner" && (
              <form onSubmit={continueFromOwner} className="space-y-5">
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  If your property already has a holding number (even an old one), do not apply here - use{" "}
                  <Link href="/mutation" className="font-semibold underline">
                    Mutation of Holding
                  </Link>{" "}
                  to change the owner&apos;s name, or pay tax under that number.
                </div>
                <OwnerApplicantFields f={f} setF={setF} />
                <button className="rounded-md bg-nnm-blue px-5 py-2.5 text-sm font-semibold text-white">Continue</button>
              </form>
            )}

            {step === "property" && (
              <form onSubmit={saveProperty} className="space-y-5">
                <PropertyFields f={f} setF={setF} usageTypes={usageTypes} />
                <div className={cardClass}>
                  <label className={labelClass}>GPS location of the property</label>
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
                  <p className="mt-1 text-xs text-slate-500">Stand at the property with your phone and tap the button.</p>
                </div>
                <div className="flex gap-3">
                  <button type="button" onClick={() => go("owner")} className="rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700">
                    Back
                  </button>
                  <button disabled={busy} className="inline-flex items-center gap-2 rounded-md bg-nnm-blue px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                    Save &amp; upload documents
                  </button>
                </div>
              </form>
            )}

            {step === "documents" && draft && (
              <div className="space-y-4">
                <div className={cardClass}>
                  <h2 className="mb-1 text-base font-semibold text-slate-900">Documents and photos</h2>
                  <p className="mb-4 text-xs text-slate-500">PDF up to 2 MB each; photos are reduced to 750 KB automatically. Required ones are marked *.</p>
                  <DocumentsSection session={{ id: draft.id, uploadToken: draft.token }} docs={docs} setDocs={setDocs} onError={setError} />
                </div>
                <p className="text-xs text-slate-500">
                  By submitting, I declare that this property has no holding number with the Nagar Nigam and that the information and documents
                  given are true. A false declaration may lead to rejection and action under law.
                </p>
                <div className="flex flex-wrap gap-3">
                  <button type="button" onClick={() => go("property")} disabled={busy} className="rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700">
                    Back to details
                  </button>
                  <button onClick={onSubmit} disabled={busy} className="inline-flex items-center gap-2 rounded-md bg-nnm-blue px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                    Submit request
                  </button>
                </div>
              </div>
            )}

            {step === "done" && applicationNo && (
              <div className="rounded-xl border border-green-200 bg-green-50 p-8 text-center">
                <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-green-600" />
                <h2 className="mb-2 text-lg font-semibold text-green-800">Request submitted</h2>
                <p className="mb-1 text-sm text-green-800">Your application number is</p>
                <p className="mb-4 font-mono text-2xl font-bold tracking-wider text-green-900">{applicationNo}</p>
                <p className="mb-5 text-sm text-green-800">
                  Note it down. Until the Tax Daroga processes it you can still correct the request with this number and your mobile number, and
                  you can follow its progress at every desk.
                </p>
                <Link href={`/new-holding/view?no=${applicationNo}`} className="text-sm font-semibold text-nnm-blue hover:underline">
                  View / track this request
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
