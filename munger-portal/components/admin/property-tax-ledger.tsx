"use client";

import { useState } from "react";
import { AlertTriangle, FileText, Loader2, Printer, Receipt } from "lucide-react";
import { fetchDemandNoticeReprintAdmin, fetchReceiptReprintAdmin } from "@/lib/admin-api";
import type { DemandNoticeReprintData } from "@/lib/demand-notice-api";
import type { PrintableReceiptHistory } from "@/lib/operator-api";
import type { PropertyReport, ReportDemandNotice, ReportPayment } from "@/lib/admin-property-api";
import { NoticeView } from "@/components/operator/notice-view";
import { ReceiptReprintView } from "@/components/operator/receipt-reprint-view";

/**
 * Property-wise report: every demand notice and every payment of the holding, with reprints. A year paid by two valid
 * receipts is flagged - that is a double collection to be refunded / adjusted.
 */

const money = (v: unknown) => `₹${Number(v ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (v: string | null | undefined) => (v ? new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "-");

function Badge({ tone, children }: { tone: "green" | "red" | "amber" | "slate" | "blue"; children: React.ReactNode }) {
  const cls = {
    green: "bg-green-100 text-green-800",
    red: "bg-red-100 text-red-800",
    amber: "bg-amber-100 text-amber-800",
    slate: "bg-slate-100 text-slate-600",
    blue: "bg-blue-100 text-blue-800",
  }[tone];
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${cls}`}>{children}</span>;
}

function noticeStatus(n: ReportDemandNotice) {
  if (n.wrongly_generated) return <Badge tone="red">Wrongly generated - not payable</Badge>;
  if (n.cancelled) return <Badge tone="red">Cancelled</Badge>;
  if (n.on_hold) return <Badge tone="amber">Paid - cheque/DD on hold</Badge>;
  if (n.settled) return <Badge tone="green">Paid</Badge>;
  if (n.superseded) return <Badge tone="slate">Superseded</Badge>;
  return <Badge tone="blue">Open</Badge>;
}

const noticePeriod = (n: ReportDemandNotice) =>
  n.part_payment && n.paid_through_year
    ? `Part: up to ${n.paid_through_year}`
    : n.demand_from_year && n.demand_upto_year && n.demand_from_year !== n.demand_upto_year
      ? `${n.demand_from_year} to ${n.demand_upto_year}`
      : (n.demand_upto_year ?? n.assessment_year ?? "-");

const paidYear = (t: ReportPayment) => (t.part_payment && t.paid_through_year ? t.paid_through_year : t.notice_year);
const validPayment = (t: ReportPayment) => !t.cancelled && t.status === "success";

export function PropertyTaxLedger({ report }: { report: PropertyReport }) {
  const notices = report.demandNotices ?? [];
  const payments = report.payments ?? [];
  const online = report.onlineOrders ?? [];
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<DemandNoticeReprintData | null>(null);
  const [receipt, setReceipt] = useState<PrintableReceiptHistory | null>(null);

  // Full (non-part) payments by year - more than one valid receipt for a year is a double collection.
  const byYear = new Map<string, string[]>();
  for (const t of payments) {
    if (!validPayment(t) || t.part_payment || !t.notice_year) continue;
    byYear.set(t.notice_year, [...(byYear.get(t.notice_year) ?? []), t.receipt_no]);
  }
  const doubles = [...byYear.entries()].filter(([, r]) => r.length > 1);
  const doubleReceipts = new Set(doubles.flatMap(([, r]) => r));

  async function open(kind: "notice" | "receipt", id: string) {
    setBusy(`${kind}:${id}`);
    setError(null);
    try {
      if (kind === "notice") setNotice(await fetchDemandNoticeReprintAdmin(id));
      else setReceipt(await fetchReceiptReprintAdmin(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open this document.");
    } finally {
      setBusy(null);
    }
  }

  if (notice) {
    return (
      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
        <NoticeView notice={notice} onClose={() => setNotice(null)} closeLabel="Back to report" />
      </section>
    );
  }
  if (receipt) {
    return (
      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
        <ReceiptReprintView receipt={receipt} onClose={() => setReceipt(null)} />
      </section>
    );
  }

  const OpenBtn = ({ kind, id }: { kind: "notice" | "receipt"; id: string }) => (
    <button
      type="button"
      onClick={() => open(kind, id)}
      disabled={busy !== null}
      className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
    >
      {busy === `${kind}:${id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Printer className="h-3 w-3" />} View
    </button>
  );

  return (
    <>
      {error && (
        <p role="alert" className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {(doubles.length > 0 || online.length > 0) && (
        <div role="alert" className="mb-6 space-y-1 rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          {doubles.map(([year, receipts]) => (
            <p key={year} className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <b>{year} has been paid {receipts.length} times</b> (receipts {receipts.join(", ")}). The extra amount must be refunded or adjusted -
                cancel the extra receipt through the Tax Daroga.
              </span>
            </p>
          ))}
          {online.map((o) => (
            <p key={o.order_id} className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Online payment {o.order_id} of {money(o.amount)} ({date(o.created_at)}) is{" "}
                <b>{o.status === "needs_review" ? "under review - the bank may have taken the money" : "awaiting the bank's confirmation"}</b>
                {o.failure_reason ? ` - ${o.failure_reason}` : ""}.
              </span>
            </p>
          ))}
        </div>
      )}

      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Receipt className="h-4 w-4" /> Payments ({payments.length})
        </h2>
        {payments.length === 0 ? (
          <p className="text-sm text-slate-400">No payment has been recorded for this holding.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-400">
                <tr>
                  <th className="pb-2 pr-3">Receipt</th>
                  <th className="pb-2 pr-3">Date</th>
                  <th className="pb-2 pr-3 text-right">Amount</th>
                  <th className="pb-2 pr-3">Mode</th>
                  <th className="pb-2 pr-3">Paid for</th>
                  <th className="pb-2 pr-3">Received by</th>
                  <th className="pb-2 pr-3">Status</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {payments.map((t) => {
                  const year = paidYear(t);
                  return (
                    <tr key={t.receipt_no} className={`border-t border-slate-100 align-top ${doubleReceipts.has(t.receipt_no) ? "bg-red-50" : t.cancelled ? "text-slate-400" : ""}`}>
                      <td className="py-2 pr-3 font-mono">{t.receipt_no}</td>
                      <td className="whitespace-nowrap py-2 pr-3">{date(t.txn_date)}</td>
                      <td className={`py-2 pr-3 text-right font-semibold ${t.cancelled ? "line-through" : ""}`}>{money(t.amount_received)}</td>
                      <td className="py-2 pr-3">{t.payment_mode}</td>
                      <td className="py-2 pr-3">
                        {year ? (
                          <>
                            {t.part_payment ? "Arrears" : "Tax"} till <b>{year}</b>
                          </>
                        ) : (
                          "-"
                        )}
                        {t.arrear_periods_paid && <div className="text-[11px] text-slate-500">Arrears: {t.arrear_periods_paid}</div>}
                        {t.demand_no && <div className="text-[11px] text-slate-500">Notice {t.demand_no}</div>}
                      </td>
                      <td className="py-2 pr-3">
                        {t.collected_by ?? "-"}
                        {t.tax_collector_name && <div className="text-[11px] text-slate-500">TC: {t.tax_collector_name}</div>}
                      </td>
                      <td className="py-2 pr-3">
                        {t.cancelled ? (
                          <Badge tone="red">Cancelled</Badge>
                        ) : t.status !== "success" ? (
                          <Badge tone="amber">{t.status}</Badge>
                        ) : doubleReceipts.has(t.receipt_no) ? (
                          <Badge tone="red">Year paid twice</Badge>
                        ) : (
                          <Badge tone="green">Valid</Badge>
                        )}
                        {t.cancelled_reason && <div className="mt-1 text-[11px]">{t.cancelled_reason}</div>}
                        {!t.cancelled && t.reconcile_status === "pending" && <div className="mt-1 text-[11px] text-amber-700">Reconciliation pending</div>}
                      </td>
                      <td className="py-2">
                        <OpenBtn kind="receipt" id={t.receipt_no} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <FileText className="h-4 w-4" /> Demand Notices ({notices.length})
        </h2>
        {notices.length === 0 ? (
          <p className="text-sm text-slate-400">No demand notice has been generated for this holding.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-400">
                <tr>
                  <th className="pb-2 pr-3">Notice No</th>
                  <th className="pb-2 pr-3">Date</th>
                  <th className="pb-2 pr-3">Period</th>
                  <th className="pb-2 pr-3 text-right">Amount</th>
                  <th className="pb-2 pr-3">Generated by</th>
                  <th className="pb-2 pr-3">Status</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {notices.map((n) => (
                  <tr key={n.demand_no} className={`border-t border-slate-100 align-top ${n.superseded || n.cancelled ? "text-slate-400" : ""}`}>
                    <td className="py-2 pr-3 font-mono">
                      {n.demand_no}
                      {n.reminder_number > 0 && <div className="font-sans text-[11px] text-slate-500">Reminder {n.reminder_number}</div>}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3">{date(n.notice_date)}</td>
                    <td className="py-2 pr-3">{noticePeriod(n)}</td>
                    <td className="py-2 pr-3 text-right font-semibold">{money(n.total_amount_demanded)}</td>
                    <td className="py-2 pr-3">{n.generated_by}</td>
                    <td className="py-2 pr-3">
                      {noticeStatus(n)}
                      {n.settled && n.settled_receipt_no && (
                        <div className="mt-1 text-[11px] text-slate-500">
                          Receipt {n.settled_receipt_no}
                          {n.settled_at ? `, ${date(n.settled_at)}` : ""}
                        </div>
                      )}
                      {n.cancelled_reason && <div className="mt-1 text-[11px]">{n.cancelled_reason}</div>}
                    </td>
                    <td className="py-2">
                      <OpenBtn kind="notice" id={n.demand_no} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
