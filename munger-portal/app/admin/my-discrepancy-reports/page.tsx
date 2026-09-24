"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, Loader2 } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { fetchMyDiscrepancyRequests, type PropertyDiscrepancyRequest } from "@/lib/admin-api";
import { ADMIN_ROLE_LABELS } from "@/lib/admin-auth";

function StatusBadge({ request }: { request: PropertyDiscrepancyRequest }) {
  if (request.status === "approved") {
    return <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">Approved</span>;
  }
  if (request.status === "rejected") {
    return <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">Rejected</span>;
  }
  if (request.status === "reverted") {
    return <span className="inline-flex items-center rounded-full bg-orange-100 px-2.5 py-1 text-xs font-semibold text-orange-700">Needs your correction</span>;
  }
  return (
    <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
      With {ADMIN_ROLE_LABELS[request.current_stage]}
    </span>
  );
}

export default function MyDiscrepancyReportsPage() {
  const admin = useAdminGuard();
  const [requests, setRequests] = useState<PropertyDiscrepancyRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!admin) return;
    fetchMyDiscrepancyRequests()
      .then(setRequests)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load your discrepancy reports."));
  }, [admin]);

  if (!admin) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  if (admin.role !== "tax_collector") {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <main className="mx-auto max-w-2xl px-6 py-10">
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            This is restricted to the Tax Collector.
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />

      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">My Discrepancy Reports</h1>
        <p className="mb-6 text-sm text-slate-500">Everything you&apos;ve reported, and its status through review.</p>

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
          <p className="text-sm text-slate-400">You haven&apos;t reported any discrepancies yet.</p>
        ) : (
          <div className="space-y-3">
            {requests.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5">
                <div>
                  <p className="font-mono text-sm font-semibold text-slate-900">{r.holding_no}</p>
                  <p className="text-xs text-slate-500">Reported {new Date(r.reported_at).toLocaleDateString("en-IN")}</p>
                  {r.status === "reverted" && r.revert_comment && (
                    <p className="mt-1 text-xs text-orange-700">
                      <span className="font-medium">{r.reverted_by} says:</span> &ldquo;{r.revert_comment}&rdquo;
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <StatusBadge request={r} />
                  {r.status === "reverted" && (
                    <Link
                      href={`/admin/report-property-discrepancy/resubmit/${r.id}`}
                      className="rounded-md bg-nnm-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-nnm-blue-dark"
                    >
                      Correct & Resubmit
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
