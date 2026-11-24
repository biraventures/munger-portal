"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, Loader2, ShieldAlert } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { StageBadge } from "@/components/admin/stage-badge";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { ADMIN_ROLE_LABELS } from "@/lib/admin-auth";
import { fetchChangeRequests, TIER_LABELS, type ApprovalTier, type ChangeRequestSummary } from "@/lib/admin-api";

const TIERS: ApprovalTier[] = ["minor", "significant", "use_change", "mutation"];

export default function AdminAllChangesPage() {
  const admin = useAdminGuard();
  const [requests, setRequests] = useState<ChangeRequestSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!admin) return;
    fetchChangeRequests({})
      .then((res) => setRequests(res.requests))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load change requests."));
  }, [admin]);

  if (!admin) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  if (admin.role !== "commissioner") {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <main className="mx-auto max-w-xl px-6 py-16 text-center">
          <ShieldAlert className="mx-auto mb-4 h-10 w-10 text-slate-300" />
          <h1 className="mb-2 text-lg font-semibold text-slate-900">Commissioner-only view</h1>
          <p className="mb-6 text-sm text-slate-500">
            This full categorized overview of every change request is only shown to the Municipal Commissioner. Use &ldquo;Mutation
            Approvals&rdquo; on your dashboard to review requests waiting at your own desk.
          </p>
          <Link href="/admin/dashboard" className="text-sm font-medium text-nnm-blue hover:underline">
            Back to dashboard
          </Link>
        </main>
      </div>
    );
  }

  const byTier: Record<ApprovalTier, ChangeRequestSummary[]> = { minor: [], significant: [], mutation: [], use_change: [] };
  (requests ?? []).forEach((r) => byTier[r.approval_tier]?.push(r));

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />

      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">All Property Changes</h1>
        <p className="mb-6 text-sm text-slate-500">
          Every mutation approval request, done and in process, grouped by category. Minor edits finalize at Tax Daroga; significant changes
          at Mutation Nodal Clerk; mutations (ownership changes) still require your own final approval.
        </p>

        {error && (
          <div role="alert" className="mb-6 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {!requests && !error && (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        )}

        {requests && (
          <div className="space-y-8">
            {TIERS.map((tier) => {
              const items = byTier[tier];
              const pending = items.filter((r) => r.status === "pending").length;
              const approved = items.filter((r) => r.status === "approved").length;
              const rejected = items.filter((r) => r.status === "rejected").length;

              return (
                <section key={tier}>
                  <div className="mb-3 flex items-baseline justify-between">
                    <h2 className="text-base font-semibold text-slate-900">{TIER_LABELS[tier]}</h2>
                    <span className="text-xs text-slate-500">
                      {pending} pending · {approved} approved · {rejected} rejected
                    </span>
                  </div>

                  {items.length === 0 ? (
                    <p className="text-sm text-slate-400">No requests in this category.</p>
                  ) : (
                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                            <th className="px-4 py-2.5 font-medium">Holding No</th>
                            <th className="px-4 py-2.5 font-medium">Requested By</th>
                            <th className="px-4 py-2.5 font-medium">Requested At</th>
                            <th className="px-4 py-2.5 font-medium">Change Basis</th>
                            <th className="px-4 py-2.5 font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((r) => (
                            <tr key={r.id} className="border-b border-slate-100 last:border-0">
                              <td className="px-4 py-2 font-mono">
                                <Link href={`/admin/change-requests/${r.id}`} className="text-nnm-blue hover:underline">
                                  {r.holding_no}
                                </Link>
                              </td>
                              <td className="px-4 py-2">{r.requested_by}</td>
                              <td className="px-4 py-2 text-slate-500">{new Date(r.requested_at).toLocaleDateString("en-IN")}</td>
                              <td className="px-4 py-2">{r.change_basis}</td>
                              <td className="px-4 py-2">
                                <StageBadge status={r.status} currentStage={r.current_stage} />
                                {r.status === "pending" && (
                                  <span className="ml-1.5 text-xs text-slate-400">(finalizes at {ADMIN_ROLE_LABELS[r.final_stage]})</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
