"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, RotateCcw } from "lucide-react";
import { OperatorHeader } from "@/components/operator-header";
import { useOperatorGuard } from "@/lib/use-operator-guard";
import { ShopAgreementForm } from "@/components/operator/shop-agreement-form";
import { fetchRevertedShopAgreementRequests, resubmitShopAgreementRequest, type RevertedShopAgreementRequest, type AgreementInput } from "@/lib/shop-api";

export default function RevertedShopAgreementsPage() {
  const operator = useOperatorGuard();
  const [list, setList] = useState<RevertedShopAgreementRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editing, setEditing] = useState<RevertedShopAgreementRequest | null>(null);

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
  }

  async function handleResubmit(input: AgreementInput): Promise<{ changeRequestId: number; approvalTier: "full" | "data_completion" }> {
    if (!editing) throw new Error("No request selected.");
    await resubmitShopAgreementRequest(editing.id, input);
    // Resubmitting always re-enters the chain from its first stage
    // (see resubmitCorrectedShopAgreementChange on the backend) -
    // "full" is what actually happens here, not a guess, since there's
    // no shortened data_completion path for a correction.
    return { changeRequestId: editing.id, approvalTier: "full" };
  }

  function handleSubmitted() {
    setSuccess(`${editing?.shop_no} resubmitted for approval.`);
    setEditing(null);
    load();
  }

  if (!operator) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <OperatorHeader operator={operator} />

      <main className="mx-auto max-w-3xl px-6 py-10">
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

            <ShopAgreementForm
              shopNo={editing.shop_no}
              isEditing
              initial={{ ...editing.proposed_data, changeReason: editing.change_reason }}
              onSubmit={handleResubmit}
              onSubmitted={handleSubmitted}
              submitLabel="Resubmit for Approval"
            />
          </div>
        )}
      </main>
    </div>
  );
}
