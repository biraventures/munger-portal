"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { StageBadge } from "@/components/admin/stage-badge";
import { useAdminGuard } from "@/lib/use-admin-guard";
import {
  fetchTradeLicenseApplicationDetail,
  approveTradeLicenseApplication,
  rejectTradeLicenseApplication,
  openAdminTradeLicenseDocument,
} from "@/lib/admin-trade-license-api";
import { businessCategoryLabel, type TradeLicenseApplicationDetail } from "@/lib/trade-license-api";
import { TradeLicenseDocumentList } from "@/components/trade-license-documents";
import { ADMIN_ROLE_LABELS, type AdminRole } from "@/lib/admin-auth";

function fmtDate(v: string | null): string {
  return v ? new Date(v).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" }) : "—";
}

function displayVal(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

export default function TradeLicenseRequestDetailPage() {
  const admin = useAdminGuard();
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);

  const [detail, setDetail] = useState<TradeLicenseApplicationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [acting, setActing] = useState<"approve" | "reject" | null>(null);

  function load() {
    fetchTradeLicenseApplicationDetail(id)
      .then(setDetail)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load this application."));
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
      await approveTradeLicenseApplication(id, notes || undefined);
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
      await rejectTradeLicenseApplication(id, notes);
      load();
      setNotes("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reject.");
    } finally {
      setActing(null);
    }
  }

  if (!admin) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  const submittedCount = detail?.checklist.filter((c) => c.submitted).length ?? 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />

      <main className="mx-auto max-w-3xl px-6 py-10">
        <button onClick={() => router.push("/admin/trade-license-requests")} className="mb-4 text-sm font-medium text-nnm-blue hover:underline">
          ← Back to Trade License Applications
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
                <p className="font-mono text-lg font-semibold text-slate-900">{detail.application.application_number}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {detail.application.applicant_name} — {detail.application.entity_name}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  requested by {detail.application.requested_by} on {new Date(detail.application.requested_at).toLocaleString("en-IN")}
                </p>
              </div>
              <StageBadge status={detail.application.status} currentStage={detail.application.current_stage as AdminRole} />
            </div>

            {detail.application.status === "approved" && detail.application.license_issued_on && (
              <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                Licence issued on <b>{fmtDate(detail.application.license_issued_on)}</b>, valid till <b>{fmtDate(detail.application.license_valid_till)}</b> (
                {detail.application.duration_years} year{detail.application.duration_years === 1 ? "" : "s"} from issue).
              </div>
            )}

            <section className="rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="mb-4 text-base font-semibold text-slate-900">Application Details</h2>
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <div><span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Type</span><span className="capitalize">{detail.application.application_type}</span></div>
                <div><span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Relation</span><span>{displayVal(detail.application.relation_type)} {displayVal(detail.application.relation_name)}</span></div>
                <div><span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Mobile</span><span>{displayVal(detail.application.mobile)}</span></div>
                <div><span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Email</span><span>{displayVal(detail.application.email)}</span></div>
                <div><span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Entity Type</span><span>{displayVal(detail.application.entity_type)}</span></div>
                <div><span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Entity (Hindi)</span><span>{displayVal(detail.application.entity_name_hindi)}</span></div>
                <div className="sm:col-span-2"><span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Business Type</span><span>{displayVal(businessCategoryLabel(detail.application.business_category))}</span></div>
                <div><span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Business (description)</span><span>{displayVal(detail.application.type_of_business)}</span></div>
                <div><span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Nagar Nigam stall/shop</span><span>{displayVal(detail.application.is_nnm_shop)}{detail.application.nnm_shop_no ? ` — ${detail.application.nnm_shop_no}` : ""}</span></div>
                <div className="sm:col-span-2"><span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Address</span><span>{displayVal(detail.application.complete_address)}</span></div>
                <div><span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Holding No</span><span>{displayVal(detail.application.holding_no)}</span></div>
                <div><span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Commercial Area</span><span>{displayVal(detail.application.commercial_area_sqft)} sqft</span></div>
                <div><span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Area Ownership</span><span>{displayVal(detail.application.area_ownership)}</span></div>
                <div><span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Houseowner</span><span>{displayVal(detail.application.houseowner_name)}</span></div>
                <div><span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">GST registered</span><span>{displayVal(detail.application.is_gst_registered)}</span></div>
                <div><span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">GSTIN / TAN</span><span>{displayVal(detail.application.tan_or_gstr_number)}</span></div>
                <div><span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">PAN (applicant)</span><span>{displayVal(detail.application.pan_number)}</span></div>
                <div><span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">PAN (firm)</span><span>{displayVal(detail.application.firm_pan_number)}</span></div>
                <div><span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Duration</span><span>{detail.application.duration_years} year(s)</span></div>
                <div><span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Turnover</span><span>{displayVal(detail.application.annual_turnover_bracket)}</span></div>
                <div><span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">BPL</span><span>{detail.application.is_bpl === null ? displayVal(detail.application.bpl_proof_attached) : displayVal(detail.application.is_bpl)}</span></div>
                <div><span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Holding Receipt</span><span>{displayVal(detail.application.holding_receipt_attached)}</span></div>
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="mb-4 text-base font-semibold text-slate-900">Uploaded Documents</h2>
              <TradeLicenseDocumentList documents={detail.documents} open={(docId) => openAdminTradeLicenseDocument(id, docId)} />
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-900">Document Checklist</h2>
                <span className="text-sm text-slate-500">{submittedCount} of {detail.checklist.length} received</span>
              </div>
              <ul className="space-y-2">
                {detail.checklist.map((item) => (
                  <li key={item.id} className="flex items-start gap-2.5 text-sm">
                    {item.submitted ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                    ) : (
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
                    )}
                    <div>
                      <span className={item.submitted ? "text-slate-900" : "text-slate-400"}>{item.document_name}</span>
                      {item.comments && <span className="block text-xs text-slate-500">&ldquo;{item.comments}&rdquo;</span>}
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="mb-4 text-base font-semibold text-slate-900">Approval history</h2>
              {detail.approvalHistory.length === 0 ? (
                <p className="text-sm text-slate-400">No action taken yet — currently with {ADMIN_ROLE_LABELS[detail.application.current_stage as AdminRole]}.</p>
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
                          <span className="font-medium">{ADMIN_ROLE_LABELS[a.stage as AdminRole]}</span> ({a.admin_display_name}){" "}
                          {a.decision} — {new Date(a.decided_at).toLocaleString("en-IN")}
                        </p>
                        {a.notes && <p className="text-slate-500">&ldquo;{a.notes}&rdquo;</p>}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {detail.application.status === "pending" && detail.application.current_stage === admin.role ? (
              <section className="rounded-xl border border-nnm-blue bg-blue-50 p-6">
                <h2 className="mb-1 text-base font-semibold text-slate-900">Your decision</h2>
                <p className="mb-4 text-xs text-slate-500">
                  Approving sends this to the next desk in the chain (or finalizes it, if you&apos;re the final approval).
                </p>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notes (required to reject, optional to approve)"
                  rows={3}
                  className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1"
                />
                <div className="flex gap-3">
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
                </div>
              </section>
            ) : detail.application.status === "pending" ? (
              <p className="text-sm text-slate-500">
                This application is currently with <b>{ADMIN_ROLE_LABELS[detail.application.current_stage as AdminRole]}</b>
                {admin.role === "agency_operator" ? " - view only (ID numbers masked, documents not shown)." : <> — it isn&apos;t at your desk yet.</>}
              </p>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}