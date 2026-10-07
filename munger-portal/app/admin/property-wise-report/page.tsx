"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowUpDown, ChevronLeft, ChevronRight, Loader2, Search, Home } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { searchProperties, type PropertySearchHit } from "@/lib/admin-property-api";
import {
  fetchDashboardHoldingsAdmin,
  fetchHoldingWardsAdmin,
  type HoldingListItem,
  type HoldingSortKey,
  type SortDirection,
} from "@/lib/admin-api";

const ALLOWED_ROLES = ["commissioner", "deputy_commissioner", "city_manager"];

const PAGE_SIZE_OPTIONS = [25, 50, 100];

function fmtMoney(v: string | number | null): string {
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (n === null || n === undefined || Number.isNaN(n)) return "-";
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function fmtArea(v: string | number | null): string {
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (n === null || n === undefined || Number.isNaN(n)) return "-";
  return `${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })} sqft`;
}

export default function PropertyWiseReportPage() {
  const admin = useAdminGuard();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PropertySearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Full holding listing - ward-filterable, sortable - below the
  // search box above. Distinct from search: this is for browsing the
  // whole roster (or one ward's worth of it), not finding one holding.
  const [wards, setWards] = useState<string[]>([]);
  const [wardFilter, setWardFilter] = useState("");
  const [sortKey, setSortKey] = useState<HoldingSortKey>("holdingNo");
  const [sortDir, setSortDir] = useState<SortDirection>("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [listing, setListing] = useState<{ items: HoldingListItem[]; total: number } | null>(null);
  const [listingLoading, setListingLoading] = useState(true);
  const [listingError, setListingError] = useState<string | null>(null);

  const allowed = admin !== null && ALLOWED_ROLES.includes(admin.role);

  useEffect(() => {
    if (!allowed) return;
    fetchHoldingWardsAdmin().then(setWards).catch(() => setWards([]));
  }, [allowed]);

  useEffect(() => {
    if (!allowed) return;
    setListingLoading(true);
    setListingError(null);
    fetchDashboardHoldingsAdmin(page, pageSize, wardFilter || undefined, sortKey, sortDir)
      .then(setListing)
      .catch((err) => setListingError(err instanceof Error ? err.message : "Could not load the holdings list."))
      .finally(() => setListingLoading(false));
  }, [allowed, page, pageSize, wardFilter, sortKey, sortDir]);

  const totalPages = useMemo(() => (listing ? Math.max(1, Math.ceil(listing.total / pageSize)) : 1), [listing, pageSize]);

  function toggleSort(key: HoldingSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  }

  async function handleSearch() {
    if (query.trim().length < 2) {
      setError("Enter at least 2 characters to search.");
      return;
    }
    setSearching(true);
    setError(null);
    try {
      setResults(await searchProperties(query.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not search properties.");
    } finally {
      setSearching(false);
    }
  }

  function openHolding(holdingNo: string) {
    // No noopener/noreferrer here on purpose - this is an internal,
    // same-origin route, and the admin login token lives in
    // sessionStorage (see admin-auth.ts), which only gets copied into
    // a new tab when the browser keeps an opener relationship to it.
    // noopener breaks that relationship, so the new tab opened with
    // an empty sessionStorage and useAdminGuard bounced it straight
    // to the login page.
    window.open(`/admin/property-wise-report/${encodeURIComponent(holdingNo)}`, "_blank");
  }

  if (!admin) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  if (!ALLOWED_ROLES.includes(admin.role)) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <main className="mx-auto max-w-2xl px-6 py-10">
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            The property-wise report is restricted to the Municipal Commissioner, Deputy Municipal Commissioner, and City Manager.
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />

      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <Home className="h-6 w-6" />
          Property-wise Report
        </h1>
        <p className="mb-6 text-sm text-slate-500">
          Search a holding by number, owner name, or address. Opening one shows its full details, tax pending,
          change log, discrepancy and re-survey flags, and surveyor field visits - in a new window.
        </p>

        <div className="mb-5 flex gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2.5">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Holding number, owner name, or address"
              className="w-full text-sm outline-none"
              autoFocus
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={searching}
            className="rounded-md bg-nnm-blue px-5 py-2.5 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
          >
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
          </button>
        </div>

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {results && (
          results.length === 0 ? (
            <p className="text-sm text-slate-400">No properties match.</p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">Holding No</th>
                    <th className="px-4 py-3 font-medium">Owner</th>
                    <th className="px-4 py-3 font-medium">Address</th>
                    <th className="px-4 py-3 font-medium">Ward</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((p) => (
                    <tr key={p.holding_no} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs">{p.holding_no}</td>
                      <td className="px-4 py-3">{p.owner_name}</td>
                      <td className="px-4 py-3">{p.address}</td>
                      <td className="px-4 py-3">{p.ward ?? "-"}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => openHolding(p.holding_no)}
                          className="rounded-md border border-nnm-blue px-3 py-1.5 text-xs font-semibold text-nnm-blue hover:bg-blue-50"
                        >
                          Open Report
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        <h2 className="mb-1 mt-10 text-lg font-semibold text-slate-800">Full Holdings List</h2>
        <p className="mb-4 text-sm text-slate-500">
          Every holding, ward-filterable and sortable. Click a column to sort by it; click it again to reverse the order.
        </p>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-xs font-medium text-slate-500">Ward</span>
            <select
              value={wardFilter}
              onChange={(e) => {
                setWardFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs"
            >
              <option value="">All wards</option>
              {wards.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            Show
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="rounded-md border border-slate-300 px-2 py-1.5"
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            per page
          </div>
        </div>

        {listingError && (
          <div role="alert" className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {listingError}
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">
                  <button onClick={() => toggleSort("holdingNo")} className="inline-flex items-center gap-1 hover:text-slate-700">
                    Holding No <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-4 py-3 font-medium">Old Holding No</th>
                <th className="px-4 py-3 font-medium">Owner</th>
                <th className="px-4 py-3 font-medium">
                  <button onClick={() => toggleSort("ward")} className="inline-flex items-center gap-1 hover:text-slate-700">
                    Ward <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-4 py-3 font-medium">
                  <button onClick={() => toggleSort("plotArea")} className="inline-flex items-center gap-1 hover:text-slate-700">
                    Total Plot Area <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-4 py-3 font-medium">
                  <button onClick={() => toggleSort("taxPaidTillYear")} className="inline-flex items-center gap-1 hover:text-slate-700">
                    Tax Paid Till Year <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-4 py-3 font-medium">
                  <button onClick={() => toggleSort("taxAmount")} className="inline-flex items-center gap-1 hover:text-slate-700">
                    Annual Tax <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-4 py-3 font-medium">Solid Waste Charge</th>
                <th className="px-4 py-3 font-medium">
                  <button onClick={() => toggleSort("totalAmount")} className="inline-flex items-center gap-1 hover:text-slate-700">
                    Total Amount Due <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {listingLoading ? (
                <tr>
                  <td colSpan={10} className="p-6 text-center text-slate-400">
                    <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                  </td>
                </tr>
              ) : !listing || listing.items.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-6 text-center text-slate-400">
                    No holdings found.
                  </td>
                </tr>
              ) : (
                listing.items.map((h) => (
                  <tr key={h.holdingNo} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs">{h.holdingNo}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{h.oldHoldingNo ?? "-"}</td>
                    <td className="px-4 py-3">{h.ownerName}</td>
                    <td className="px-4 py-3">{h.ward ?? "-"}</td>
                    <td className="px-4 py-3">{fmtArea(h.totalPlotArea)}</td>
                    <td className="px-4 py-3">{h.taxPaidTillYear ?? "-"}</td>
                    <td className="px-4 py-3">{fmtMoney(h.annualTaxAmount)}</td>
                    <td className="px-4 py-3">{fmtMoney(h.solidWasteChargeAmount)}</td>
                    <td className="px-4 py-3">{fmtMoney(h.totalAmountDue)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openHolding(h.holdingNo)}
                        className="rounded-md border border-nnm-blue px-3 py-1.5 text-xs font-semibold text-nnm-blue hover:bg-blue-50"
                      >
                        Open Report
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {listing && listing.total > 0 && (
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
            <span>
              Page {page} of {totalPages} - {listing.total} holding{listing.total === 1 ? "" : "s"} total
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded border border-slate-300 p-1.5 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded border border-slate-300 p-1.5 disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
