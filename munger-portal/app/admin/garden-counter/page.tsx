"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, Minus, Plus, ScanLine, Ticket as TicketIcon, XCircle, ListChecks } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { TicketCard } from "@/components/garden/ticket-card";
import { QrScanner } from "@/components/garden/qr-scanner";
import { useAdminGuard } from "@/lib/use-admin-guard";
import {
  admitTicket,
  cancelTicket,
  fetchCounterToday,
  rupees,
  sellTicket,
  type CounterToday,
  type PaymentMode,
  type Ticket,
} from "@/lib/garden-api";

type Tab = "sell" | "gate" | "today";
const MODES: { value: Exclude<PaymentMode, "online">; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "pos_upi", label: "UPI (bank POS)" },
  { value: "pos_card", label: "Card (bank POS)" },
];

/**
 * The garden counter: sell an entry ticket (cash, or UPI / card on the bank POS - its slip reference is noted), show
 * it with its QR code, check tickets at the gate with the camera, and see today's sales. Garden Counter login only.
 */
export default function GardenCounterPage() {
  const admin = useAdminGuard();
  const [tab, setTab] = useState<Tab>("sell");
  const [ctx, setCtx] = useState<CounterToday | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchCounterToday()
      .then((d) => {
        setCtx(d);
        setErr(null);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load."));
  }, []);
  useEffect(() => {
    if (admin?.role === "garden_counter") load();
  }, [admin, load]);

  if (!admin) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  if (admin.role !== "garden_counter")
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <p className="p-8 text-sm text-slate-500">This page is for Garden Counter logins.</p>
      </div>
    );

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />
      <main className="mx-auto max-w-3xl px-4 py-5">
        <h1 className="text-xl font-semibold text-slate-900">{ctx?.garden.name ?? "Garden counter"}</h1>
        {ctx && (
          <p className="mb-4 text-sm text-slate-500">
            Entry fee {rupees(ctx.garden.feePerPerson)} per person
            {!ctx.garden.active && <span className="ml-2 font-semibold text-red-600">· Ticket sale closed</span>}
          </p>
        )}
        {err && <p className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</p>}

        <div className="mb-5 grid grid-cols-3 gap-2">
          {(
            [
              ["sell", "Sell ticket", TicketIcon],
              ["gate", "Check at gate", ScanLine],
              ["today", "Today", ListChecks],
            ] as const
          ).map(([k, label, Icon]) => (
            <button
              key={k}
              onClick={() => {
                setTab(k);
                if (k === "today") load();
              }}
              className={`flex flex-col items-center gap-1 rounded-lg border py-2.5 text-sm font-semibold ${tab === k ? "border-nnm-blue bg-nnm-blue text-white" : "border-slate-200 bg-white text-slate-700"}`}
            >
              <Icon className="h-5 w-5" />
              {label}
            </button>
          ))}
        </div>

        {ctx && tab === "sell" && <Sell ctx={ctx} onSold={load} />}
        {ctx && tab === "gate" && <Gate />}
        {ctx && tab === "today" && <Today ctx={ctx} onChanged={load} />}
      </main>
    </div>
  );
}

function Sell({ ctx, onSold }: { ctx: CounterToday; onSold: () => void }) {
  const [persons, setPersons] = useState(1);
  const [mode, setMode] = useState<Exclude<PaymentMode, "online">>("cash");
  const [posRef, setPosRef] = useState("");
  const [admitNow, setAdmitNow] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const max = ctx.garden.maxPersons;
  const amount = persons * ctx.garden.feePerPerson;
  const pos = mode !== "cash";

  async function issue() {
    setErr(null);
    if (pos && posRef.trim().length < 4)
      return setErr("Take the payment on the bank POS first, then enter the approval code / RRN from its slip.");
    setBusy(true);
    try {
      setTicket(await sellTicket({ persons, paymentMode: mode, posReference: pos ? posRef.trim() : null, admitNow }));
      onSold();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not issue the ticket.");
    } finally {
      setBusy(false);
    }
  }

  if (ticket)
    return (
      <div className="space-y-4">
        <TicketCard t={ticket} showStaffDetails />
        <p className="text-center text-sm text-slate-600">
          {ticket.usedAt ? "Entry recorded. " : "Visitor can scan this QR with their phone to keep the e-ticket, and show it at the gate. "}
          {ticket.paymentMode !== "cash" && "Give the bank POS slip as the payment receipt."}
        </p>
        <button
          onClick={() => {
            setTicket(null);
            setPersons(1);
            setPosRef("");
            setMode("cash");
          }}
          className="mx-auto block rounded-lg bg-nnm-blue px-6 py-3 text-base font-semibold text-white"
        >
          Next ticket
        </button>
      </div>
    );

  return (
    <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-5">
      <div className="text-center">
        <p className="mb-2 text-sm font-medium text-slate-600">Number of persons</p>
        <div className="flex items-center justify-center gap-5">
          <button
            onClick={() => setPersons((p) => Math.max(1, p - 1))}
            className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-slate-300 text-slate-700"
            aria-label="One less"
          >
            <Minus className="h-6 w-6" />
          </button>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={max}
            value={persons}
            onChange={(e) => setPersons(Math.max(1, Math.min(max, Math.floor(Number(e.target.value) || 1))))}
            className="w-24 rounded-md border border-slate-300 py-2 text-center text-4xl font-bold text-slate-900"
            aria-label="Number of persons"
          />
          <button
            onClick={() => setPersons((p) => Math.min(max, p + 1))}
            className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-nnm-blue text-nnm-blue"
            aria-label="One more"
          >
            <Plus className="h-6 w-6" />
          </button>
        </div>
        <p className="mt-3 text-3xl font-bold text-nnm-blue">{rupees(amount)}</p>
        <p className="text-xs text-slate-500">
          {persons} × {rupees(ctx.garden.feePerPerson)}
        </p>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-slate-600">Payment</p>
        <div className="grid grid-cols-3 gap-2">
          {MODES.map((m) => (
            <button
              key={m.value}
              onClick={() => setMode(m.value)}
              className={`rounded-lg border py-3 text-sm font-semibold ${mode === m.value ? "border-nnm-blue bg-blue-50 text-nnm-blue" : "border-slate-200 text-slate-700"}`}
            >
              {m.label}
            </button>
          ))}
        </div>
        {pos && (
          <div className="mt-3">
            <p className="mb-1 text-xs text-slate-600">
              Charge <b>{rupees(amount)}</b> on the bank POS, then enter the approval code / RRN printed on its slip:
            </p>
            <input
              value={posRef}
              onChange={(e) => setPosRef(e.target.value)}
              maxLength={60}
              placeholder="Approval code / RRN"
              className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-base"
            />
          </div>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={admitNow} onChange={(e) => setAdmitNow(e.target.checked)} className="h-4 w-4" />
        Visitors are entering now (mark the ticket as used)
      </label>

      {err && <p className="text-sm text-red-700">{err}</p>}
      <button
        onClick={issue}
        disabled={busy || !ctx.garden.active}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 py-3.5 text-base font-semibold text-white disabled:opacity-50"
      >
        {busy && <Loader2 className="h-5 w-5 animate-spin" />} Issue ticket - {rupees(amount)}
      </button>
    </div>
  );
}

function Gate() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ admitted: boolean; reason: string | null; ticket: Ticket | null } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const check = useCallback(async (text: string) => {
    setBusy(true);
    setErr(null);
    try {
      setResult(await admitTicket(text));
    } catch (e) {
      setResult({ admitted: false, reason: e instanceof Error ? e.message : "Could not check the ticket.", ticket: null });
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <div className="space-y-4">
      {!result && (
        <>
          <QrScanner onRead={check} paused={busy} />
          <p className="text-center text-sm text-slate-600">{busy ? "Checking…" : "Hold the ticket's QR code in the frame."}</p>
          {err && <p className="text-center text-sm text-red-700">{err}</p>}
        </>
      )}
      {result && (
        <div className="space-y-4">
          <div className={`flex items-center gap-3 rounded-xl p-4 text-white ${result.admitted ? "bg-green-600" : "bg-red-600"}`}>
            {result.admitted ? <CheckCircle2 className="h-10 w-10 shrink-0" /> : <XCircle className="h-10 w-10 shrink-0" />}
            <div>
              <p className="text-xl font-bold">{result.admitted ? `Allow entry - ${result.ticket?.persons} person(s)` : "Do not allow"}</p>
              {result.reason && <p className="text-sm">{result.reason}</p>}
            </div>
          </div>
          {result.ticket && <TicketCard t={result.ticket} showStaffDetails />}
          <button
            onClick={() => setResult(null)}
            className="mx-auto block rounded-lg bg-nnm-blue px-6 py-3 text-base font-semibold text-white"
          >
            Scan next ticket
          </button>
        </div>
      )}
    </div>
  );
}

function Today({ ctx, onChanged }: { ctx: CounterToday; onChanged: () => void }) {
  const [open, setOpen] = useState<Ticket | null>(null);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const t = ctx.today;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Tickets" value={String(t.tickets)} />
        <Stat label="Persons" value={String(t.persons)} />
        <Stat label="Total" value={rupees(t.amount)} />
        <Stat label="Cash to hand over" value={rupees(t.cash)} strong />
        <Stat label="UPI (POS)" value={rupees(t.posUpi)} />
        <Stat label="Card (POS)" value={rupees(t.posCard)} />
        <Stat label="Cancelled" value={String(t.cancelled)} />
      </div>
      {open && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <TicketCard t={open} showStaffDetails />
          {open.status === "paid" && !open.usedAt && (
            <div className="space-y-2">
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={300}
                placeholder="Reason for cancelling (wrong count, payment failed…)"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <button
                onClick={async () => {
                  setErr(null);
                  try {
                    await cancelTicket(open.id, reason);
                    setOpen(null);
                    setReason("");
                    onChanged();
                  } catch (e) {
                    setErr(e instanceof Error ? e.message : "Could not cancel.");
                  }
                }}
                disabled={reason.trim().length < 3}
                className="rounded-md border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50"
              >
                Cancel this ticket
              </button>
              <p className="text-xs text-slate-500">Only an unused ticket, within 30 minutes of sale. Return the money to the visitor.</p>
            </div>
          )}
          {err && <p className="text-sm text-red-700">{err}</p>}
          <button onClick={() => setOpen(null)} className="text-sm font-semibold text-nnm-blue">
            Close
          </button>
        </div>
      )}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {ctx.tickets.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">No tickets sold today yet.</p>
        ) : (
          ctx.tickets.map((x) => (
            <button
              key={x.id}
              onClick={() => setOpen(x)}
              className="flex w-full items-center justify-between border-b border-slate-100 px-4 py-2.5 text-left text-sm last:border-0 hover:bg-slate-50"
            >
              <span>
                <span className="font-mono text-xs text-slate-500">{x.issuedAtText.split(", ")[1]}</span> · <b>{x.persons}</b> person(s) ·{" "}
                {x.paymentModeLabel}
              </span>
              <span className={x.status === "cancelled" ? "text-red-600 line-through" : "font-semibold text-slate-800"}>
                {rupees(x.amount)}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${strong ? "border-green-300 bg-green-50" : "border-slate-200 bg-white"}`}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-bold text-slate-900">{value}</p>
    </div>
  );
}
