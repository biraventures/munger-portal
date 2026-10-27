"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle, AlertTriangle, CheckCircle2, CreditCard, Download, FileCheck2, Loader2, Printer, Search } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ApplicationForm } from "@/components/building-permit/application-form";
import { downloadPermitFile, fetchStatus, rupees, startOnlinePayment, type ApplicantView } from "@/lib/building-permit-api";

const inputClass = "w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue";
const fmt = (s: string | null | undefined) => (s ? new Date(s).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) : "");

const FLOW = ["submitted", "scrutiny", "awaiting_payment", "processing", "authority", "sanctioned", "approved"];
const FLOW_LABELS = ["Site verification", "Technical scrutiny", "Fee payment", "File processing", "Competent authority", "Approval issued", "Approved"];

function StatusContent() {
  const params = useSearchParams();
  const [appNo, setAppNo] = useState(params.get("app") ?? "");
  const [mobile, setMobile] = useState("");
  const [view, setView] = useState<ApplicantView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [resubmitted, setResubmitted] = useState(false);
  const paymentFlag = params.get("payment");

  const load = useCallback(async (a: string, m: string) => {
    setBusy(true);
    setError(null);
    try {
      const v = await fetchStatus(a.trim(), m.trim());
      setView(v);
      try {
        sessionStorage.setItem("bp_lookup", JSON.stringify({ applicationNo: a.trim(), mobile: m.trim() }));
      } catch {
        /* storage blocked */
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not find the application.");
      setView(null);
    } finally {
      setBusy(false);
    }
  }, []);

  // Back from the bank: the mobile was kept in this tab's session.
  useEffect(() => {
    try {
      const c = JSON.parse(sessionStorage.getItem("bp_lookup") ?? "null");
      if (c && (!params.get("app") || c.applicationNo === params.get("app"))) {
        setAppNo(c.applicationNo);
        setMobile(c.mobile);
        void load(c.applicationNo, c.mobile);
      }
    } catch {
      /* ignore */
    }
  }, [params, load]);

  // While the bank has not confirmed, look again every 10 s for 2 minutes.
  useEffect(() => {
    if (!view?.onlinePaymentPending) return;
    let n = 0;
    const t = setInterval(() => {
      if (++n > 12) return clearInterval(t);
      void load(appNo, mobile);
    }, 10000);
    return () => clearInterval(t);
  }, [view?.onlinePaymentPending, appNo, mobile, load]);

  async function pay() {
    if (!view) return;
    setPaying(true);
    setError(null);
    try {
      const r = await startOnlinePayment(appNo.trim(), mobile.trim());
      window.location.href = r.redirectUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the payment.");
      setPaying(false);
    }
  }

  const stepIndex = view ? FLOW.indexOf(view.status) : -1;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="mb-1 font-display text-3xl font-semibold text-ink">Track Building Plan Application</h1>
      <p className="mb-6 text-sm text-ink-soft">
        Enter your application number and the mobile number given in the application. <Link href="/building-permit" className="font-semibold text-nnm-blue hover:underline">New application</Link>
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void load(appNo, mobile);
        }}
        className="mb-6 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_1fr_auto]"
      >
        <input aria-label="Application number" value={appNo} onChange={(e) => setAppNo(e.target.value.toUpperCase())} placeholder="Application no. e.g. BP262700001" className={inputClass} required />
        <input aria-label="Mobile number" inputMode="numeric" value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="Mobile number" className={inputClass} required />
        <button disabled={busy} className="inline-flex items-center justify-center gap-1.5 rounded-md bg-nnm-blue px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Show
        </button>
      </form>

      {error && (
        <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}
      {paymentFlag && view && (
        <div className={`mb-5 rounded-md border p-3 text-sm ${view.payment ? "border-green-200 bg-green-50 text-green-800" : view.onlinePaymentPending ? "border-amber-200 bg-amber-50 text-amber-900" : "border-red-200 bg-red-50 text-red-700"}`}>
          {view.payment ? "Payment received - thank you." : view.onlinePaymentPending ? "Waiting for the bank to confirm the payment. Please do not pay again." : "The payment was not completed. You can try again."}
        </div>
      )}

      {view && (
        <div className="space-y-5">
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs text-slate-500">Application {view.applicationNo} - {view.applicantName}</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{view.statusLabel}</p>
            <p className="text-sm text-slate-600">
              {view.useType} - Ward {view.ward} - {view.siteAddress}
            </p>
            {stepIndex >= 0 && (
              <ol className="mt-4 grid grid-cols-7 gap-1" aria-label="Progress">
                {FLOW_LABELS.map((l, i) => (
                  <li key={l} className="text-center">
                    <span className={`mx-auto block h-2 rounded-full ${i < stepIndex || view.status === "approved" ? "bg-green-500" : i === stepIndex ? "bg-nnm-blue" : "bg-slate-200"}`} />
                    <span className={`mt-1 block text-[10px] leading-tight ${i === stepIndex ? "font-semibold text-slate-800" : "text-slate-400"}`}>{l}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {(view.status === "returned" || view.status === "rejected") && view.message && (
            <section className={`rounded-xl border p-4 text-sm ${view.status === "returned" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-red-200 bg-red-50 text-red-800"}`}>
              <p className="mb-1 flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="h-4 w-4" /> {view.status === "returned" ? "Correction needed" : "Reason for rejection"}
              </p>
              <p className="whitespace-pre-line">{view.message}</p>
            </section>
          )}

          <section className="rounded-xl border border-slate-200 bg-white p-5 text-sm">
            <h2 className="mb-2 font-semibold text-slate-800">{view.fees.final ? "Fee payable (fixed after technical scrutiny)" : "Estimated fee (fixed after technical scrutiny)"}</h2>
            <table className="w-full">
              <tbody>
                <tr><td className="py-1">Development fee</td><td className="text-right tabular-nums">{rupees(view.fees.development)}</td></tr>
                <tr><td className="py-1">Permit fee ({view.fees.builtUpSqm.toFixed(2)} sq m × ₹110)</td><td className="text-right tabular-nums">{rupees(view.fees.permit)}</td></tr>
                <tr><td className="py-1">Labour cess ({view.fees.builtUpSqm.toFixed(2)} sq m × ₹158.74)</td><td className="text-right tabular-nums">{rupees(view.fees.labourCess)}</td></tr>
                <tr className="border-t border-slate-200 font-semibold"><td className="py-1.5">Total</td><td className="text-right tabular-nums">{rupees(view.fees.total)}</td></tr>
              </tbody>
            </table>
            {view.payment && (
              <p className="mt-3 flex items-center gap-1.5 text-green-700">
                <CheckCircle2 className="h-4 w-4" /> Paid {rupees(view.payment.amount)} ({view.payment.mode}, ref. {view.payment.ref}) on {fmt(view.payment.paidAt)}
              </p>
            )}
            {view.status === "awaiting_payment" && !view.onlinePaymentPending && (
              <div className="mt-4 space-y-2">
                {view.onlinePaymentEnabled && (
                  <button onClick={pay} disabled={paying} className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-nnm-blue px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
                    {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />} Pay {rupees(view.fees.total)} online
                  </button>
                )}
                <p className="text-xs text-slate-500">You can also pay at the Nagar Nigam office counter; quote the application number.</p>
              </div>
            )}
            {view.onlinePaymentPending && <p className="mt-3 text-amber-800">An online payment is being confirmed by the bank. This page checks again automatically.</p>}
          </section>

          {view.status === "approved" && view.permit && (
            <section className="rounded-xl border-2 border-green-300 bg-green-50 p-5 text-sm text-green-900">
              <p className="mb-1 flex items-center gap-1.5 text-base font-semibold">
                <FileCheck2 className="h-5 w-5" /> Building plan approved
              </p>
              <p className="mb-3">
                Permit no. <b>{view.permit.permitNo}</b>, valid till {new Date(view.permit.validTill).toLocaleDateString("en-IN")}.
              </p>
              <div className="flex flex-wrap gap-2">
                <Link href="/building-permit/permit" className="inline-flex items-center gap-1.5 rounded-md bg-green-700 px-3 py-2 text-xs font-semibold text-white">
                  <Printer className="h-3.5 w-3.5" /> Print permit
                </Link>
                {view.permitDocuments.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => downloadPermitFile(appNo, mobile, d).catch((e) => setError(e instanceof Error ? e.message : String(e)))}
                    className="inline-flex items-center gap-1.5 rounded-md border border-green-700 px-3 py-2 text-xs font-semibold text-green-800"
                  >
                    <Download className="h-3.5 w-3.5" /> {d.label}
                  </button>
                ))}
              </div>
            </section>
          )}

          {view.edit && !resubmitted && (
            <section>
              <h2 className="mb-3 text-lg font-semibold text-slate-900">Correct and resubmit</h2>
              <ApplicationForm
                existing={view.edit}
                onSubmitted={() => {
                  setResubmitted(true);
                  void load(appNo, mobile);
                }}
              />
            </section>
          )}

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">History</h2>
            <ol className="space-y-2 text-sm">
              {view.timeline.map((t, i) => (
                <li key={i} className="flex gap-3">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-nnm-blue" />
                  <span>
                    <span className="font-medium text-slate-800">{t.label}</span>
                    <span className="block text-xs text-slate-500">{fmt(t.at)}</span>
                    {t.remarks && <span className="block whitespace-pre-line text-xs text-slate-600">{t.remarks}</span>}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}
    </main>
  );
}

export default function BuildingPermitStatusPage() {
  return (
    <div>
      <SiteHeader />
      <Suspense fallback={<Loader2 className="mx-auto mt-20 h-6 w-6 animate-spin text-slate-400" />}>
        <StatusContent />
      </Suspense>
      <SiteFooter />
    </div>
  );
}
