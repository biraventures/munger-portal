"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { actOnInstrument, fetchInstruments, type InstrumentRow, type InstrumentStatus } from "@/lib/admin-api";
import { describePaymentDetails, reconciliationRule } from "@/lib/payment-modes";

const RECONCILE_MODES = ["Card", "UPI", "Online Banking", "Cheque", "Demand Draft"];

const ALLOWED = ["agency_project_manager", "tax_daroga", "commissioner", "deputy_commissioner", "city_manager"];
const inputClass = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-nnm-blue";

const STATUS_LABEL: Record<InstrumentStatus, string> = {
  pending: "Reconciliation pending - with Project Manager",
  pm_verified: "Reconciliation pending - with Tax Daroga",
  reconciled: "Reconciled",
  bounced: "Bounced / invalid",
  cancelled: "Cancelled",
};
const STATUS_STYLE: Record<InstrumentStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  pm_verified: "bg-blue-100 text-blue-800",
  reconciled: "bg-green-100 text-green-800",
  bounced: "bg-red-100 text-red-700",
  cancelled: "bg-slate-200 text-slate-600",
};

type Action = "pm-verify" | "reconcile" | "bounce";

export default function InstrumentReconciliationPage() {
  const admin = useAdminGuard();
  const [tab, setTab] = useState<"open" | "closed" | "all">("open");
  const [mode, setMode] = useState("");
  const [rows, setRows] = useState<InstrumentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<{ receiptNo: string; action: Action } | null>(null);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  function load() {
    setRows(null);
    fetchInstruments(tab, mode || undefined)
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load cheques / DDs."));
  }

  useEffect(() => {
    if (!admin || !ALLOWED.includes(admin.role)) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, tab, mode]);

  if (!admin) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  if (!ALLOWED.includes(admin.role)) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <p className="p-10 text-sm text-slate-500">This page is for the Project Manager and the Tax Daroga.</p>
      </div>
    );
  }

  const isPm = admin.role === "agency_project_manager";
  const isDaroga = admin.role === "tax_daroga";

  function actionsFor(r: InstrumentRow): { action: Action; label: string; tone: string }[] {
    const out: { action: Action; label: string; tone: string }[] = [];
    if (isPm && r.status === "pending") out.push({ action: "pm-verify", label: "Credited - verify", tone: "bg-nnm-blue text-white" });
    if (isDaroga && r.status === "pm_verified") out.push({ action: "reconcile", label: "Reconcile", tone: "bg-green-600 text-white" });
    if ((isPm || isDaroga) && (r.status === "pending" || r.status === "pm_verified")) {
      out.push({ action: "bounce", label: "Bounced / invalid", tone: "border border-red-300 text-red-700" });
    }
    return out;
  }

  async function submit() {
    if (!acting) return;
    if (acting.action === "bounce" && text.trim().length < 3) {
      setError("Give the reason it bounced / is invalid.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await actOnInstrument(acting.receiptNo, acting.action, text.trim());
      setActing(null);
      setText("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">Payment Reconciliation</h1>
        <p className="mb-6 text-sm text-slate-500">
          Card, UPI, online banking, cheque and DD collections stay &quot;reconciliation pending&quot; until the Project Manager confirms
          the amount is credited to the Nagar Nigam account and the Tax Daroga then reconciles it. Cheque/DD receipts are provisional and
          their demand is on hold meanwhile. If a payment bounces or is invalid, the receipt is cancelled and the demand becomes unpaid
          again. Cash is reconciled at collection.
        </p>

        {error && (
          <div role="alert" className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="mb-4 flex gap-2">
          {(["open", "closed", "all"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${tab === t ? "bg-nnm-blue text-white" : "border border-slate-300 bg-white text-slate-700"}`}
            >
              {t === "open" ? "Reconciliation pending" : t === "closed" ? "Closed" : "All"}
            </button>
          ))}
          <select value={mode} onChange={(e) => setMode(e.target.value)} className="ml-auto rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm">
            <option value="">All modes</option>
            {RECONCILE_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        {!rows ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Nothing here.</p>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => (
              <div key={r.receiptNo} className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-slate-900">
                      {r.paymentMode} · ₹{Number(r.amountReceivedActual ?? r.amount).toLocaleString("en-IN")} received
                      <span className="font-normal text-slate-500"> (demanded ₹{Number(r.amountDemanded ?? r.amount).toLocaleString("en-IN")})</span>
                      {reconciliationRule(r.paymentMode) === "hold" && r.status !== "reconciled" && r.status !== "bounced" && r.status !== "cancelled" && (
                        <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">Demand on hold</span>
                      )}
                    </div>
                    <div className="text-slate-600">
                      {describePaymentDetails(r.paymentMode, {
                        no: r.instrumentNo,
                        date: r.instrumentDate,
                        bank: r.bankName,
                        branch: r.branchName,
                        cardType: r.cardType,
                        cardHolderName: r.cardHolderName,
                        cardLast4: r.cardLast4,
                      })
                        .map(([l, v]) => `${l}: ${v}`)
                        .join(" · ") || "No details recorded"}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Receipt {r.receiptNo} · {r.txnDate} · Holding {r.holdingNo} ({r.ownerName}, Ward {r.ward ?? "-"}) · Demand {r.demandNo ?? "-"} ·
                      Collected by {r.taxCollectorName ?? r.collectedBy}
                    </div>
                    {(r.pmVerifiedBy || r.reconciledBy || r.remarks) && (
                      <div className="mt-1 text-xs text-slate-500">
                        {r.pmVerifiedBy && `Verified by PM: ${r.pmVerifiedBy} [ID ${r.pmVerifiedById ?? "-"}] on ${r.pmVerifiedAt} `}
                        {r.reconciledBy && `· ${r.status === "bounced" ? "Marked bounced" : "Reconciled"} by ${r.reconciledBy} [ID ${r.reconciledById ?? "-"}] on ${r.reconciledAt} `}
                        {r.remarks && `· ${r.remarks}`}
                      </div>
                    )}
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                </div>

                {acting?.receiptNo === r.receiptNo ? (
                  <div className="mt-3 space-y-2">
                    <input
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder={acting.action === "bounce" ? "Reason (e.g. returned unpaid - insufficient funds)" : "Remarks (optional, e.g. bank statement date)"}
                      className={inputClass}
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={submit}
                        disabled={saving}
                        className="inline-flex items-center gap-2 rounded-md bg-nnm-blue px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                      >
                        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        Confirm
                      </button>
                      <button onClick={() => setActing(null)} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700">
                        Back
                      </button>
                    </div>
                  </div>
                ) : (
                  actionsFor(r).length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {actionsFor(r).map((a) => (
                        <button
                          key={a.action}
                          onClick={() => {
                            setActing({ receiptNo: r.receiptNo, action: a.action });
                            setText("");
                          }}
                          className={`rounded-md px-3 py-1.5 text-xs font-semibold ${a.tone}`}
                        >
                          {a.label}
                        </button>
                      ))}
                    </div>
                  )
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
