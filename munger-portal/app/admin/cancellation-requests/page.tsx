"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Loader2, Check, X, FileText, Receipt } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import {
  fetchCancellationRequests,
  approveCancellationRequest,
  rejectCancellationRequest,
  type CancellationRequestSummary,
  type CancellationRequestStatus,
} from "@/lib/admin-api";

const STATUS_TABS: { value: CancellationRequestStatus | "all"; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" },
];

const STATUS_STYLES: Record<CancellationRequestStatus, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

export default function CancellationRequestsPage() {
  const admin = useAdminGuard();

  function canActOn(r: CancellationRequestSummary): boolean {
    if (!admin) return false;
    return (admin.role === "tax_daroga" && r.stage === "tax_daroga") || (admin.role === "city_manager" && r.stage === "city_manager");
  }

  const [status, setStatus] = useState<CancellationRequestStatus | "all">("pending");
  const [requests, setRequests] = useState<CancellationRequestSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [actingId, setActingId] = useState<number | null>(null);
  const [actingType, setActingType] = useState<"approve" | "reject" | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  function load() {
    setRequests(null);
    fetchCancellationRequests(status === "all" ? undefined : status)
      .then(setRequests)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load cancellation requests."));
  }

  useEffect(() => {
    if (!admin) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, status]);

  function openAction(id: number, type: "approve" | "reject") {
    setActingId(id);
    setActingType(type);
    setNotes("");
    setActionError(null);
  }

  async function handleSubmitAction(e: React.FormEvent) {
    e.preventDefault();
    if (actingId === null || actingType === null) return;
    if (actingType === "reject" && !notes.trim()) {
      setActionError("A reason is required to reject a cancellation request.");
      return;
    }
    setSubmitting(true);
    setActionError(null);
    try {
      if (actingType === "approve") {
        await approveCancellationRequest(actingId, notes || undefined);
      } else {
        await rejectCancellationRequest(actingId, notes);
      }
      setActingId(null);
      load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not complete this action.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!admin) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  const actingRequest = requests?.find((r) => r.id === actingId) ?? null;

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />

      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">Cancellation Requests</h1>
        <p className="mb-6 text-sm text-slate-500">
          Requests to cancel a demand notice or payment receipt. An operator&apos;s request is decided by Tax Daroga
          alone; a Tax Collector&apos;s request additionally needs the sign-off of their assigned City Manager once
          Tax Daroga approves. Approving a receipt cancellation also reopens its demand notice for payment.
        </p>

        <div className="mb-5 flex gap-2">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatus(tab.value)}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold ${
                status === tab.value ? "bg-nnm-blue text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-100"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {!requests ? (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : requests.length === 0 ? (
          <p className="text-sm text-slate-400">No requests here.</p>
        ) : (
          <div className="space-y-3">
            {requests.map((r) => (
              <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="mb-1 flex items-center gap-2">
                      {r.request_type === "demand_notice" ? (
                        <FileText className="h-4 w-4 text-slate-400" />
                      ) : (
                        <Receipt className="h-4 w-4 text-slate-400" />
                      )}
                      <span className="font-mono text-sm font-semibold text-slate-900">
                        {r.request_type === "demand_notice" ? "Demand Notice" : "Receipt"} #{r.target_id}
                      </span>
                      <span className="font-mono text-xs text-slate-400">({r.holding_no})</span>
                    </div>
                    <p className="text-sm text-slate-700">
                      <span className="font-medium">Reason:</span> {r.reason}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Requested by {r.requested_by} on {new Date(r.requested_at).toLocaleDateString("en-IN")}
                    </p>
                    {r.status === "pending" && r.assigned_city_manager_display_name && (
                      <p className="mt-0.5 text-xs text-amber-700">
                        {r.stage === "tax_daroga" ? "Awaiting Tax Daroga - then " : "Awaiting "}
                        {r.assigned_city_manager_display_name}
                      </p>
                    )}
                    {r.status !== "pending" && (
                      <p className="mt-1 text-xs text-slate-500">
                        {r.status === "approved" ? "Approved" : "Rejected"} by {r.reviewed_by} on{" "}
                        {r.reviewed_at ? new Date(r.reviewed_at).toLocaleDateString("en-IN") : ""}
                        {r.review_notes ? ` - "${r.review_notes}"` : ""}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase ${STATUS_STYLES[r.status]}`}>
                      {r.status}
                    </span>
                    {r.status === "pending" && canActOn(r) && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => openAction(r.id, "approve")}
                          className="inline-flex items-center gap-1 rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700"
                        >
                          <Check className="h-3.5 w-3.5" />
                          Approve
                        </button>
                        <button
                          onClick={() => openAction(r.id, "reject")}
                          className="inline-flex items-center gap-1 rounded-md border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                        >
                          <X className="h-3.5 w-3.5" />
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {actingId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
            <h2 className="mb-1 text-sm font-semibold text-slate-800">
              {actingType === "approve" ? "Approve" : "Reject"} Cancellation - {actingRequest?.request_type === "demand_notice" ? "Demand Notice" : "Receipt"} #{actingRequest?.target_id}
            </h2>
            <p className="mb-4 text-xs text-slate-500">
              {actingType === "approve"
                ? actingRequest?.request_type === "receipt"
                  ? "This will cancel the receipt and reopen its demand notice for payment."
                  : "This will cancel the demand notice."
                : "The notice/receipt will remain exactly as it is now."}
            </p>

            {actionError && (
              <div role="alert" className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {actionError}
              </div>
            )}

            <form onSubmit={handleSubmitAction} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  {actingType === "approve" ? "Notes (optional)" : "Reason for rejection"}
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setActingId(null)}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className={`rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${
                    actingType === "approve" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"
                  }`}
                >
                  {submitting ? "Saving…" : actingType === "approve" ? "Confirm Approval" : "Confirm Rejection"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
