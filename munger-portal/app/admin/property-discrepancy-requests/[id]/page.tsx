"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import {
  fetchDiscrepancyRequestDetail,
  approveDiscrepancyRequest,
  rejectDiscrepancyRequest,
} from "@/lib/admin-api";
import type { PropertyDiscrepancyRequest, PropertyDiscrepancyApproval } from "@/lib/admin-api";
import { ADMIN_ROLE_LABELS } from "@/lib/admin-auth";

const FIELD_DIFF_ROWS: { label: string; currentKey: string; proposedKey: string }[] = [
  { label: "Owner Name", currentKey: "owner_name", proposedKey: "ownerName" },
  { label: "Address", currentKey: "address", proposedKey: "address" },
  { label: "Ward", currentKey: "ward", proposedKey: "ward" },
  { label: "Assessment Year", currentKey: "assessment_year", proposedKey: "assessmentYear" },
  { label: "Road Type", currentKey: "road_type", proposedKey: "roadType" },
  { label: "Plot Area (sqft)", currentKey: "area_sqft", proposedKey: "areaSqft" },
  { label: "Holding Creation Year", currentKey: "holding_creation_year", proposedKey: "holdingCreationYear" },
];

function displayVal(v: unknown): string {
  if (v === null || v === undefined || v === "") return "-";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

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

export default function PropertyDiscrepancyRequestDetailPage() {
  const admin = useAdminGuard();
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);

  const [detail, setDetail] = useState<{
    request: PropertyDiscrepancyRequest;
    currentProperty: Record<string, unknown> | null;
    currentFloors: Record<string, unknown>[];
    approvalHistory: PropertyDiscrepancyApproval[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [acting, setActing] = useState<"approve" | "reject" | null>(null);

  function load() {
    fetchDiscrepancyRequestDetail(id)
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
      await approveDiscrepancyRequest(id, notes || undefined);
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
      await rejectDiscrepancyRequest(id, notes);
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

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />

      <main className="mx-auto max-w-3xl px-6 py-10">
        <button onClick={() => router.push("/admin/property-discrepancy-requests")} className="mb-4 text-sm font-medium text-nnm-blue hover:underline">
          ← Back to Property Discrepancy Approvals
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
                  Reported by {detail.request.reported_by_display_name} on {new Date(detail.request.reported_at).toLocaleString("en-IN")}
                </p>
                <p className="mt-2 text-sm text-slate-700">
                  <span className="font-medium">What the Tax Collector found:</span> {detail.request.discrepancy_notes}
                </p>
              </div>
              <StatusBadge request={detail.request} />
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
                          <td className={`px-4 py-2.5 ${changed ? "font-semibold text-amber-800" : ""}`}>{displayVal(proposedVal)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="mb-3 text-base font-semibold text-slate-900">Proposed floors</h2>
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-2.5 font-medium">Floor</th>
                      <th className="px-4 py-2.5 font-medium">Area (sqft)</th>
                      <th className="px-4 py-2.5 font-medium">Usage</th>
                      <th className="px-4 py-2.5 font-medium">Occupancy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(detail.request.proposed_data.floors as Record<string, unknown>[] | undefined)?.map((f, i) => (
                      <tr key={i} className="border-b border-slate-100 last:border-0">
                        <td className="px-4 py-2.5">{displayVal(f.floorLabel)}</td>
                        <td className="px-4 py-2.5">{displayVal(f.buildupSqft)}</td>
                        <td className="px-4 py-2.5">{displayVal(f.usageType)}</td>
                        <td className="px-4 py-2.5">{displayVal(f.occupancy)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-slate-400">Currently on record: {detail.currentFloors.length} floor(s).</p>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="mb-4 text-base font-semibold text-slate-900">Approval history</h2>
              {detail.approvalHistory.length === 0 ? (
                <p className="text-sm text-slate-400">No action taken yet - currently with {ADMIN_ROLE_LABELS[detail.request.current_stage]}.</p>
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
                          <span className="font-medium">{ADMIN_ROLE_LABELS[a.stage]}</span> ({a.admin_display_name}) {a.decision} -{" "}
                          {new Date(a.decided_at).toLocaleString("en-IN")}
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
                  {ADMIN_ROLE_LABELS[detail.request.current_stage] === ADMIN_ROLE_LABELS["deputy_commissioner"]
                    ? "Approving applies this correction to the property record."
                    : "Approving sends this to the next desk."}
                </p>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notes (required to reject, optional to approve)"
                  rows={3}
                  className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1"
                />
                <div className="flex flex-wrap gap-3">
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
            ) : detail.request.status === "pending" ? (
              <p className="text-sm text-slate-500">
                This request is currently with <b>{ADMIN_ROLE_LABELS[detail.request.current_stage]}</b> - it isn&apos;t at your desk yet.
              </p>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}
