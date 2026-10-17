"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertCircle, Loader2, RotateCcw } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { StageBadge } from "@/components/admin/stage-badge";
import { useAdminGuard } from "@/lib/use-admin-guard";
import {
  fetchChangeRequestDetail,
  approveChangeRequest,
  rejectChangeRequest,
  revertChangeRequest,
  type ChangeRequestDetail,
} from "@/lib/admin-api";
import { ADMIN_ROLE_LABELS } from "@/lib/admin-auth";
import { TaxExemptionReview } from "@/components/admin/tax-exemption-review";
import { MutationApplicationPanel } from "@/components/admin/mutation-application-panel";
import { MutationTimeline } from "@/components/admin/mutation-timeline";
import { AreaVerificationForm, AreaVerificationView, toBody, verificationProblem, type VerificationDraft } from "@/components/admin/mutation-area-verification";

const FIELD_DIFF_ROWS: { label: string; currentKey: string; proposedKey: string }[] = [
  { label: "Owner Name", currentKey: "owner_name", proposedKey: "ownerName" },
  { label: "Relation Name", currentKey: "relation_name", proposedKey: "relationName" },
  { label: "Mobile No", currentKey: "mobile_no", proposedKey: "mobileNo" },
  { label: "Address", currentKey: "address", proposedKey: "address" },
  { label: "Ward", currentKey: "ward", proposedKey: "ward" },
  { label: "Zone", currentKey: "zone", proposedKey: "zone" },
  { label: "Pincode", currentKey: "pincode", proposedKey: "pincode" },
  { label: "Assessment Year", currentKey: "assessment_year", proposedKey: "assessmentYear" },
  { label: "Road Type", currentKey: "road_type", proposedKey: "roadType" },
  { label: "Plot Area (sqft)", currentKey: "area_sqft", proposedKey: "areaSqft" },
  { label: "Vacant Area (sqft)", currentKey: "vacant_area_sqft", proposedKey: "vacantAreaSqft" },
  { label: "Holding Creation Year", currentKey: "holding_creation_year", proposedKey: "holdingCreationYear" },
  { label: "Tax Paid Till Year", currentKey: "tax_paid_till_year", proposedKey: "taxPaidTillYear" },
  { label: "Solid Waste Charge Type", currentKey: "solid_waste_charge_type", proposedKey: "solidWasteChargeType" },
  { label: "Bulk Waste Generator (no solid waste charge)", currentKey: "is_bwg", proposedKey: "isBwg" },
  { label: "Slum area holding", currentKey: "is_slum", proposedKey: "isSlum" },
];

function displayVal(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

export default function ChangeRequestDetailPage() {
  const admin = useAdminGuard();
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);

  const [detail, setDetail] = useState<ChangeRequestDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [acting, setActing] = useState<"approve" | "reject" | "revert" | null>(null);
  const [reverting, setReverting] = useState(false);
  const [verification, setVerification] = useState<VerificationDraft>({
    jamabandiAreaSqft: "",
    documentAreaSqft: "",
    holdingAreaSqft: "",
    entire: true,
    mutateAreaSqft: "",
    khataNo: "",
    khesraNo: "",
    surveySheetNo: "",
    surveyWard: "",
    remarks: "",
  });
  const [trailKey, setTrailKey] = useState(0);

  function load() {
    setTrailKey((k) => k + 1);
    fetchChangeRequestDetail(id)
      .then((d) => {
        setDetail(d);
        // Pre-fill the land-record details from the application / holding (the Tax Daroga checks and corrects them).
        if (d.landRecord) {
          setVerification((v) => ({
            ...v,
            khataNo: v.khataNo || d.landRecord?.khataNo || "",
            khesraNo: v.khesraNo || d.landRecord?.khesraNo || "",
            surveySheetNo: v.surveySheetNo || d.landRecord?.surveySheetNo || "",
            surveyWard: v.surveyWard || d.landRecord?.surveyWard || "",
            entire: d.landRecord?.mutateEntire ?? true,
            mutateAreaSqft: v.mutateAreaSqft || d.landRecord?.mutateAreaSqft || "",
          }));
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load this request."));
  }

  useEffect(() => {
    if (!admin || !id) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, id]);

  const needsVerification =
    !!detail && !!admin && detail.request.status === "pending" && detail.request.current_stage === "tax_daroga" && detail.request.approval_tier === "mutation" && admin.role === "tax_daroga";

  async function handleApprove() {
    if (needsVerification) {
      const problem = verificationProblem(verification);
      if (problem) {
        setError(problem);
        return;
      }
    }
    setActing("approve");
    setError(null);
    try {
      await approveChangeRequest(id, notes || undefined, needsVerification ? toBody(verification) : undefined);
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
      setError("A reason is required to reject a change.");
      return;
    }
    setActing("reject");
    setError(null);
    try {
      await rejectChangeRequest(id, notes);
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
      await revertChangeRequest(id, notes);
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
        <button onClick={() => router.push("/admin/change-requests")} className="mb-4 text-sm font-medium text-nnm-blue hover:underline">
          ← Back to Mutation Approvals
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
                <p className="font-mono text-lg font-semibold text-slate-900">{detail.request.holding_no}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {detail.request.change_basis} — requested by {detail.request.requested_by} on{" "}
                  {new Date(detail.request.requested_at).toLocaleString("en-IN")}
                </p>
                <p className="mt-2 text-sm text-slate-700">
                  <span className="font-medium">Reference/remarks:</span> {detail.request.change_reference}
                </p>
              </div>
              <StageBadge status={detail.request.status} currentStage={detail.request.current_stage} />
            </div>

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
                      const currentVal = detail.currentProperty ? detail.currentProperty[row.currentKey] : undefined;
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

            <TaxExemptionReview current={detail.currentProperty ?? null} proposed={detail.request.proposed_data.taxExemption} />

            {detail.request.public_application_id && (
              <section className="rounded-xl border border-blue-200 bg-white p-6">
                <h2 className="mb-4 text-base font-semibold text-slate-900">Online mutation application</h2>
                <MutationApplicationPanel applicationId={String(detail.request.public_application_id)} />
              </section>
            )}

            {detail.verification && <AreaVerificationView v={detail.verification} />}

            {detail.lineage && detail.lineage.length > 0 && (
              <section className="rounded-xl border border-blue-200 bg-blue-50 p-6 text-sm text-blue-900">
                <h2 className="mb-2 text-base font-semibold">New holding created</h2>
                {detail.lineage.map((l) => (
                  <p key={l.child_holding_no}>
                    <b className="font-mono">{l.child_holding_no}</b> created for the transferred {Number(l.area_sqft).toLocaleString("en-IN")} sq ft; holding{" "}
                    <b className="font-mono">{l.parent_holding_no}</b> continues with {Number(l.parent_area_after).toLocaleString("en-IN")} sq ft (was{" "}
                    {Number(l.parent_area_before).toLocaleString("en-IN")}). The new holding is flagged for a floor survey.
                  </p>
                ))}
              </section>
            )}

            <section className="rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="mb-4 text-base font-semibold text-slate-900">Audit trail</h2>
              <MutationTimeline key={trailKey} changeRequestId={id} />
            </section>

            {detail.request.status === "pending" && detail.request.current_stage === admin.role ? (
              <section className="rounded-xl border border-nnm-blue bg-blue-50 p-6">
                <h2 className="mb-1 text-base font-semibold text-slate-900">Your decision</h2>
                <p className="mb-4 text-xs text-slate-500">
                  Approving sends this to {ADMIN_ROLE_LABELS[detail.request.current_stage] === ADMIN_ROLE_LABELS["commissioner"] ? "final application" : "the next desk"}.
                </p>
                {needsVerification && !reverting && (
                  <AreaVerificationForm
                    value={verification}
                    onChange={setVerification}
                    recordArea={detail.currentProperty?.area_sqft != null ? String(detail.currentProperty.area_sqft) : null}
                  />
                )}
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
                        {acting === "approve" ? "Saving…" : detail.request.current_stage === detail.request.final_stage ? "Approve (final)" : "Approve & forward"}
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
                        {detail.request.public_application_id ? "Send back to applicant" : "Revert to Operator"}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={handleRevert}
                        disabled={acting !== null}
                        className="rounded-md bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
                      >
                        {acting === "revert" ? "Sending back…" : detail.request.public_application_id ? "Confirm — send back to applicant" : "Confirm Revert to Operator"}
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
                  {detail.request.public_application_id ? "Sent back to the applicant" : "Reverted to Operator"}
                </h2>
                <p className="text-sm text-amber-800">
                  Sent back by {detail.request.reverted_by} ({ADMIN_ROLE_LABELS[detail.request.reverted_from_stage as keyof typeof ADMIN_ROLE_LABELS] ?? detail.request.reverted_from_stage})
                  {detail.request.reverted_at ? ` on ${new Date(detail.request.reverted_at).toLocaleDateString("en-IN")}` : ""} -{" "}
                  {detail.request.public_application_id ? "awaiting the applicant's online correction." : "awaiting operator correction."}
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