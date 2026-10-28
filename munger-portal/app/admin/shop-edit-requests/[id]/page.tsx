"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { ShopEditChangeReview } from "@/components/admin/shop-change-review";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import {
  fetchShopEditRequestDetail,
  approveShopEditRequest,
  rejectShopEditRequest,
  type ShopEditRequestDetail,
} from "@/lib/admin-shop-api";
import { ADMIN_ROLE_LABELS, type AdminRole } from "@/lib/admin-auth";

export default function ShopEditRequestDetailPage() {
  const admin = useAdminGuard();
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);

  const [detail, setDetail] = useState<ShopEditRequestDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [acting, setActing] = useState<"approve" | "reject" | null>(null);

  function load() {
    fetchShopEditRequestDetail(id)
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
      await approveShopEditRequest(id, notes || undefined);
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
      await rejectShopEditRequest(id, notes);
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

  const canActOnThis = detail?.request.status === "pending" && admin.role === detail.request.current_stage;

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />

      <main className="mx-auto max-w-3xl px-6 py-10">
        <button onClick={() => router.push("/admin/shop-edit-requests")} className="mb-4 text-sm font-medium text-nnm-blue hover:underline">
          ← Back to Shop Edit Approvals
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
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <p className="font-mono text-lg font-semibold text-slate-900">{detail.request.shop_no}</p>
              <p className="mt-1 text-sm text-slate-500">
                Requested by {detail.request.requested_by} on {new Date(detail.request.requested_at).toLocaleString("en-IN")}
              </p>
              <p className="mt-2 text-sm text-slate-700">
                <span className="font-medium">Reason:</span> {detail.request.change_reason}
              </p>
              <p className="mt-2 text-sm">
                <span className="font-medium text-slate-700">Status:</span>{" "}
                {detail.request.status === "pending"
                  ? `Pending - with ${ADMIN_ROLE_LABELS[detail.request.current_stage as AdminRole] ?? detail.request.current_stage}`
                  : detail.request.status === "approved"
                    ? "Approved and applied to the shop"
                    : `Rejected${detail.request.review_notes ? `: ${detail.request.review_notes}` : ""}`}
              </p>
            </div>

            <ShopEditChangeReview
              status={detail.request.status}
              shop={detail.currentShop}
              currentAgreement={detail.currentAgreement}
              baseline={detail.baseline}
              proposed={detail.request.proposed_data as Record<string, unknown>}
            />

            {detail.approvalHistory.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-6">
                <h2 className="mb-3 text-sm font-semibold text-slate-700">Approval History</h2>
                <div className="space-y-2">
                  {detail.approvalHistory.map((a) => (
                    <div key={a.id} className="flex items-center justify-between text-sm">
                      <span className={a.decision === "approved" ? "text-green-700" : "text-red-700"}>
                        {ADMIN_ROLE_LABELS[a.stage as AdminRole] ?? a.stage} - {a.decision} by {a.decided_by_display_name}
                      </span>
                      <span className="text-xs text-slate-400">{new Date(a.decided_at).toLocaleDateString("en-IN")}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {canActOnThis && (
              <div className="rounded-xl border border-slate-200 bg-white p-6">
                <h2 className="mb-3 text-sm font-semibold text-slate-700">Your Decision</h2>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notes (required to reject, optional to approve)"
                  rows={2}
                  className="mb-3 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleApprove}
                    disabled={acting !== null}
                    className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {acting === "approve" ? "Approving…" : "Approve"}
                  </button>
                  <button
                    onClick={handleReject}
                    disabled={acting !== null}
                    className="inline-flex items-center gap-1.5 rounded-md border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                  >
                    <XCircle className="h-4 w-4" />
                    {acting === "reject" ? "Rejecting…" : "Reject"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
