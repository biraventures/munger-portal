"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, AlertCircle } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { fetchDiscrepancyRequests, type PropertyDiscrepancyRequest } from "@/lib/admin-api";
import { ADMIN_ROLE_LABELS } from "@/lib/admin-auth";

const STATUS_TABS: { value: "pending" | "approved" | "rejected" | "all"; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" },
];

const DISCREPANCY_CHAIN_ROLES = ["tax_surveyor", "tax_daroga", "city_manager", "deputy_commissioner", "commissioner"];

function StatusBadge({ request }: { request: PropertyDiscrepancyRequest }) {
  if (request.status === "approved") {
    return <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">Approved</span>;
  }
  if (request.status === "rejected") {
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
        Rejected at {ADMIN_ROLE_LABELS[request.current_stage]}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
      With {ADMIN_ROLE_LABELS[request.current_stage]}
    </span>
  );
}

export default function PropertyDiscrepancyRequestsPage() {
  const admin = useAdminGuard();
  const [status, setStatus] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [myStageOnly, setMyStageOnly] = useState(true);
  const [requests, setRequests] = useState<PropertyDiscrepancyRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!admin || !DISCREPANCY_CHAIN_ROLES.includes(admin.role)) return;
    setRequests(null);
    fetchDiscrepancyRequests({ status: status === "all" ? undefined : status, myStage: myStageOnly })
      .then((r) => setRequests(r.requests))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load discrepancy requests."));
  }, [admin, status, myStageOnly]);

  if (!admin) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  if (!DISCREPANCY_CHAIN_ROLES.includes(admin.role)) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <main className="mx-auto max-w-2xl px-6 py-10">
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            This is restricted to Tax Surveyor, Tax Daroga, City Manager, and Deputy Commissioner.
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />

      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">Property Discrepancy Approvals</h1>
        <p className="mb-6 text-sm text-slate-500">
          A Tax Collector&apos;s field-found correction moves through Tax Surveyor → Tax Daroga → City Manager → Deputy Commissioner.
        </p>

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
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
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={myStageOnly} onChange={(e) => setMyStageOnly(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
            Only show requests at my desk
          </label>
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
              <Link
                key={r.id}
                href={`/admin/property-discrepancy-requests/${r.id}`}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 transition-shadow hover:shadow-md"
              >
                <div>
                  <p className="font-mono text-sm font-semibold text-slate-900">{r.holding_no}</p>
                  <p className="text-xs text-slate-500">
                    Reported by {r.reported_by_display_name} on {new Date(r.reported_at).toLocaleDateString("en-IN")}
                  </p>
                </div>
                <StatusBadge request={r} />
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
