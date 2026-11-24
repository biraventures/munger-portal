"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Eye, Loader2, Plus, Search, Trash2, Upload } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import {
  approveSettlement,
  createSettlement,
  fetchPendingSettlements,
  inr,
  lookupHistoricalHolding,
  openPaymentProof,
  previewSettlement,
  returnSettlement,
  uploadPaymentProof,
  type HoldingLookup,
  type OldPayment,
  type PendingSettlement,
  type SavedSettlement,
  type Settlement,
  type StatementYear,
} from "@/lib/historical-payment-api";

const VIEW = ["tax_daroga", "city_manager", "deputy_commissioner", "commissioner"];
const inputClass = "w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-nnm-blue";
const cardClass = "rounded-xl border border-slate-200 bg-white p-5";
const fmtDate = (v: string | null) =>
  v
    ? new Date(v).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "-";
const dmy = (iso: string) => iso.split("-").reverse().join("-");

const STATUS: Record<SavedSettlement["status"], { label: string; tone: string }> = {
  pending: { label: "Waiting for City Manager", tone: "bg-amber-50 text-amber-800" },
  approved: { label: "Approved - settled", tone: "bg-green-50 text-green-700" },
  returned: { label: "Sent back", tone: "bg-red-50 text-red-700" },
};

type Row = { paidOn: string; amount: string; reference: string; remarks: string };
const blankRow = (): Row => ({ paidOn: "", amount: "", reference: "", remarks: "" });

/**
 * Old holdings whose owner paid in parts over the years: the Tax Daroga records each old payment, the system settles
 * them against the holding tax year by year from the earliest pending year, and the City Manager approves. Approval
 * moves "tax paid till" and leaves only the balance on a year paid in part; it is recorded in the holding history and
 * the old payments appear in the payment history.
 */
function HistoricalPaymentsContent() {
  const admin = useAdminGuard();
  const router = useRouter();
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("holding") ?? "");
  const [data, setData] = useState<HoldingLookup | null>(null);
  const [pending, setPending] = useState<PendingSettlement[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (h: string) => {
    if (!h.trim()) return;
    setLoading(true);
    setError(null);
    try {
      setData(await lookupHistoricalHolding(h));
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Could not load the holding.");
    } finally {
      setLoading(false);
    }
  }, []);
  const loadPending = useCallback(() => {
    fetchPendingSettlements()
      .then(setPending)
      .catch(() => setPending([]));
  }, []);

  useEffect(() => {
    if (!admin || !VIEW.includes(admin.role)) return;
    loadPending();
    const h = params.get("holding");
    if (h) load(h);
  }, [admin, params, load, loadPending]);

  if (!admin) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  const open = (h: string) => {
    setQuery(h);
    router.replace(`/admin/historical-payments?holding=${encodeURIComponent(h)}`);
    load(h);
  };
  const refresh = () => {
    if (data) load(data.holding.holdingNo);
    loadPending();
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">Historical Part Payments</h1>
        <p className="mb-6 max-w-4xl text-sm text-slate-500">
          For old holdings whose owner paid in parts over the years - amounts of their own choosing, not the annual tax. Record each old
          payment with its old receipt / register reference. The payments are settled against the holding tax year by year, starting from
          the earliest pending year; each year is cleared in full before the next. Holding tax only - no late fee on the years the old
          payments cover. When the City Manager approves, &quot;tax paid till&quot; moves to the last year fully cleared, a year paid in
          part keeps only its balance, and the settlement is recorded in the holding history and payment history.
        </p>

        {!VIEW.includes(admin.role) ? (
          <p className="text-sm text-slate-500">This page is for the Tax Daroga, City Manager, DMC and Municipal Commissioner.</p>
        ) : (
          <>
            {pending && pending.length > 0 && (
              <div className={`${cardClass} mb-5 border-amber-200 bg-amber-50/40`}>
                <h2 className="mb-2 text-sm font-semibold text-slate-800">
                  Waiting for the City Manager&apos;s approval ({pending.length})
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-slate-500">
                        <th className="py-1.5 pr-3">Holding</th>
                        <th className="py-1.5 pr-3">Owner / ward</th>
                        <th className="py-1.5 pr-3">Old payments</th>
                        <th className="py-1.5 pr-3">Tax paid till after</th>
                        <th className="py-1.5 pr-3">Entered</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pending.map((p) => (
                        <tr
                          key={p.id}
                          onClick={() => open(p.holding_no)}
                          className="cursor-pointer border-t border-amber-100 hover:bg-amber-50"
                        >
                          <td className="py-1.5 pr-3 font-mono font-semibold text-nnm-blue">{p.holding_no}</td>
                          <td className="py-1.5 pr-3">
                            {p.owner_name} · Ward {p.ward}
                          </td>
                          <td className="py-1.5 pr-3">
                            {p.payments} · {inr(p.total_paid)}
                          </td>
                          <td className="py-1.5 pr-3">
                            {p.paid_till_year_after ?? "unchanged"}
                            {p.partial_year ? ` (+ ${p.partial_year}-${p.partial_year + 1} in part)` : ""}
                          </td>
                          <td className="py-1.5 pr-3">
                            {p.entered_by_name}, {fmtDate(p.entered_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                open(query.trim());
              }}
              className="mb-5 flex max-w-xl gap-2"
            >
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Holding number"
                  className={`${inputClass} pl-8`}
                />
              </div>
              <button
                type="submit"
                disabled={loading || !query.trim()}
                className="rounded-md bg-nnm-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {loading ? "Loading…" : "Open"}
              </button>
            </form>

            {error && (
              <div
                role="alert"
                className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
              >
                <AlertCircle className="h-4 w-4 shrink-0" /> {error}
              </div>
            )}

            {data && <HoldingView key={data.holding.holdingNo} data={data} role={admin.role} onChanged={refresh} />}
          </>
        )}
      </main>
    </div>
  );
}

function HoldingView({ data, role, onChanged }: { data: HoldingLookup; role: string; onChanged: () => void }) {
  const h = data.holding;
  const hasPending = data.settlements.some((s) => s.status === "pending");
  const lastReturned = data.settlements.find((s) => s.status === "returned");
  return (
    <div className="space-y-5">
      <div className={cardClass}>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <Info label="Holding" value={h.holdingNo} mono />
          <Info label="Owner" value={h.ownerName} />
          <Info label="Ward" value={h.ward} />
          <Info label="Old holding no." value={h.oldHoldingNo} />
          <Info label="Holding created" value={h.holdingCreationYear} />
          <Info label="Tax paid till" value={h.taxPaidTillYear ?? "Nothing paid on record"} />
          <Info label="Pending from" value={data.dueFrom} />
          <Info label="Holding tax due (without late fee)" value={data.dueBefore != null ? inr(data.dueBefore) : null} />
        </div>
        {h.address && <p className="mt-2 text-xs text-slate-500">{h.address}</p>}
        {data.blocked && <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-sm text-amber-900">{data.blocked}</p>}
      </div>

      {role === "tax_daroga" && !data.blocked && !hasPending && (
        <EntryForm holdingNo={h.holdingNo} startFrom={lastReturned} onSaved={onChanged} />
      )}
      {role === "tax_daroga" && hasPending && (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-sm text-amber-900">
          The settlement below is with the City Manager for approval. Upload a photo of each old receipt / register page against its payment
          meanwhile. No tax is collected on this holding until it is approved or sent back.
        </p>
      )}

      {data.settlements.length > 0 && <h2 className="pt-2 text-base font-semibold text-slate-900">Settlements entered for this holding</h2>}
      {data.settlements.map((s) => (
        <SavedView key={s.id} s={s} role={role} onChanged={onChanged} />
      ))}
    </div>
  );
}

function Info({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div>
      <span className="block text-xs text-slate-500">{label}</span>
      <span className={`text-slate-800 ${mono ? "font-mono font-semibold" : ""}`}>{value || "-"}</span>
    </div>
  );
}

function EntryForm({ holdingNo, startFrom, onSaved }: { holdingNo: string; startFrom?: SavedSettlement; onSaved: () => void }) {
  const [rows, setRows] = useState<Row[]>(
    startFrom?.payments.length
      ? startFrom.payments.map((p) => ({ paidOn: p.paidOn, amount: String(p.amount), reference: p.reference, remarks: p.remarks ?? "" }))
      : [blankRow()],
  );
  const [remarks, setRemarks] = useState("");
  const [result, setResult] = useState<Settlement | null>(null);
  const [busy, setBusy] = useState<"preview" | "save" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const payments = (): OldPayment[] =>
    rows
      .filter((r) => r.paidOn || r.amount || r.reference)
      .map((r) => ({ paidOn: r.paidOn, amount: Number(r.amount), reference: r.reference, remarks: r.remarks || null }));
  const setRow = (i: number, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    setResult(null);
  };
  const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  async function doPreview() {
    setErr(null);
    setMsg(null);
    setBusy("preview");
    try {
      setResult(await previewSettlement(holdingNo, payments()));
    } catch (e) {
      setResult(null);
      setErr(e instanceof Error ? e.message : "Could not settle.");
    } finally {
      setBusy(null);
    }
  }
  async function doSave() {
    setErr(null);
    setBusy("save");
    try {
      const r = await createSettlement(holdingNo, payments(), remarks.trim() || null);
      setMsg(`Settlement no. ${r.id} sent to the City Manager. Upload the old receipt photos below while it waits.`);
      setResult(null);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={cardClass}>
      <h2 className="mb-1 text-base font-semibold text-slate-900">Record old payments</h2>
      <p className="mb-3 text-xs text-slate-500">
        One line per old payment, from the old receipt or the demand / collection register. The order does not matter - they are settled
        oldest first.
        {startFrom && " The payments of the settlement sent back are filled in - correct them and send again."}
      </p>
      <div className="space-y-2">
        <div className="hidden grid-cols-[9rem_8rem_1fr_1fr_2rem] gap-2 text-xs font-medium text-slate-500 sm:grid">
          <span>Date paid</span>
          <span>Amount (₹)</span>
          <span>Old receipt no. / register reference</span>
          <span>Remarks (optional)</span>
          <span />
        </div>
        {rows.map((r, i) => (
          <div
            key={i}
            className="grid grid-cols-2 gap-2 border-b border-slate-100 pb-2 sm:grid-cols-[9rem_8rem_1fr_1fr_2rem] sm:border-0 sm:pb-0"
          >
            <input
              type="date"
              value={r.paidOn}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setRow(i, { paidOn: e.target.value })}
              className={inputClass}
              aria-label="Date paid"
            />
            <input
              type="number"
              min="0"
              step="0.01"
              value={r.amount}
              onChange={(e) => setRow(i, { amount: e.target.value })}
              placeholder="Amount"
              className={inputClass}
              aria-label="Amount"
            />
            <input
              value={r.reference}
              onChange={(e) => setRow(i, { reference: e.target.value })}
              maxLength={200}
              placeholder="Receipt no. / register page"
              className={`${inputClass} col-span-2 sm:col-span-1`}
              aria-label="Reference"
            />
            <input
              value={r.remarks}
              onChange={(e) => setRow(i, { remarks: e.target.value })}
              maxLength={300}
              placeholder="Remarks"
              className={inputClass}
              aria-label="Remarks"
            />
            <button
              type="button"
              onClick={() => {
                setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : [blankRow()]));
                setResult(null);
              }}
              className="flex items-center justify-center text-slate-400 hover:text-red-600"
              aria-label="Remove line"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setRows((rs) => [...rs, blankRow()])}
          className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
        >
          <Plus className="h-3.5 w-3.5" /> Add payment
        </button>
        <span className="text-sm text-slate-600">
          Total: <b>{inr(total)}</b>
        </span>
      </div>
      <textarea
        value={remarks}
        onChange={(e) => setRemarks(e.target.value)}
        rows={2}
        maxLength={1000}
        placeholder="Remarks for the City Manager (what was produced, who verified)"
        className={`${inputClass} mt-3`}
      />
      {err && <p className="mt-2 text-sm text-red-700">{err}</p>}
      {msg && <p className="mt-2 text-sm text-green-700">{msg}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={doPreview}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 rounded-md bg-nnm-blue px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          {busy === "preview" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Settle and show year-wise statement
        </button>
      </div>
      {result && (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <ResultSummary
            paidTillBefore={result.previousTaxPaidTillYear}
            paidTillAfter={result.paidTillYearAfter}
            partial={result.partial}
            totalPaid={result.totalPaid}
            dueBefore={result.dueBefore}
            dueAfter={result.dueAfter}
          />
          {result.excess > 0 && (
            <p className="mt-2 rounded-md border border-red-200 bg-red-50 p-2.5 text-sm text-red-800">
              {inr(result.excess)} is more than all the tax due up to the current year - check the amounts. It cannot be sent like this.
            </p>
          )}
          <StatementTable statement={result.statement} refs={payments().map((p) => p.reference)} />
          <button
            type="button"
            onClick={doSave}
            disabled={busy !== null || result.excess > 0}
            className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-green-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            {busy === "save" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Send to City Manager for approval
          </button>
        </div>
      )}
    </div>
  );
}

function ResultSummary(p: {
  paidTillBefore: string | null;
  paidTillAfter: string | null;
  partial: { label: string; paid: number; balance: number } | null;
  totalPaid: number;
  dueBefore?: number;
  dueAfter?: number;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 rounded-md bg-slate-50 p-3 text-sm sm:grid-cols-2">
      <p>
        Old payments: <b>{inr(p.totalPaid)}</b>
      </p>
      <p>
        Tax paid till: <b>{p.paidTillBefore ?? "blank"}</b> →{" "}
        <b className="text-green-700">{p.paidTillAfter ?? p.paidTillBefore ?? "blank"}</b>
      </p>
      <p className="sm:col-span-2">
        {p.partial ? (
          <>
            Paid in part: <b>{p.partial.label}</b> - {inr(p.partial.paid)} paid, <b className="text-red-700">{inr(p.partial.balance)}</b>{" "}
            still due for that year.
          </>
        ) : (
          "No year left paid in part."
        )}
      </p>
      {p.dueBefore != null && p.dueAfter != null && (
        <p className="sm:col-span-2">
          Holding tax due to last year (without late fee): {inr(p.dueBefore)} → <b>{inr(p.dueAfter)}</b>
        </p>
      )}
    </div>
  );
}

/** Years the old payments reached, then one line for the years still fully due. */
function StatementTable({ statement, refs }: { statement: StatementYear[]; refs: string[] }) {
  const reached = statement.filter((s) => s.paid > 0);
  const lastReached = reached.length ? reached[reached.length - 1]!.year : -1;
  const shown = statement.filter((s) => s.year <= lastReached);
  const rest = statement.filter((s) => s.year > lastReached);
  const restDue = rest.reduce((sum, s) => sum + s.balance, 0);
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="py-1.5 pr-3">Year</th>
            <th className="py-1.5 pr-3 text-right">Tax</th>
            <th className="py-1.5 pr-3 text-right">Paid by old payments</th>
            <th className="py-1.5 pr-3 text-right">Balance</th>
            <th className="py-1.5 pr-3">From</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((s) => (
            <tr key={s.year} className={`border-b border-slate-50 ${s.balance > 0 && s.paid > 0 ? "bg-amber-50" : ""}`}>
              <td className="py-1.5 pr-3 font-mono">{s.label}</td>
              <td className="py-1.5 pr-3 text-right">{inr(s.tax)}</td>
              <td className="py-1.5 pr-3 text-right">{inr(s.paid)}</td>
              <td className={`py-1.5 pr-3 text-right ${s.balance > 0 ? "font-semibold text-red-700" : "text-green-700"}`}>
                {s.balance > 0 ? inr(s.balance) : "Cleared"}
              </td>
              <td className="py-1.5 pr-3 text-slate-500">
                {s.from.map((f) => `${refs[f.index] ?? `#${f.index + 1}`}: ${inr(f.amount)}`).join("; ")}
              </td>
            </tr>
          ))}
          {rest.length > 0 && (
            <tr className="text-slate-600">
              <td className="py-1.5 pr-3 font-mono">
                {rest[0]!.label}
                {rest.length > 1 ? ` to ${rest[rest.length - 1]!.label}` : ""}
              </td>
              <td colSpan={2} className="py-1.5 pr-3 text-right">
                not reached - {rest.length} year(s)
              </td>
              <td className="py-1.5 pr-3 text-right font-semibold text-red-700">{inr(restDue)}</td>
              <td className="py-1.5 pr-3 text-slate-400">still due (current year included)</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function SavedView({ s, role, onChanged }: { s: SavedSettlement; role: string; onChanged: () => void }) {
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const st = STATUS[s.status];
  const partial =
    s.partial_year != null
      ? { label: `${s.partial_year}-${s.partial_year + 1}`, paid: Number(s.partial_paid), balance: Number(s.partial_balance) }
      : null;
  const refs = s.payments.map((p) => p.reference);

  async function run(key: string, fn: () => Promise<unknown>, done: string) {
    setErr(null);
    setMsg(null);
    setBusy(key);
    try {
      await fn();
      setMsg(done);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={cardClass}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Settlement no. {s.id}</h3>
          <p className="text-xs text-slate-500">
            Entered by {s.entered_by_name} on {fmtDate(s.entered_at)}
            {s.decided_at && ` · ${s.status === "approved" ? "approved" : "sent back"} by ${s.decided_by_name} on ${fmtDate(s.decided_at)}`}
          </p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.tone}`}>{st.label}</span>
      </div>
      {s.decision_remarks && (
        <p
          className={`mb-3 rounded-md p-2.5 text-sm ${s.status === "returned" ? "border border-red-200 bg-red-50 text-red-800" : "bg-slate-50 text-slate-700"}`}
        >
          <b>{s.status === "returned" ? "Reason sent back" : "City Manager"}:</b> {s.decision_remarks}
        </p>
      )}
      {s.remarks && <p className="mb-3 text-xs text-slate-600">Tax Daroga: {s.remarks}</p>}

      <ResultSummary
        paidTillBefore={s.previous_tax_paid_till_year}
        paidTillAfter={s.paid_till_year_after}
        partial={partial}
        totalPaid={Number(s.total_paid)}
      />

      <h4 className="mb-1 mt-4 text-xs font-semibold uppercase text-slate-500">Old payments</h4>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-1.5 pr-3">Date paid</th>
              <th className="py-1.5 pr-3 text-right">Amount</th>
              <th className="py-1.5 pr-3">Old receipt / register ref.</th>
              <th className="py-1.5 pr-3">Remarks</th>
              <th className="py-1.5 pr-3">Proof</th>
            </tr>
          </thead>
          <tbody>
            {s.payments.map((p) => (
              <tr key={p.id} className="border-b border-slate-50">
                <td className="py-1.5 pr-3 font-mono">{dmy(p.paidOn)}</td>
                <td className="py-1.5 pr-3 text-right">{inr(p.amount)}</td>
                <td className="py-1.5 pr-3">{p.reference}</td>
                <td className="py-1.5 pr-3 text-slate-500">{p.remarks ?? ""}</td>
                <td className="py-1.5 pr-3">
                  <div className="flex items-center gap-1.5">
                    {p.hasProof && (
                      <button
                        onClick={() => openPaymentProof(p.id).catch((e) => setErr(e instanceof Error ? e.message : "Could not open."))}
                        className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-0.5 font-semibold text-slate-700"
                      >
                        <Eye className="h-3 w-3" /> View
                      </button>
                    )}
                    {role === "tax_daroga" && s.status === "pending" && (
                      <label className="inline-flex cursor-pointer items-center gap-1 rounded bg-nnm-blue px-2 py-0.5 font-semibold text-white">
                        {busy === `proof-${p.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                        {p.hasProof ? "Replace" : "Upload"}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,application/pdf"
                          className="hidden"
                          disabled={busy !== null}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            e.target.value = "";
                            if (f) run(`proof-${p.id}`, () => uploadPaymentProof(p.id, f), "Proof uploaded.");
                          }}
                        />
                      </label>
                    )}
                    {!p.hasProof && !(role === "tax_daroga" && s.status === "pending") && <span className="text-slate-400">none</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h4 className="mb-1 mt-4 text-xs font-semibold uppercase text-slate-500">Year-wise settlement</h4>
      <StatementTable statement={s.statement} refs={refs} />

      {err && <p className="mt-3 text-sm text-red-700">{err}</p>}
      {msg && <p className="mt-3 text-sm text-green-700">{msg}</p>}

      {role === "city_manager" && s.status === "pending" && (
        <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
          <p className="text-xs text-slate-500">
            Check each old payment against its proof or the register. On approval, &quot;tax paid till&quot; and the year paid in part are
            updated, unpaid demand notices of this holding are closed (a fresh one is needed), and this is recorded in the holding history.
            It cannot be undone.
          </p>
          <textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Remarks (required when sending back)"
            className={inputClass}
          />
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => run("approve", () => approveSettlement(s.id, remarks.trim() || null), "Approved and settled.")}
              disabled={busy !== null}
              className="rounded-md bg-green-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              Approve and settle
            </button>
            <button
              onClick={() =>
                remarks.trim().length < 3
                  ? setErr("Give the reason - the Tax Daroga will see it.")
                  : run("return", () => returnSettlement(s.id, remarks.trim()), "Sent back to the Tax Daroga.")
              }
              disabled={busy !== null}
              className="rounded-md border border-red-300 bg-white px-4 py-2 text-xs font-semibold text-red-700 disabled:opacity-50"
            >
              Send back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function HistoricalPaymentsPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>}>
      <HistoricalPaymentsContent />
    </Suspense>
  );
}
