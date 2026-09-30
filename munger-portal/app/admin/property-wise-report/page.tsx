"use client";

import { useState } from "react";
import { AlertCircle, Loader2, Search, Home } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { searchProperties, type PropertySearchHit } from "@/lib/admin-property-api";

const ALLOWED_ROLES = ["commissioner", "deputy_commissioner", "city_manager"];

export default function PropertyWiseReportPage() {
  const admin = useAdminGuard();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PropertySearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      <main className="mx-auto max-w-4xl px-6 py-10">
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
      </main>
    </div>
  );
}
