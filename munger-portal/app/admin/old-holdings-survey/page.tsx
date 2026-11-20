"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ChevronLeft, ChevronRight, ClipboardList, Loader2, Search } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { ADMIN_ROLE_LABELS, type AdminRole } from "@/lib/admin-auth";
import { fetchOldHoldings, type OldHoldingRow } from "@/lib/collector-field-api";

type Show = "open" | "mine" | "all";
const TABS: { value: Show; label: string }[] = [
  { value: "open", label: "To enter" },
  { value: "mine", label: "My entries" },
  { value: "all", label: "All" },
];

/** Where one old holding stands, and what the collector can do with it. */
function Standing({ h }: { h: OldHoldingRow }) {
  if (h.entry_status === "reverted") {
    return h.entry_is_mine ? (
      <div className="text-right">
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Sent back to you</span>
        <Link
          href={`/admin/report-property-discrepancy/resubmit/${h.entry_id}`}
          className="mt-2 block rounded-md bg-nnm-blue px-3 py-1.5 text-center text-xs font-semibold text-white hover:bg-nnm-blue-dark"
        >
          Correct and resubmit
        </Link>
      </div>
    ) : (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Being corrected by {h.entry_by}</span>
    );
  }
  if (h.entry_status === "pending") {
    return (
      <div className="text-right">
        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">
          With {ADMIN_ROLE_LABELS[h.entry_stage as AdminRole] ?? h.entry_stage}
        </span>
        <p className="mt-1 text-xs text-slate-400">Entered by {h.entry_is_mine ? "you" : h.entry_by}</p>
      </div>
    );
  }
  if (h.survey_status === "finalized")
    return <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">Surveyed</span>;
  if (h.survey_status !== "pending_assignment") {
    return (
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
        Assigned to {h.assigned_to_tax_surveyor_display_name || h.assigned_to_tax_daroga_display_name || "an officer"}
      </span>
    );
  }
  return (
    <Link
      href={`/admin/report-property-discrepancy?holding=${encodeURIComponent(h.holding_no)}`}
      className="rounded-md bg-nnm-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-nnm-blue-dark"
    >
      Enter details
    </Link>
  );
}

export default function OldHoldingsSurveyPage() {
  const admin = useAdminGuard();
  const [show, setShow] = useState<Show>("open");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [ward, setWard] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchOldHoldings>> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchOldHoldings({ q: query, ward, show, page }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the old holdings.");
    } finally {
      setLoading(false);
    }
  }, [query, ward, show, page]);

  useEffect(() => {
    if (admin?.role === "tax_collector") load();
  }, [admin, load]);

  if (!admin) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const runSearch = () => {
    setPage(1);
    setQuery(q);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <ClipboardList className="h-6 w-6" />
          Old Holdings Survey
        </h1>
        <p className="mb-5 text-sm text-slate-500">
          Old-record (MUNG-MIG) holdings of your wards. Find the house by old holding number or owner name, visit it and enter its full
          details. Your entry is checked by the Tax Surveyor of the ward, then the Tax Daroga, City Manager, Deputy Municipal Commissioner
          and Municipal Commissioner. On final approval it becomes a regular holding with a new number.
        </p>

        {admin.role !== "tax_collector" ? (
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            This page is for Tax Collectors.
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap gap-2">
              {TABS.map((t) => (
                <button
                  key={t.value}
                  onClick={() => {
                    setShow(t.value);
                    setPage(1);
                  }}
                  className={`rounded-md px-3 py-1.5 text-sm font-semibold ${show === t.value ? "bg-nnm-blue text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-100"}`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3">
              <div className="min-w-56 flex-1">
                <label htmlFor="old-q" className="mb-1 block text-xs font-medium text-slate-500">
                  Old holding no. / old PID / owner name
                </label>
                <input
                  id="old-q"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && runSearch()}
                  placeholder="e.g. 245 or Ram Prasad"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="old-ward" className="mb-1 block text-xs font-medium text-slate-500">
                  Ward
                </label>
                <select
                  id="old-ward"
                  value={ward}
                  onChange={(e) => {
                    setWard(e.target.value);
                    setPage(1);
                  }}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">All my wards</option>
                  {(data?.wards ?? []).map((w) => (
                    <option key={w} value={w}>
                      Ward {w}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={runSearch}
                className="inline-flex items-center gap-1.5 rounded-md bg-nnm-blue px-4 py-2 text-sm font-semibold text-white hover:bg-nnm-blue-dark"
              >
                <Search className="h-4 w-4" />
                Search
              </button>
              {query && (
                <button
                  onClick={() => {
                    setQ("");
                    setQuery("");
                    setPage(1);
                  }}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-600"
                >
                  Clear
                </button>
              )}
            </div>

            {error && (
              <div
                role="alert"
                className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            {data && data.wards.length === 0 ? (
              <p className="text-sm text-slate-500">No ward is assigned to you yet - ask the Tax Daroga to assign your wards.</p>
            ) : !data ? (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : (
              <>
                <p className="mb-2 text-xs text-slate-500">
                  {data.total.toLocaleString("en-IN")} holding{data.total === 1 ? "" : "s"}
                  {loading && " · loading…"}
                </p>
                {data.holdings.length === 0 ? (
                  <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-400">Nothing found.</p>
                ) : (
                  <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                    {data.holdings.map((h) => (
                      <li key={h.holding_no} className="flex flex-wrap items-start justify-between gap-3 p-4">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-900">
                            {h.owner_name}
                            {h.relation_name && (
                              <span className="font-normal text-slate-500">
                                {" "}
                                {h.relation_type ? `${h.relation_type} ` : ""}
                                {h.relation_name}
                              </span>
                            )}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-600">
                            Ward {h.ward ?? "-"} · Old holding <b>{h.old_holding_no || "-"}</b>
                            {h.old_pid ? ` · Old PID ${h.old_pid}` : ""} · <span className="font-mono">{h.holding_no}</span>
                          </p>
                          {h.address && <p className="mt-0.5 text-xs text-slate-500">{h.address}</p>}
                          {(h.old_last_payment_year || h.old_tax_status) && (
                            <p className="mt-0.5 text-xs text-slate-400">
                              {h.old_last_payment_year ? `Last paid ${h.old_last_payment_year}` : ""}
                              {h.old_last_payment_year && h.old_tax_status ? " · " : ""}
                              {h.old_tax_status ?? ""}
                            </p>
                          )}
                          {h.entry_status === "reverted" && h.entry_is_mine && h.entry_revert_comment && (
                            <p className="mt-1 text-xs text-amber-700">Comment: {h.entry_revert_comment}</p>
                          )}
                        </div>
                        <Standing h={h} />
                      </li>
                    ))}
                  </ul>
                )}
                {pages > 1 && (
                  <div className="mt-4 flex items-center justify-center gap-3 text-sm">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1 || loading}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 disabled:opacity-40"
                    >
                      <ChevronLeft className="h-4 w-4" /> Previous
                    </button>
                    <span className="text-slate-500">
                      Page {page} of {pages}
                    </span>
                    <button
                      onClick={() => setPage((p) => Math.min(pages, p + 1))}
                      disabled={page >= pages || loading}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 disabled:opacity-40"
                    >
                      Next <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
