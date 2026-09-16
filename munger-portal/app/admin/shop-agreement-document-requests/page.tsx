"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, FileText, XCircle } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import {
  fetchShopAgreementDocumentRequestQueue,
  fetchShopAgreementDocumentRequestBlobUrl,
  approveShopAgreementDocumentRequest,
  rejectShopAgreementDocumentRequest,
  type ShopAgreementDocumentRequestSummary,
} from "@/lib/admin-shop-api";

const REVIEW_ROLES = ["stall_prabhari", "city_manager", "deputy_commissioner"];

export default function ShopAgreementDocumentRequestsPage() {
  const admin = useAdminGuard();
  const [requests, setRequests] = useState<ShopAgreementDocumentRequestSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<number | null>(null);
  const [actingId, setActingId] = useState<number | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  function load() {
    fetchShopAgreementDocumentRequestQueue()
      .then(setRequests)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the review queue."));
  }

  useEffect(() => {
    if (!admin) return;
    load();
  }, [admin]);

  async function handleView(id: number) {
    setError(null);
    setViewingId(id);
    try {
      const url = await fetchShopAgreementDocumentRequestBlobUrl(id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open this document.");
    } finally {
      setViewingId(null);
    }
  }

  async function handleApprove(id: number) {
    setError(null);
    setActingId(id);
    try {
      await approveShopAgreementDocumentRequest(id, null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not approve this document.");
    } finally {
      setActingId(null);
    }
  }

  async function handleReject(id: number) {
    if (!rejectReason.trim()) {
      setError("A reason is required to reject a document.");
      return;
    }
    setError(null);
    setActingId(id);
    try {
      await rejectShopAgreementDocumentRequest(id, rejectReason.trim());
      setRejectingId(null);
      setRejectReason("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reject this document.");
    } finally {
      setActingId(null);
    }
  }

  if (!admin) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  if (!REVIEW_ROLES.includes(admin.role)) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <main className="mx-auto max-w-2xl px-6 py-10">
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Agreement document review is restricted to the Stall Prabhari, City Manager, and Deputy Municipal Commissioner.
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />

      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">Shop Agreement Document Approvals</h1>
        <p className="mb-6 text-sm text-slate-500">
          An uploaded agreement PDF (new or changed) moves through Stall Prabhari → City Manager → Deputy Commissioner before it
          becomes the shop&apos;s live document. Showing requests waiting on your stage.
        </p>

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {!requests ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : requests.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">
            Nothing waiting on your review right now.
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map((r) => (
              <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{r.shop_no}</p>
                    <p className="text-xs text-slate-500">
                      {r.is_change ? "Change to existing document" : "First-time upload"} - by {r.uploaded_by} on{" "}
                      {new Date(r.uploaded_at).toLocaleDateString("en-IN")}
                    </p>
                  </div>
                  <button
                    onClick={() => handleView(r.id)}
                    disabled={viewingId === r.id}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    {viewingId === r.id ? "Opening…" : `View ${r.file_name}`}
                  </button>
                </div>

                {rejectingId === r.id ? (
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <label className="mb-1 block text-xs font-medium text-slate-600">Reason for rejection</label>
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      rows={2}
                      className="mb-2 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleReject(r.id)}
                        disabled={actingId === r.id}
                        className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                      >
                        {actingId === r.id ? "Rejecting…" : "Confirm Rejection"}
                      </button>
                      <button
                        onClick={() => {
                          setRejectingId(null);
                          setRejectReason("");
                        }}
                        className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApprove(r.id)}
                      disabled={actingId === r.id}
                      className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-60"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {actingId === r.id ? "Approving…" : "Approve"}
                    </button>
                    <button
                      onClick={() => setRejectingId(r.id)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
