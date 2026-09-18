"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, XCircle, RotateCcw } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { StageBadge } from "@/components/admin/stage-badge";
import { useAdminGuard } from "@/lib/use-admin-guard";
import {
  fetchShopAgreementRequestDetail,
  approveShopAgreementRequest,
  rejectShopAgreementRequest,
  revertShopAgreementRequest,
  type ShopAgreementChangeRequestDetail,
} from "@/lib/admin-shop-api";
import { ADMIN_ROLE_LABELS } from "@/lib/admin-auth";

const FIELD_DIFF_ROWS: { label: string; currentKey: string; proposedKey: string }[] = [
  { label: "Agreement Number", currentKey: "agreement_number", proposedKey: "agreementNumber" },
  { label: "Name (as per agreement)", currentKey: "agreement_holder_name", proposedKey: "agreementHolderName" },
  { label: "Name (as per demand register)", currentKey: "demand_register_holder_name", proposedKey: "demandRegisterHolderName" },
  { label: "Applicable Holder Name", currentKey: "holder_name", proposedKey: "holderName" },
  { label: "Relation Name", currentKey: "holder_relation_name", proposedKey: "holderRelationName" },
  { label: "Mobile No", currentKey: "holder_mobile", proposedKey: "holderMobile" },
  { label: "Address", currentKey: "holder_address", proposedKey: "holderAddress" },
  { label: "ID Proof Number", currentKey: "id_proof_number", proposedKey: "idProofNumber" },
  { label: "Business Name", currentKey: "business_name", proposedKey: "businessName" },
  { label: "Rent (as per agreement)", currentKey: "agreement_rent", proposedKey: "agreementRent" },
  { label: "Rent (as per demand register)", currentKey: "demand_register_rent", proposedKey: "demandRegisterRent" },
  { label: "Applicable Monthly Rent", currentKey: "base_monthly_rent", proposedKey: "baseMonthlyRent" },
  { label: "Rent (pre-2019-20)", currentKey: "rent_pre_2019", proposedKey: "rentPre2019" },
  { label: "Rent (2019-20)", currentKey: "rent_2019_20", proposedKey: "rent201920" },
  { label: "Rent (2020-21 onwards)", currentKey: "rent_2020_21_onwards", proposedKey: "rent202021Onwards" },
  { label: "Agreement Start", currentKey: "agreement_start_date", proposedKey: "agreementStartDate" },
  { label: "Agreement End", currentKey: "agreement_end_date", proposedKey: "agreementEndDate" },
  { label: "Security Deposit", currentKey: "security_deposit", proposedKey: "securityDeposit" },
  { label: "Misc Cost", currentKey: "misc_cost", proposedKey: "miscCost" },
  { label: "Misc Cost Reason", currentKey: "misc_cost_reason", proposedKey: "miscCostReason" },
  { label: "Rebate", currentKey: "misc_rebate", proposedKey: "miscRebate" },
  { label: "Rebate Reason", currentKey: "misc_rebate_reason", proposedKey: "miscRebateReason" },
  { label: "Joint Holder Name", currentKey: "joint_holder_name", proposedKey: "jointHolderName" },
  { label: "Joint Holder Relation", currentKey: "joint_holder_relation", proposedKey: "jointHolderRelation" },
  { label: "Present Occupant Name", currentKey: "present_occupant_name", proposedKey: "presentOccupantName" },
  { label: "Present Occupant Aadhaar", currentKey: "present_occupant_aadhaar", proposedKey: "presentOccupantAadhaar" },
  { label: "Present Occupant - Approx Years", currentKey: "present_occupant_years_approx", proposedKey: "presentOccupantYearsApprox" },
  { label: "Notes", currentKey: "notes", proposedKey: "notes" },
];

function displayVal(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

export default function ShopAgreementRequestDetailPage() {
  const admin = useAdminGuard();
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);

  const [detail, setDetail] = useState<ShopAgreementChangeRequestDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [acting, setActing] = useState<"approve" | "reject" | "revert" | null>(null);
  const [reverting, setReverting] = useState(false);

  function load() {
    fetchShopAgreementRequestDetail(id)
      .then(setDetail)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load this request."));
  }

  useEffect(() => {
    if (!admin || !id) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, id]);

  async function handleApprove() {
    setActing("approve");
    setError(null);
    try {
      await approveShopAgreementRequest(id, notes || undefined);
      load();
      setNotes("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not approve.");
    } finally {
      setActing(null);
    }
  }

  async function handleReject() {
    if (!notes.trim()) {
      setError("A reason is required to reject.");
      return;
    }
    setActing("reject");
    setError(null);
    try {
      await rejectShopAgreementRequest(id, notes);
      load();
      setNotes("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reject.");
    } finally {
      setActing(null);
    }
  }

  async function handleRevert() {
    if (!notes.trim()) {
      setError("A comment is required explaining what needs to be corrected.");
      return;
    }
    setActing("revert");
    setError(null);
    try {
      await revertShopAgreementRequest(id, notes);
      load();
      setNotes("");
      setReverting(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not revert.");
    } finally {
      setActing(null);
    }
  }

  if (!admin) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />

      <main className="mx-auto max-w-3xl px-6 py-10">
        <button onClick={() => router.push("/admin/shop-agreement-requests")} className="mb-4 text-sm font-medium text-nnm-blue hover:underline">
          ← Back to Shop Agreement Approvals
        </button>

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {!detail ? (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-start justify-between rounded-xl border border-slate-200 bg-white p-6">
              <div>
                <p className="font-mono text-lg font-semibold text-slate-900">{detail.request.shop_no}</p>
                <p className="mt-1 text-sm text-slate-500">
                  requested by {detail.request.requested_by} on {new Date(detail.request.requested_at).toLocaleString("en-IN")}
                </p>
                <p className="mt-2 text-sm text-slate-700">
                  <span className="font-medium">Reason:</span> {detail.request.change_reason}
                </p>
                {detail.request.approval_tier === "data_completion" && (
                  <span className="mt-2 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                    Data completion — record was migrated with gaps, stops at Deputy Commissioner
                  </span>
                )}
              </div>
              <StageBadge status={detail.request.status} currentStage={detail.request.current_stage} />
            </div>

            {detail.proposedRentPeriodsInconsistent && (
              <div role="alert" className="flex items-start gap-2.5 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-semibold">Rent period rates don&apos;t match the standard formula</p>
                  <p className="text-amber-700">{detail.proposedRentPeriodsNote}</p>
                </div>
              </div>
            )}

            <section className="rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="mb-4 text-base font-semibold text-slate-900">What&apos;s changing</h2>
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-2.5 font-medium">Field</th>
                      <th className="px-4 py-2.5 font-medium">Current</th>
                      <th className="px-4 py-2.5 font-medium">Proposed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {FIELD_DIFF_ROWS.map((row) => {
                      const currentVal = detail.currentAgreement ? detail.currentAgreement[row.currentKey] : undefined;
                      const proposedVal = detail.request.proposed_data[row.proposedKey];
                      const changed = displayVal(currentVal) !== displayVal(proposedVal);
                      return (
                        <tr key={row.label} className={`border-b border-slate-100 last:border-0 ${changed ? "bg-amber-50" : ""}`}>
                          <td className="px-4 py-2.5 text-slate-500">{row.label}</td>
                          <td className="px-4 py-2.5">{displayVal(currentVal)}</td>
                          <td className={`px-4 py-2.5 ${changed ? "font-semibold text-amber-800" : ""}`}>
                            {displayVal(proposedVal)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="mb-4 text-base font-semibold text-slate-900">Approval history</h2>
              {detail.approvalHistory.length === 0 ? (
                <p className="text-sm text-slate-400">No action taken yet — currently with {ADMIN_ROLE_LABELS[detail.request.current_stage]}.</p>
              ) : (
                <ol className="space-y-3">
                  {detail.approvalHistory.map((a) => (
                    <li key={a.id} className="flex items-start gap-3 text-sm">
                      {a.decision === "approved" ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                      ) : (
                        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                      )}
                      <div>
                        <p className="text-slate-700">
                          <span className="font-medium">{ADMIN_ROLE_LABELS[a.stage]}</span> ({a.admin_display_name}){" "}
                          {a.decision} — {new Date(a.decided_at).toLocaleString("en-IN")}
                        </p>
                        {a.notes && <p className="text-slate-500">&ldquo;{a.notes}&rdquo;</p>}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {detail.request.status === "pending" && detail.request.current_stage === admin.role ? (
              <section className="rounded-xl border border-nnm-blue bg-blue-50 p-6">
                <h2 className="mb-1 text-base font-semibold text-slate-900">Your decision</h2>
                <p className="mb-4 text-xs text-slate-500">
                  Approving sends this to the next desk in the chain (or applies it, if you&apos;re the final approval).
                </p>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={reverting ? "Comment explaining what needs to be corrected" : "Notes (required to reject, optional to approve)"}
                  rows={3}
                  className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1"
                />
                <div className="flex flex-wrap gap-3">
                  {!reverting ? (
                    <>
                      <button
                        onClick={handleApprove}
                        disabled={acting !== null}
                        className="rounded-md bg-nnm-blue px-5 py-2.5 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
                      >
                        {acting === "approve" ? "Approving…" : "Approve"}
                      </button>
                      <button
                        onClick={handleReject}
                        disabled={acting !== null}
                        className="rounded-md border border-red-300 px-5 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                      >
                        {acting === "reject" ? "Rejecting…" : "Reject"}
                      </button>
                      <button
                        onClick={() => setReverting(true)}
                        disabled={acting !== null}
                        className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 px-5 py-2.5 text-sm font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-60"
                      >
                        <RotateCcw className="h-4 w-4" />
                        Revert to Operator
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={handleRevert}
                        disabled={acting !== null}
                        className="rounded-md bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
                      >
                        {acting === "revert" ? "Reverting…" : "Confirm Revert to Operator"}
                      </button>
                      <button
                        onClick={() => {
                          setReverting(false);
                          setNotes("");
                        }}
                        className="rounded-md border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </section>
            ) : detail.request.status === "reverted" ? (
              <section className="rounded-xl border border-amber-200 bg-amber-50 p-6">
                <h2 className="mb-1 flex items-center gap-1.5 text-base font-semibold text-amber-900">
                  <RotateCcw className="h-4 w-4" />
                  Reverted to Operator
                </h2>
                <p className="text-sm text-amber-800">
                  Sent back by {detail.request.reverted_by}
                  {detail.request.reverted_at ? ` on ${new Date(detail.request.reverted_at).toLocaleDateString("en-IN")}` : ""} - awaiting operator correction.
                </p>
                {detail.request.revert_comment && <p className="mt-1 text-sm text-amber-700">&ldquo;{detail.request.revert_comment}&rdquo;</p>}
              </section>
            ) : detail.request.status === "pending" ? (
              <p className="text-sm text-slate-500">
                This request is currently with <b>{ADMIN_ROLE_LABELS[detail.request.current_stage]}</b> — it isn&apos;t at your desk yet.
              </p>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}