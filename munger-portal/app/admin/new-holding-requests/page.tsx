"use client";

import { useEffect, useState } from "react";
import { AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { NewHoldingRequestPanel } from "@/components/admin/new-holding-request-panel";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { fetchFormOptions } from "@/lib/operator-api";
import { fetchStaffRequests, STATUS_LABEL, WARDS, type PendingCount, type StaffListItem } from "@/lib/new-holding-api";

const ALLOWED = ["tax_daroga", "tax_surveyor", "mutation_nodal_clerk", "deputy_commissioner", "commissioner", "city_manager"];
/** The status that is waiting for each role's action (the default filter for that login). */
const MY_STATUS: Record<string, string> = {
  tax_surveyor: "at_surveyor",
  deputy_commissioner: "at_dmc",
  commissioner: "at_commissioner",
};
const FILTERS = [
  { value: "submitted", label: "Received" },
  { value: "at_surveyor", label: "Field verification" },
  { value: "daroga_review", label: "Tax Daroga comments" },
  { value: "at_dmc", label: "With DMC" },
  { value: "at_commissioner", label: "With Commissioner" },
  { value: "returned", label: "Sent back to applicant" },
  { value: "created", label: "Holding created" },
  { value: "rejected", label: "Not accepted" },
  { value: "", label: "All" },
];
const STATUS_CLASS: Record<string, string> = {
  submitted: "bg-blue-100 text-blue-800",
  at_surveyor: "bg-amber-100 text-amber-800",
  daroga_review: "bg-blue-100 text-blue-800",
  at_dmc: "bg-indigo-100 text-indigo-800",
  at_commissioner: "bg-purple-100 text-purple-800",
  returned: "bg-orange-100 text-orange-800",
  created: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

function daysSince(v: string): number {
  return Math.floor((Date.now() - new Date(v).getTime()) / 86_400_000);
}

export default function NewHoldingRequestsPage() {
  const admin = useAdminGuard();
  const [filter, setFilter] = useState<string | null>(null);
  const [ward, setWard] = useState("");
  const [rows, setRows] = useState<StaffListItem[] | null>(null);
  const [pending, setPending] = useState<PendingCount | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [usageTypes, setUsageTypes] = useState<string[]>([]);
  const [swTypes, setSwTypes] = useState<string[]>([]);

  function load() {
    if (filter === null) return;
    setRows(null);
    fetchStaffRequests(filter || undefined, ward || undefined)
      .then((r) => {
        setRows(r.requests);
        setPending(r.pending);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the requests."));
  }

  useEffect(() => {
    if (admin && filter === null) setFilter(MY_STATUS[admin.role] ?? "submitted");
  }, [admin, filter]);

  useEffect(() => {
    if (!admin || !ALLOWED.includes(admin.role)) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, filter, ward]);

  useEffect(() => {
    fetchFormOptions()
      .then((o) => {
        setUsageTypes(o.usageTypes);
        setSwTypes(o.solidWasteChargeTypes);
      })
      .catch(() => undefined);
  }, []);

  if (!admin) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  if (!ALLOWED.includes(admin.role)) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <p className="p-10 text-sm text-slate-500">This page is for the holding tax desks (Tax Daroga, Tax Surveyor, DMC, Commissioner).</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">New Holding Requests</h1>
        <p className="mb-5 text-sm text-slate-500">
          Requests from the public for properties never assessed. <b>Tax Daroga</b> checks that no holding exists (possible matches are listed), enters the
          property in the offline demand register and gives its old holding number, choosing a <b>Tax Surveyor</b> → field report → <b>Tax Daroga</b>&apos;s
          comments → <b>DMC</b> → <b>Commissioner</b>, whose approval creates the holding with the next MMC- number. Until the Tax Daroga acts, the applicant can
          still correct the request.
        </p>

        {pending && (
          <div className="mb-5 grid grid-cols-2 gap-3 text-center sm:grid-cols-5">
            {[
              { n: pending.tax_daroga, l: "Tax Daroga" },
              { n: pending.tax_surveyor, l: "Tax Surveyor" },
              { n: pending.deputy_commissioner, l: "DMC" },
              { n: pending.commissioner, l: "Commissioner" },
              { n: pending.applicant, l: "With applicant" },
            ].map((x) => (
              <div key={x.l} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="text-2xl font-semibold text-slate-900">{x.n}</div>
                <div className="text-xs text-slate-500">{x.l}</div>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div role="alert" className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {notice && <div className="mb-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm font-medium text-green-800">{notice}</div>}

        <div className="mb-4 flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.label}
              onClick={() => setFilter(f.value)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${filter === f.value ? "bg-nnm-blue text-white" : "border border-slate-300 bg-white text-slate-700"}`}
            >
              {f.label}
            </button>
          ))}
          <select value={ward} onChange={(e) => setWard(e.target.value)} className="ml-auto rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm">
            <option value="">All wards</option>
            {WARDS.map((w) => (
              <option key={w} value={w}>
                Ward {w}
              </option>
            ))}
          </select>
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
                  <span className="text-slate-700">{a.owner_name}</span>
                  <span className="text-slate-500">
                    Ward {a.ward} · {Number(a.plot_area_sqft).toLocaleString("en-IN")} sq ft · {a.floor_count} floor{a.floor_count === 1 ? "" : "s"}
                  </span>
                  {a.stage_since && !["created", "rejected"].includes(a.status) && <span className="text-xs text-slate-400">{daysSince(a.stage_since)} d at this desk</span>}
                  {a.new_holding_no && <span className="font-mono text-xs font-semibold text-green-700">{a.new_holding_no}</span>}
                  <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_CLASS[a.status] ?? "bg-slate-100"}`}>{STATUS_LABEL[a.status] ?? a.status}</span>
                  {open === a.id ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                </button>
                {open === a.id && (
                  <div className="border-t border-slate-100 p-4">
                    <NewHoldingRequestPanel requestId={a.id} role={admin.role} usageTypes={usageTypes} solidWasteTypes={swTypes} onChanged={(m) => {
                        if (m) setNotice(m);
                        load();
                      }} />
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
