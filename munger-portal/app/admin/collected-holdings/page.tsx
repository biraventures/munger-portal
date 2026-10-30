"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Fragment } from "react";
import { AlertCircle, CalendarDays, ChevronDown, ChevronUp, Download, Loader2 } from "lucide-react";
import { FieldVisitCard } from "@/components/admin/field-visit-card";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { downloadCollectedHoldings, fetchCollectedHoldings, type CollectedHoldingsReport } from "@/lib/agency-api";

const ROLES = ["agency_team_leader", "agency_project_manager", "tax_daroga", "city_manager", "deputy_commissioner", "commissioner"];
const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";
const todayIst = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
const money = (v: number | string) => `₹${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const time = (v: string) => new Date(v).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });

/** Holdings whose holding tax was collected on a chosen day - each one opens its property-wise report. */
export default function CollectedHoldingsPage() {
  const admin = useAdminGuard();
  const [date, setDate] = useState(todayIst());
  const [ward, setWard] = useState("");
  const [report, setReport] = useState<CollectedHoldingsReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openHolding, setOpenHolding] = useState<string | null>(null);

  async function load(d = date, w = ward) {
    setLoading(true);
    setError(null);
    try {
      setReport(await fetchCollectedHoldings(d, w.trim() || undefined));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the report.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (admin && ROLES.includes(admin.role)) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin]);

  if (!admin) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  if (!ROLES.includes(admin.role)) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <main className="mx-auto max-w-2xl px-6 py-10">
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" /> This report is not available for your login.
          </div>
        </main>
      </div>
    );
  }

  async function download() {
    setDownloading(true);
    setError(null);
    try {
      await downloadCollectedHoldings(date, ward.trim() || undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <CalendarDays className="h-6 w-6" /> Holdings Collected on a Day
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Every holding whose tax was collected on the chosen day - open any holding for its full property-wise report.
        </p>

        <div className="mt-5 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
          <label className="text-xs font-medium text-slate-600">
            Date
            <input type="date" value={date} max={todayIst()} onChange={(e) => setDate(e.target.value)} className={`mt-1 ${inputClass}`} />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Ward (optional)
            <input value={ward} onChange={(e) => setWard(e.target.value)} placeholder="All wards" className={`mt-1 ${inputClass}`} />
          </label>
          <button
            onClick={() => load()}
            disabled={loading || !date}
            className="rounded-md bg-nnm-blue px-5 py-2.5 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
          >
            {loading ? "Loading…" : "Show"}
          </button>
          <button
            onClick={download}
            disabled={downloading || !date}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Excel
          </button>
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {report && (
          <>
            <div className="mt-5 grid grid-cols-3 gap-3">
              {[
                ["Holdings", report.holdings.toLocaleString("en-IN")],
                ["Receipts", report.receipts.toLocaleString("en-IN")],
                ["Collected", money(report.total)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="text-xs text-slate-500">{k}</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">{v}</div>
                </div>
              ))}
            </div>

            <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200 bg-white">
              {report.rows.length === 0 ? (
                <p className="p-6 text-sm text-slate-400">No holding tax was collected on this day{ward ? ` in ward ${ward}` : ""}.</p>
              ) : (
                <table className="w-full min-w-[900px] text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Time</th>
                      <th className="px-3 py-2">Holding</th>
                      <th className="px-3 py-2">Owner</th>
                      <th className="px-3 py-2">Ward</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                      <th className="px-3 py-2">Mode</th>
                      <th className="px-3 py-2">Collected by</th>
                      <th className="px-3 py-2">Paid till</th>
                      <th className="px-3 py-2">Receipt</th>
                      <th className="px-3 py-2">Field visit &amp; documents</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((r) => {
                      const visits = report.fieldVisits?.[r.holding_no] ?? [];
                      const rowKey = `${r.receipt_no}`;
                      const isOpen = openHolding === rowKey;
                      return (
                        <Fragment key={r.receipt_no}>
                          <tr className={`border-t border-slate-100 align-top ${r.cancelled ? "text-slate-400" : ""}`}>
                            <td className="whitespace-nowrap px-3 py-2">{time(r.txn_time)}</td>
                            <td className="px-3 py-2">
                              <Link
                                href={`/admin/property-wise-report/${encodeURIComponent(r.holding_no)}`}
                                className="font-mono font-semibold text-nnm-blue hover:underline"
                              >
                                {r.holding_no}
                              </Link>
                              {r.old_holding_no && <div className="text-[11px] text-slate-500">Old: {r.old_holding_no}</div>}
                            </td>
                            <td className="px-3 py-2">
                              {r.owner_name ?? "-"}
                              {r.mobile_no && <div className="text-[11px] text-slate-500">{r.mobile_no}</div>}
                            </td>
                            <td className="px-3 py-2">{r.ward ?? "-"}</td>
                            <td className={`px-3 py-2 text-right font-semibold ${r.cancelled ? "line-through" : ""}`}>{money(r.amount)}</td>
                            <td className="px-3 py-2">{r.payment_mode}</td>
                            <td className="px-3 py-2">
                              {r.collected_by ?? "-"}
                              {r.tax_collector_name && <div className="text-[11px] text-slate-500">TC: {r.tax_collector_name}</div>}
                            </td>
                            <td className="px-3 py-2">{r.paid_till ?? "-"}</td>
                            <td className="px-3 py-2 font-mono">
                              {r.receipt_no}
                              {r.cancelled && <div className="font-sans text-[11px] font-semibold text-red-600">Cancelled</div>}
                              {!r.cancelled && r.reconcile_status === "pending" && (
                                <div className="font-sans text-[11px] text-amber-700">Recon. pending</div>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {visits.length === 0 ? (
                                <span className="text-red-600">No field visit</span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setOpenHolding(isOpen ? null : rowKey)}
                                  aria-expanded={isOpen}
                                  className="inline-flex items-center gap-1 text-left font-semibold text-nnm-blue hover:underline"
                                >
                                  {visits[0]!.captured_by_display_name}
                                  {visits[0]!.aadhaar_number ? ` · ${visits[0]!.aadhaar_number}` : ""}
                                  {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                </button>
                              )}
                            </td>
                          </tr>
                          {isOpen && (
                            <tr className="bg-slate-50">
                              <td colSpan={10} className="space-y-2 px-3 py-3">
                                {visits.map((v) => (
                                  <FieldVisitCard key={v.id} visit={v} viewerRole={admin.role} />
                                ))}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
