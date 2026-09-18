"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, RotateCcw } from "lucide-react";
import { OperatorHeader } from "@/components/operator-header";
import { useOperatorGuard } from "@/lib/use-operator-guard";
import { fetchRevertedShopAgreementRequests, resubmitShopAgreementRequest, type RevertedShopAgreementRequest, type AgreementInput } from "@/lib/shop-api";

const inputClass = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";

export default function RevertedShopAgreementsPage() {
  const operator = useOperatorGuard();
  const [list, setList] = useState<RevertedShopAgreementRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [editing, setEditing] = useState<RevertedShopAgreementRequest | null>(null);
  const [holderName, setHolderName] = useState("");
  const [holderMobile, setHolderMobile] = useState("");
  const [baseMonthlyRent, setBaseMonthlyRent] = useState(0);
  const [securityDeposit, setSecurityDeposit] = useState(0);
  const [changeReason, setChangeReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function load() {
    fetchRevertedShopAgreementRequests()
      .then(setList)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load this worklist."));
  }

  useEffect(() => {
    if (!operator) return;
    load();
  }, [operator]);

  function openEdit(r: RevertedShopAgreementRequest) {
    setEditing(r);
    setSuccess(null);
    setError(null);
    const d = r.proposed_data;
    setHolderName(d.holderName ?? "");
    setHolderMobile(d.holderMobile ?? "");
    setBaseMonthlyRent(Number(d.baseMonthlyRent ?? 0));
    setSecurityDeposit(Number(d.securityDeposit ?? 0));
    setChangeReason(r.change_reason);
  }

  async function handleResubmit() {
    if (!editing) return;
    if (!holderName.trim() || baseMonthlyRent <= 0 || !changeReason.trim()) {
      setError("Holder name, monthly rent, and change reason are required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const input: AgreementInput = {
        ...editing.proposed_data,
        holderName: holderName.trim(),
        holderMobile: holderMobile.trim() || null,
        baseMonthlyRent,
        securityDeposit,
        changeReason: changeReason.trim(),
      };
      await resubmitShopAgreementRequest(editing.id, input);
      setSuccess(`${editing.shop_no} resubmitted for approval.`);
      setEditing(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resubmit this correction.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!operator) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <OperatorHeader operator={operator} />

      <main className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <RotateCcw className="h-6 w-6" />
          Reverted Shop Agreements
        </h1>
        <p className="mb-6 text-sm text-slate-500">Agreement requests a reviewer sent back for correction.</p>

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
        {success && !editing && (
          <div role="status" className="mb-5 flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {success}
          </div>
        )}

        {!editing ? (
          !list ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : list.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">Nothing needs correction right now.</div>
          ) : (
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
              {list.map((r) => (
                <div key={r.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{r.shop_no}</p>
                      <p className="text-xs text-slate-500">
                        Sent back by {r.reverted_by} on {new Date(r.reverted_at).toLocaleDateString("en-IN")}
                        {r.revision_count > 0 ? ` (revision ${r.revision_count})` : ""}
                      </p>
                      <p className="mt-1 text-sm text-amber-700">&ldquo;{r.revert_comment}&rdquo;</p>
                    </div>
                    <button onClick={() => openEdit(r)} className="shrink-0 rounded-md bg-nnm-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-nnm-blue-dark">
                      Correct &amp; Resubmit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">{editing.shop_no}</h2>
              <button onClick={() => setEditing(null)} className="text-xs font-semibold text-slate-500 hover:underline">
                Back to list
              </button>
            </div>
            <p className="mb-5 text-sm text-amber-700">&ldquo;{editing.revert_comment}&rdquo;</p>

            <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-600">Holder name</label>
                <input value={holderName} onChange={(e) => setHolderName(e.target.value)} className={inputClass} autoFocus />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Mobile</label>
                <input value={holderMobile} onChange={(e) => setHolderMobile(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Monthly rent</label>
                <input type="number" value={baseMonthlyRent || ""} onChange={(e) => setBaseMonthlyRent(Number(e.target.value))} className={inputClass} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Security deposit</label>
                <input type="number" value={securityDeposit || ""} onChange={(e) => setSecurityDeposit(Number(e.target.value))} className={inputClass} />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-600">Change reason</label>
                <textarea value={changeReason} onChange={(e) => setChangeReason(e.target.value)} rows={2} className={inputClass} />
              </div>
            </div>

            <button
              onClick={handleResubmit}
              disabled={submitting}
              className="w-full rounded-md bg-nnm-blue px-4 py-3 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
            >
              {submitting ? "Resubmitting…" : "Resubmit for Approval"}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
