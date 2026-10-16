"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { MutationApplicationPanel } from "@/components/admin/mutation-application-panel";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { fetchStaffApplications, linkApplication, rejectStaffApplication, TRANSFER_BASIS, type StaffApplicationListItem } from "@/lib/mutation-api";

const ALLOWED = ["tax_daroga", "mutation_nodal_clerk", "deputy_commissioner", "commissioner", "city_manager"];
const FILTERS = [
  { value: "awaiting_holding", label: "Holding to be identified" },
  { value: "in_chain", label: "In the mutation chain" },
  { value: "rejected", label: "Not accepted" },
  { value: "", label: "All" },
];
const STAGE: Record<string, string> = {
  tax_daroga: "Tax Daroga",
  mutation_nodal_clerk: "Mutation Nodal Clerk",
  deputy_commissioner: "DMC",
  commissioner: "Commissioner",
};

function progress(a: StaffApplicationListItem): string {
  if (a.status === "awaiting_holding") return "Holding to be identified";
  if (a.status === "rejected") return "Not accepted";
  if (a.change_request_status === "pending") return `With ${STAGE[a.current_stage ?? ""] ?? a.current_stage}`;
  if (a.change_request_status === "reverted") return "Sent back to operator";
  return a.change_request_status ? a.change_request_status.charAt(0).toUpperCase() + a.change_request_status.slice(1) : "-";
}

export default function MutationApplicationsPage() {
  const admin = useAdminGuard();
  const [filter, setFilter] = useState("awaiting_holding");
  const [rows, setRows] = useState<StaffApplicationListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [holdingNo, setHoldingNo] = useState("");
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    setRows(null);
    fetchStaffApplications(filter || undefined)
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load applications."));
  }

  useEffect(() => {
    if (!admin || !ALLOWED.includes(admin.role)) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, filter]);

  if (!admin) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  if (!ALLOWED.includes(admin.role)) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <p className="p-10 text-sm text-slate-500">This page is for the mutation desk.</p>
      </div>
    );
  }
  const isDaroga = admin.role === "tax_daroga";

  async function act(id: string, kind: "link" | "reject") {
    setBusy(true);
    setError(null);
    try {
      if (kind === "link") await linkApplication(id, holdingNo.trim());
      else await rejectStaffApplication(id, remarks.trim());
      setOpen(null);
      setHoldingNo("");
      setRemarks("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">Online Mutation Applications</h1>
        <p className="mb-6 text-sm text-slate-500">
          Applications from the public window. One with a verified holding number goes straight to the Tax Daroga&apos;s Mutation Approvals
          desk. One entered with the old holding number waits here for the Tax Daroga to identify the holding (it then joins the chain), or
          to turn it down with a reason.
        </p>

        {error && (
          <div role="alert" className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="mb-4 flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.label}
              onClick={() => setFilter(f.value)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${filter === f.value ? "bg-nnm-blue text-white" : "border border-slate-300 bg-white text-slate-700"}`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {!rows ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Nothing here.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((a) => (
              <div key={a.id} className="rounded-xl border border-slate-200 bg-white text-sm">
                <button onClick={() => setOpen(open === a.id ? null : a.id)} className="flex w-full flex-wrap items-center gap-3 p-3 text-left">
                  <span className="font-mono font-semibold text-slate-900">{a.application_no}</span>
                  <span className="text-slate-700">
                    {a.holding_no ? `Holding ${a.holding_no}` : `Old holding ${a.entered_old_holding_no}, ward ${a.entered_ward}`}
                  </span>
                  <span className="text-slate-500">
                    → {a.new_owner_name} · {TRANSFER_BASIS.find((b) => b.value === a.transfer_basis)?.label}
                  </span>
                  <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{progress(a)}</span>
                  {open === a.id ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                </button>
                {open === a.id && (
                  <div className="space-y-4 border-t border-slate-100 p-4">
                    <MutationApplicationPanel applicationId={a.id} />
                    {a.handling_remarks && <p className="text-xs text-slate-600">Remarks ({a.handled_by}): {a.handling_remarks}</p>}
                    {a.change_request_id && (
                      <Link href={`/admin/change-requests/${a.change_request_id}`} className="inline-block text-sm font-semibold text-nnm-blue hover:underline">
                        Open the mutation request #{a.change_request_id}
                      </Link>
                    )}
                    {isDaroga && a.status === "awaiting_holding" && (
                      <div className="grid grid-cols-1 gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <label className="block text-xs font-medium text-slate-600">Holding number of this property</label>
                          <div className="flex gap-2">
                            <input value={holdingNo} onChange={(e) => setHoldingNo(e.target.value)} maxLength={32} className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
                            <button
                              onClick={() => act(a.id, "link")}
                              disabled={busy || !holdingNo.trim()}
                              className="inline-flex items-center gap-1 rounded-md bg-nnm-blue px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                            >
                              {busy && <Loader2 className="h-3 w-3 animate-spin" />}
                              Link &amp; send into chain
                            </button>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="block text-xs font-medium text-slate-600">Or turn it down (reason is shown to the applicant)</label>
                          <div className="flex gap-2">
                            <input value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={500} className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
                            <button
                              onClick={() => act(a.id, "reject")}
                              disabled={busy || remarks.trim().length < 3}
                              className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-60"
                            >
                              Not accept
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
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
