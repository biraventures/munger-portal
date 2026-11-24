"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Flame, Loader2, Printer, XCircle } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import {
  cancelCremationTicket,
  cutCremationTicket,
  dmy,
  fetchCounterToday,
  nowTimeIst,
  rupees,
  todayIst,
  type CounterToday,
  type CremationPaymentMode,
  type CremationTicket,
} from "@/lib/crematorium-api";

const RELATIONS = [
  "Son",
  "Daughter",
  "Husband",
  "Wife",
  "Father",
  "Mother",
  "Brother",
  "Sister",
  "Grandson",
  "Granddaughter",
  "Nephew",
  "Relative",
  "Neighbour",
];
const MODES: { value: CremationPaymentMode; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "pos_card", label: "Card (POS)" },
  { value: "pos_upi", label: "UPI (POS)" },
];

const input = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-nnm-blue focus:outline-none";
const label = "mb-1 block text-xs font-medium text-slate-600";

const blank = () => ({
  deceasedName: "",
  informantName: "",
  informantRelation: "",
  informantAddress: "",
  informantPhone: "",
  cremationDate: todayIst(),
  cremationTime: nowTimeIst(),
  remarks: "",
  paymentMode: "cash" as CremationPaymentMode,
  posReference: "",
});

/** Opens the printable ticket in a new tab (it prints itself). */
function printTicket(id: number) {
  window.open(`/admin/crematorium/ticket/${id}?print=1`, "_blank");
}

/**
 * Crematorium Counter: cuts a ticket for each cremation - deceased, informant, relation, address, phone, date and
 * time - for the fee set by the Municipal Commissioner, paid in cash or on the bank POS, and prints it.
 */
export default function CrematoriumCounterPage() {
  const admin = useAdminGuard();
  const [data, setData] = useState<CounterToday | null>(null);
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<CremationTicket | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await fetchCounterToday());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the counter.");
    }
  }, []);

  useEffect(() => {
    if (admin?.role === "crematorium_counter") load();
  }, [admin, load]);

  if (!admin) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  if (admin.role !== "crematorium_counter")
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <p className="mx-auto mt-10 max-w-xl rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          This screen is for Crematorium Counter logins.
        </p>
      </div>
    );

  const set = (k: keyof ReturnType<typeof blank>, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const pos = form.paymentMode !== "cash";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^[6-9]\d{9}$/.test(form.informantPhone.trim())) return setError("Enter the informant's 10-digit mobile number.");
    if (pos && form.posReference.trim().length < 4) return setError("Enter the approval code / RRN printed on the bank POS slip.");
    if (
      !window.confirm(
        `Cut the ticket for ${form.deceasedName.trim()} - ${rupees(data?.fee ?? 0)} by ${MODES.find((m) => m.value === form.paymentMode)?.label}?`,
      )
    )
      return;
    setBusy(true);
    try {
      const t = await cutCremationTicket({
        ...form,
        remarks: form.remarks.trim() || null,
        posReference: pos ? form.posReference.trim() : null,
      });
      setLast(t);
      setForm(blank());
      await load();
      printTicket(t.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cut the ticket.");
    } finally {
      setBusy(false);
    }
  }

  async function cancel(t: CremationTicket) {
    const reason = window.prompt(`Why cancel ticket ${t.ticketNo} (${t.deceasedName})?`);
    if (!reason?.trim()) return;
    try {
      await cancelCremationTicket(t.id, reason.trim());
      await load();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not cancel.");
    }
  }

  const withinWindow = (t: CremationTicket) => Date.now() - new Date(t.issuedAt).getTime() < (data?.cancelWindowMinutes ?? 30) * 60_000;

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
              <Flame className="h-6 w-6 text-nnm-blue" /> Electric Crematorium - Ticket Counter
            </h1>
            <p className="text-sm text-slate-500">Cut one ticket for each cremation and give the printed ticket to the informant.</p>
          </div>
          {data && (
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-right">
              <p className="text-xs text-slate-500">Fee per cremation</p>
              <p className="text-xl font-bold text-slate-900">{data.fee === null ? "Not set" : rupees(data.fee)}</p>
            </div>
          )}
        </div>

        {data && data.fee === null && (
          <p role="alert" className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertCircle className="h-4 w-4 shrink-0" /> The fee has not been set yet - tickets can be cut once the Municipal Commissioner
            sets it.
          </p>
        )}

        {last && (
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Ticket <b>{last.ticketNo}</b> cut for {last.deceasedName} - {rupees(last.amount)} ({last.paymentModeLabel}).
            <button
              onClick={() => printTicket(last.id)}
              className="ml-auto inline-flex items-center gap-1 rounded-md bg-green-700 px-3 py-1.5 text-xs font-semibold text-white"
            >
              <Printer className="h-3.5 w-3.5" /> Print again
            </button>
          </div>
        )}

        <form onSubmit={submit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-800">New ticket</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={label} htmlFor="c-deceased">
                Name of the deceased *
              </label>
              <input
                id="c-deceased"
                required
                value={form.deceasedName}
                onChange={(e) => set("deceasedName", e.target.value)}
                className={input}
              />
            </div>
            <div>
              <label className={label} htmlFor="c-informant">
                Name of the informant *
              </label>
              <input
                id="c-informant"
                required
                value={form.informantName}
                onChange={(e) => set("informantName", e.target.value)}
                className={input}
              />
            </div>
            <div>
              <label className={label} htmlFor="c-relation">
                Relation with the deceased *
              </label>
              <input
                id="c-relation"
                required
                list="c-relations"
                value={form.informantRelation}
                onChange={(e) => set("informantRelation", e.target.value)}
                placeholder="e.g. Son"
                className={input}
              />
              <datalist id="c-relations">
                {RELATIONS.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </div>
            <div className="sm:col-span-2">
              <label className={label} htmlFor="c-address">
                Address of the informant *
              </label>
              <textarea
                id="c-address"
                required
                rows={2}
                value={form.informantAddress}
                onChange={(e) => set("informantAddress", e.target.value)}
                className={input}
              />
            </div>
            <div>
              <label className={label} htmlFor="c-phone">
                Mobile number of the informant *
              </label>
              <input
                id="c-phone"
                required
                inputMode="numeric"
                maxLength={10}
                value={form.informantPhone}
                onChange={(e) => set("informantPhone", e.target.value.replace(/\D/g, ""))}
                className={input}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label} htmlFor="c-date">
                  Date of cremation *
                </label>
                <input
                  id="c-date"
                  type="date"
                  required
                  max={todayIst()}
                  value={form.cremationDate}
                  onChange={(e) => set("cremationDate", e.target.value)}
                  className={input}
                />
              </div>
              <div>
                <label className={label} htmlFor="c-time">
                  Time *
                </label>
                <input
                  id="c-time"
                  type="time"
                  required
                  value={form.cremationTime}
                  onChange={(e) => set("cremationTime", e.target.value)}
                  className={input}
                />
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className={label} htmlFor="c-remarks">
                Remarks (optional)
              </label>
              <input id="c-remarks" value={form.remarks} onChange={(e) => set("remarks", e.target.value)} className={input} />
            </div>
          </div>

          <div>
            <p className={label}>Payment of {data?.fee === null || !data ? "the fee" : rupees(data.fee)} *</p>
            <div className="flex flex-wrap gap-2">
              {MODES.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => set("paymentMode", m.value)}
                  className={`rounded-md px-4 py-2 text-sm font-semibold ${form.paymentMode === m.value ? "bg-nnm-blue text-white" : "border border-slate-300 text-slate-700"}`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            {pos && (
              <div className="mt-3 max-w-sm">
                <label className={label} htmlFor="c-ref">
                  Approval code / RRN on the bank POS slip *
                </label>
                <input id="c-ref" value={form.posReference} onChange={(e) => set("posReference", e.target.value)} className={input} />
              </div>
            )}
          </div>

          {error && (
            <p role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" /> {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || !data || data.fee === null}
            className="inline-flex items-center gap-2 rounded-md bg-nnm-blue px-6 py-2.5 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            Cut ticket and print
          </button>
        </form>

        {data && (
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">My tickets today</h2>
            <div className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
              <Stat label="Tickets" value={String(data.today.tickets)} />
              <Stat label="Total" value={rupees(data.today.amount)} />
              <Stat label="Cash" value={rupees(data.today.cash)} />
              <Stat label="POS (card + UPI)" value={rupees(data.today.posCard + data.today.posUpi)} />
              <Stat label="Cancelled" value={String(data.today.cancelled)} />
            </div>
            {data.tickets.length === 0 ? (
              <p className="text-sm text-slate-400">No tickets yet today.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.tickets.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className={`font-semibold ${t.status === "cancelled" ? "text-slate-400 line-through" : "text-slate-900"}`}>
                        {t.deceasedName} <span className="font-mono text-xs font-normal text-slate-500">{t.ticketNo}</span>
                      </p>
                      <p className="text-xs text-slate-500">
                        {dmy(t.cremationDate)} {t.cremationTime} · {t.informantName} ({t.informantRelation}) · {rupees(t.amount)}{" "}
                        {t.paymentModeLabel}
                        {t.status === "cancelled" && ` · Cancelled: ${t.cancelReason}`}
                      </p>
                    </div>
                    {t.status === "issued" && (
                      <>
                        <button
                          onClick={() => printTicket(t.id)}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700"
                        >
                          <Printer className="h-3.5 w-3.5" /> Print
                        </button>
                        {withinWindow(t) && (
                          <button
                            onClick={() => cancel(t)}
                            className="inline-flex items-center gap-1 rounded-md border border-red-300 px-2.5 py-1 text-xs font-semibold text-red-700"
                          >
                            <XCircle className="h-3.5 w-3.5" /> Cancel
                          </button>
                        )}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-slate-400">
              A wrong ticket can be cancelled here within {data.cancelWindowMinutes} minutes; after that, ask the Crematorium Prabhari.
            </p>
          </section>
        )}
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
