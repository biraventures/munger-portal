"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Clock, Download, RotateCcw } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { fetchEntryRevertEvents, downloadEntryRevertEventsExport, type EntryRevertEvent } from "@/lib/admin-api";
import { ADMIN_ROLE_LABELS, type AdminRole } from "@/lib/admin-auth";

const ENTRY_TYPE_LABELS: Record<EntryRevertEvent["entry_type"], string> = {
  property_mutation: "Property Mutation",
  shop_agreement: "Shop Agreement",
};

export default function RevertAuditTrailPage() {
  const admin = useAdminGuard();
  const [events, setEvents] = useState<EntryRevertEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [filter, setFilter] = useState<"all" | EntryRevertEvent["entry_type"]>("all");

  useEffect(() => {
    if (!admin) return;
    fetchEntryRevertEvents()
      .then(setEvents)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the audit trail."));
  }, [admin]);

  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      await downloadEntryRevertEventsExport();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not download the export.");
    } finally {
      setExporting(false);
    }
  }

  if (!admin) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  if (admin.role !== "commissioner") {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <main className="mx-auto max-w-2xl px-6 py-10">
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            This is restricted to the Municipal Commissioner.
          </div>
        </main>
      </div>
    );
  }

  const filtered = events?.filter((e) => filter === "all" || e.entry_type === filter) ?? [];

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />

      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-1 flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
            <RotateCcw className="h-6 w-6" />
            Revert Audit Trail
          </h1>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <Download className="h-3.5 w-3.5" />
            {exporting ? "Downloading…" : "Export (.xlsx)"}
          </button>
        </div>
        <p className="mb-6 text-sm text-slate-500">
          Every time a reviewer has sent a property mutation or shop agreement request back to the operator for correction.
        </p>

        <div className="mb-5 flex gap-2">
          {(["all", "property_mutation", "shop_agreement"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold ${
                filter === f ? "bg-nnm-blue text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-100"
              }`}
            >
              {f === "all" ? "All" : ENTRY_TYPE_LABELS[f]}
            </button>
          ))}
        </div>

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {!events ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">No revert events here.</div>
        ) : (
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {filtered.map((e) => (
              <div key={e.id} className="p-4">
                <div className="mb-1 flex items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">{ENTRY_TYPE_LABELS[e.entry_type]}</span>
                  <span className="font-mono text-sm font-semibold text-slate-900">{e.reference_no}</span>
                  {e.resubmitted_at ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-green-700">
                      <CheckCircle2 className="h-3 w-3" />
                      Resubmitted
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-700">
                      <Clock className="h-3 w-3" />
                      Awaiting correction
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  Originally submitted by {e.originally_requested_by}; reverted by {e.reverted_by} (
                  {ADMIN_ROLE_LABELS[e.reverted_from_stage as AdminRole] ?? e.reverted_from_stage}) on {new Date(e.reverted_at).toLocaleDateString("en-IN")}
                  {e.resubmitted_at ? `, resubmitted ${new Date(e.resubmitted_at).toLocaleDateString("en-IN")}` : ""}
                </p>
                <p className="mt-1 text-sm text-slate-700">&ldquo;{e.comment}&rdquo;</p>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
