"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Flame, Loader2, Printer, Search, XCircle } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import {
  cancelCremationTicket,
  dmy,
  fetchCremationFees,
  fetchCremationReport,
  rupees,
  setCremationFee,
  todayIst,
  type CremationReport,
  type CremationTicket,
} from "@/lib/crematorium-api";

const MONITORS = ["crematorium_prabhari", "commissioner", "deputy_commissioner", "city_manager"];
const input = "rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-nnm-blue focus:outline-none";

/**
 * Electric crematorium - Crematorium Prabhari, Municipal Commissioner, DMC and City Manager: every ticket of every
 * counter, totals by counter and payment mode. The Commissioner sets the fee; the Prabhari and the Commissioner can
 * cancel a ticket with a reason.
 */
export default function CrematoriumPage() {
  const admin = useAdminGuard();
  const [from, setFrom] = useState(todayIst());
  const [to, setTo] = useState(todayIst());
  const [counter, setCounter] = useState("");
  const [q, setQ] = useState("");
  const [data, setData] = useState<CremationReport | null>(null);
  const [fees, setFees] = useState<Awaited<ReturnType<typeof fetchCremationFees>>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newFee, setNewFee] = useState("");
  const [feeNote, setFeeNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [r, f] = await Promise.all([fetchCremationReport({ from, to, q, counter }), fetchCremationFees()]);
      setData(r);
      setFees(f);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load.");
    } finally {
      setLoading(false);
    }
  }, [from, to, q, counter]);

  useEffect(() => {
    if (admin && MONITORS.includes(admin.role)) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on Show, not on every keystroke
  }, [admin]);

  if (!admin) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  if (!MONITORS.includes(admin.role))
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <p className="mx-auto mt-10 max-w-xl rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Not available for your login.
        </p>
      </div>
    );

  const canCancel = admin.role === "crematorium_prabhari" || admin.role === "commissioner";

  async function saveFee() {
    const amount = Number(newFee);
    if (!newFee.trim() || !Number.isFinite(amount) || amount < 0) return window.alert("Enter the new fee.");
    if (!window.confirm(`Set the cremation fee to ${rupees(amount)}? New tickets will be cut at this fee.`)) return;
    try {
      await setCremationFee(amount, feeNote.trim());
      setNewFee("");
      setFeeNote("");
      await load();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Could not save the fee.");
    }
  }

  async function cancel(t: CremationTicket) {
    const reason = window.prompt(`Why cancel ticket ${t.ticketNo} (${t.deceasedName})?`);
    if (!reason?.trim()) return;
    try {
      await cancelCremationTicket(t.id, reason.trim());
      await load();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Could not cancel.");
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
            <Flame className="h-6 w-6 text-nnm-blue" /> Electric Crematorium
          </h1>
          <p className="text-sm text-slate-500">
            Tickets cut at every counter, the collection by counter and payment mode, and the cremation fee.
          </p>
        </div>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-2 text-sm font-semibold text-slate-800">Fee per cremation</h2>
          <p className="text-2xl font-bold text-slate-900">{data?.fee ? rupees(data.fee.amount) : "Not set"}</p>
          {data?.fee && (
            <p className="text-xs text-slate-500">
              Set {new Date(data.fee.setAt).toLocaleDateString("en-IN")}
              {data.fee.setByName ? ` by ${data.fee.setByName}` : ""}
            </p>
          )}
          {admin.role === "commissioner" ? (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <div>
                <label className="mb-1 block text-xs text-slate-500" htmlFor="fee-new">
                  New fee (₹)
                </label>
                <input
                  id="fee-new"
                  inputMode="decimal"
                  value={newFee}
                  onChange={(e) => setNewFee(e.target.value)}
                  className={`${input} w-32`}
                />
              </div>
              <div className="min-w-52 flex-1">
                <label className="mb-1 block text-xs text-slate-500" htmlFor="fee-note">
                  Order / remarks (optional)
                </label>
                <input id="fee-note" value={feeNote} onChange={(e) => setFeeNote(e.target.value)} className={`${input} w-full`} />
              </div>
              <button onClick={saveFee} className="rounded-md bg-nnm-blue px-4 py-2 text-sm font-semibold text-white">
                Set fee
              </button>
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-400">The fee is set by the Municipal Commissioner.</p>
          )}
          {fees.length > 1 && (
            <details className="mt-3 text-xs text-slate-600">
              <summary className="cursor-pointer text-slate-500">Earlier fees</summary>
              <ul className="mt-1 space-y-0.5">
                {fees.map((f, i) => (
                  <li key={i}>
                    {rupees(f.amount)} from {new Date(f.set_at).toLocaleDateString("en-IN")} {f.set_by_name ? `(${f.set_by_name})` : ""}
                    {f.remarks ? ` - ${f.remarks}` : ""}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex flex-wrap items-end gap-2">
            <div>
              <label className="mb-1 block text-xs text-slate-500" htmlFor="r-from">
                Cremation date from
              </label>
              <input id="r-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={input} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500" htmlFor="r-to">
                to
              </label>
              <input id="r-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className={input} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500" htmlFor="r-counter">
                Counter
              </label>
              <select id="r-counter" value={counter} onChange={(e) => setCounter(e.target.value)} className={input}>
                <option value="">All counters</option>
                {(data?.counters ?? []).map((c) => (
                  <option key={c.username} value={c.username}>
                    {c.display_name}
                    {c.active ? "" : " (inactive)"}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-48 flex-1">
              <label className="mb-1 block text-xs text-slate-500" htmlFor="r-q">
                Name / mobile / ticket no.
              </label>
              <input
                id="r-q"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && load()}
                className={`${input} w-full`}
              />
            </div>
            <button
              onClick={load}
              className="inline-flex items-center gap-1.5 rounded-md bg-nnm-blue px-4 py-2 text-sm font-semibold text-white"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Show
            </button>
          </div>

          {error && (
            <p role="alert" className="mb-3 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" /> {error}
            </p>
          )}

          {data && (
            <>
              <div className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
                <Stat label="Cremations" value={String(data.totals.tickets)} />
                <Stat label="Collection" value={rupees(data.totals.amount)} />
                <Stat label="Cash" value={rupees(data.totals.cash)} />
                <Stat label="POS (card + UPI)" value={rupees(data.totals.posCard + data.totals.posUpi)} />
                <Stat label="Cancelled tickets" value={String(data.totals.cancelled)} />
              </div>

              {data.byCounter.length > 0 && (
                <div className="mb-5 overflow-x-auto">
                  <table className="w-full text-sm [&_td]:px-2 [&_th]:px-2">
                    <thead>
                      <tr className="border-b text-left text-xs text-slate-500">
                        <th className="py-1.5">Counter</th>
                        <th className="text-right">Tickets</th>
                        <th className="text-right">Cash</th>
                        <th className="text-right">POS</th>
                        <th className="text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byCounter.map((c) => (
                        <tr key={c.username} className="border-b border-slate-100">
                          <td className="py-1.5">{c.name ?? c.username}</td>
                          <td className="text-right">{c.tickets}</td>
                          <td className="text-right">{rupees(c.cash)}</td>
                          <td className="text-right">{rupees(c.pos)}</td>
                          <td className="text-right font-semibold">{rupees(c.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {data.tickets.length === 0 ? (
                <p className="text-sm text-slate-400">No tickets for these dates.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm [&_td]:px-2 [&_th]:px-2">
                    <thead>
                      <tr className="border-b text-left text-xs text-slate-500">
                        <th className="py-1.5">Ticket</th>
                        <th>Deceased</th>
                        <th>Cremation</th>
                        <th>Informant</th>
                        <th className="text-right">Fee</th>
                        <th>Counter</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {data.tickets.map((t) => (
                        <tr
                          key={t.id}
                          className={`border-b border-slate-100 align-top ${t.status === "cancelled" ? "text-slate-400" : ""}`}
                        >
                          <td className="py-1.5 font-mono text-xs">{t.ticketNo}</td>
                          <td>
                            <span className={t.status === "cancelled" ? "line-through" : ""}>{t.deceasedName}</span>
                            {t.status === "cancelled" && (
                              <p className="text-xs text-red-600">
                                Cancelled by {t.cancelledByName}: {t.cancelReason}
                              </p>
                            )}
                          </td>
                          <td className="whitespace-nowrap">
                            {dmy(t.cremationDate)} {t.cremationTime}
                          </td>
                          <td>
                            {t.informantName} ({t.informantRelation})<p className="text-xs text-slate-500">{t.informantPhone}</p>
                          </td>
                          <td className="whitespace-nowrap text-right">
                            {rupees(t.amount)}
                            <p className="text-xs text-slate-500">{t.paymentModeLabel}</p>
                          </td>
                          <td className="text-xs">{t.issuedByName ?? t.issuedBy}</td>
                          <td className="whitespace-nowrap text-right">
                            <a
                              href={`/admin/crematorium/ticket/${t.id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="mr-2 inline-flex items-center gap-1 text-xs font-semibold text-nnm-blue"
                            >
                              <Printer className="h-3.5 w-3.5" /> Print
                            </a>
                            {canCancel && t.status === "issued" && (
                              <button
                                onClick={() => cancel(t)}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-red-700"
                              >
                                <XCircle className="h-3.5 w-3.5" /> Cancel
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {data.truncated && (
                    <p className="mt-2 text-xs text-amber-700">Showing the latest 1,000 tickets - narrow the dates to see all.</p>
                  )}
                </div>
              )}
              <p className="mt-4 text-xs text-slate-400">
                Counter logins are created on the server with role <code>crematorium_counter</code> (<code>npm run create-admin</code>);
                each counter staff member has their own login.
              </p>
            </>
          )}
        </section>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-base font-semibold text-slate-900">{value}</p>
    </div>
  );
}
