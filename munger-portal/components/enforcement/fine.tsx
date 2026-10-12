"use client";

import { useState } from "react";
import { Printer } from "lucide-react";
import { call, type Fine } from "@/lib/enforcement-api";
import { Card, ErrorLine, fmtDateTime, inputClass, labelClass, money, outlineBtn, primaryBtn, printDocument } from "./parts";

/** Fine for either module: officer imposes (amount typed each time), then payment is recorded from the POS machine only. */
export function FineSection({
  fine, base, canImpose, blockedReason, officer, defaultEmail, onChanged,
}: {
  fine: Fine | null; base: string; canImpose: boolean; blockedReason?: string | null; officer: boolean; defaultEmail?: string | null; onChanged: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [legalBasis, setLegalBasis] = useState("");
  const [reason, setReason] = useState("");
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [pos, setPos] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (fine) {
    const paid = fine.status === "paid";
    return (
      <Card title={`Fine ${fine.fine_no}`} tone={paid ? "ok" : "warn"}>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <div><dt className="text-xs text-slate-500">Amount</dt><dd className="font-semibold">{money(fine.amount)}</dd></div>
          <div><dt className="text-xs text-slate-500">Status</dt><dd className="font-semibold">{paid ? "Paid" : "Unpaid"}</dd></div>
          <div className="col-span-2"><dt className="text-xs text-slate-500">Legal basis</dt><dd>{fine.legal_basis}</dd></div>
          <div className="col-span-2"><dt className="text-xs text-slate-500">Reason</dt><dd>{fine.reason}</dd></div>
          {paid && <div className="col-span-2"><dt className="text-xs text-slate-500">Paid by POS (ref {fine.pos_txn_ref})</dt><dd>{fmtDateTime(fine.paid_at)}</dd></div>}
        </dl>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className={outlineBtn}
            onClick={() =>
              printDocument(paid ? "Fine Receipt" : "Fine Memo", [
                { heading: "Fine no.", text: fine.fine_no },
                { heading: "Name", text: `${fine.payer_name} (${fine.payer_phone})` },
                { heading: "Violation", text: fine.violation_type },
                { heading: "Reason", text: fine.reason },
                { heading: "Legal basis", text: fine.legal_basis },
                { heading: "Amount", text: money(fine.amount) },
                { heading: "Imposed", text: `${fmtDateTime(fine.imposed_at)} by ${fine.imposed_by_name}` },
                { heading: "Payment", text: paid ? `Paid online through POS machine, ref ${fine.pos_txn_ref}, ${fmtDateTime(fine.paid_at)}` : "Unpaid - payable online only, through the POS machine." },
              ])
            }
          >
            <Printer className="h-4 w-4" /> Print {paid ? "receipt" : "memo"}
          </button>
        </div>
        {!paid && (
          <form
            className="mt-4 border-t border-amber-200 pt-4"
            onSubmit={(e) => { e.preventDefault(); run(() => call("POST", `/enforcement/fines/${fine.id}/pos-payment`, { posTxnRef: pos })); }}
          >
            <label className={labelClass}>POS transaction reference (after the violator pays on the POS machine)</label>
            <div className="flex gap-2">
              <input required minLength={4} value={pos} onChange={(e) => setPos(e.target.value)} className={inputClass} />
              <button disabled={busy} className={primaryBtn}>Record payment</button>
            </div>
            <p className="mt-1 text-xs text-slate-500">Only online payment through the POS machine is accepted.</p>
          </form>
        )}
        <ErrorLine message={error} />
      </Card>
    );
  }

  if (!officer) return null;
  if (!canImpose) return blockedReason ? <Card title="Fine"><p className="text-sm text-slate-500">{blockedReason}</p></Card> : null;

  return (
    <Card title="Impose fine" tone="warn">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(() => call("POST", `${base}/fine`, { amount: Number(amount), legalBasis, reason, email: email || null })); }}>
        <div><label className={labelClass}>Fine amount (Rs)</label><input required type="number" min="1" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} /></div>
        <div><label className={labelClass}>Act / section it is imposed under</label><input required minLength={5} value={legalBasis} onChange={(e) => setLegalBasis(e.target.value)} className={inputClass} placeholder="e.g. Bihar Municipal Act, 2007 - section ..." /></div>
        <div><label className={labelClass}>Reason</label><textarea required minLength={5} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} /></div>
        <div><label className={labelClass}>Email for receipt (optional)</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} /></div>
        <button disabled={busy} className={primaryBtn}>{busy ? "Saving..." : "Impose fine"}</button>
      </form>
      <ErrorLine message={error} />
    </Card>
  );
}
