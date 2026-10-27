"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, Building2, Loader2, Search } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { BP_VIEW_ROLES, fetchOfficeList, rupees, type OfficeListItem } from "@/lib/building-permit-api";


const FILTERS: { key: string; label: string }[] = [
  { key: "open", label: "In process" },
  { key: "submitted", label: "Site verification" },
  { key: "scrutiny", label: "Technical scrutiny" },
  { key: "awaiting_payment", label: "Fee due" },
  { key: "processing", label: "File processing" },
  { key: "authority", label: "Competent authority" },
  { key: "sanctioned", label: "Approval to issue" },
  { key: "returned", label: "Returned" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "", label: "All" },
];
const OPEN = ["submitted", "scrutiny", "awaiting_payment", "processing", "authority", "sanctioned"];

export default function BuildingPermitListPage() {
  const admin = useAdminGuard();
  const [filter, setFilter] = useState("open");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<OfficeListItem[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!admin || !BP_VIEW_ROLES.includes(admin.role)) return;
    setRows(null);
    fetchOfficeList(filter, query)
      .then((r) => {
        setRows(r.applications);
        setCounts(r.counts);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [admin, filter, query]);

  if (!admin) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  if (!BP_VIEW_ROLES.includes(admin.role)) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <p className="mx-auto mt-10 max-w-xl rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">Not available for your login.</p>
      </div>
    );
  }
  const count = (k: string) => (k === "open" ? OPEN.reduce((t, s) => t + (counts[s] ?? 0), 0) : k === "" ? Object.values(counts).reduce((t, n) => t + n, 0) : counts[k] ?? 0);

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <Building2 className="h-6 w-6" /> Building Plan Permits
        </h1>
        <p className="mb-5 text-sm text-slate-500">
          {admin.role === "map_section_nodal_clerk" ? "Open an application to record the next stage." : "View only - the Map Section Nodal Clerk processes these applications."}
        </p>
        <div className="mb-4 flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${filter === f.key ? "bg-nnm-blue text-white" : "border border-slate-300 bg-white text-slate-700"}`}
            >
              {f.label} ({count(f.key)})
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(q.trim());
          }}
          className="mb-4 flex gap-2"
        >
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Application no., name, mobile or khesra" aria-label="Search" className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <button className="inline-flex items-center gap-1.5 rounded-md bg-nnm-blue px-4 py-2 text-sm font-semibold text-white">
            <Search className="h-4 w-4" /> Search
          </button>
        </form>
        {error && (
          <p role="alert" className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4" /> {error}
          </p>
        )}
        {!rows ? (
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        ) : rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">No applications here.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2">Application</th>
                  <th className="px-3 py-2">Applicant</th>
                  <th className="px-3 py-2">Ward</th>
                  <th className="px-3 py-2 text-right">Built-up (sq m)</th>
                  <th className="px-3 py-2 text-right">Fee</th>
                  <th className="px-3 py-2">Stage</th>
                  <th className="px-3 py-2">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <Link href={`/admin/building-permits/${r.id}`} className="font-semibold text-nnm-blue hover:underline">
                        {r.applicationNo}
                      </Link>
                      {r.permitNo && <span className="block text-xs text-green-700">{r.permitNo}</span>}
                    </td>
                    <td className="px-3 py-2">
                      {r.applicantName}
                      <span className="block text-xs text-slate-500">{r.mobile}</span>
                    </td>
                    <td className="px-3 py-2">{r.ward}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.builtUpSqm.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{rupees(r.feeTotal)}</td>
                    <td className="px-3 py-2 text-xs">{r.statusLabel}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{r.submittedAt ? new Date(r.submittedAt).toLocaleDateString("en-IN") : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
