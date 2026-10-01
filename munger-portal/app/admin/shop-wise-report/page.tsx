"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Loader2, Search, Store } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { fetchAllShopsForAdmin, type ShopSummaryForAllotment } from "@/lib/admin-shop-api";

const ALLOWED_ROLES = ["commissioner", "city_manager"];

export default function ShopWiseReportPage() {
  const admin = useAdminGuard();
  const [shops, setShops] = useState<ShopSummaryForAllotment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [market, setMarket] = useState("");

  useEffect(() => {
    if (!admin || !ALLOWED_ROLES.includes(admin.role)) return;
    fetchAllShopsForAdmin()
      .then(setShops)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load shops."));
  }, [admin]);

  const markets = useMemo(() => {
    if (!shops) return [];
    const names = new Set<string>();
    for (const s of shops) if (s.market_name) names.add(s.market_name);
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [shops]);

  const filtered = useMemo(() => {
    if (!shops) return null;
    const q = search.trim().toLowerCase();
    return shops.filter((s) => {
      if (market && s.market_name !== market) return false;
      if (!q) return true;
      return s.shop_no.toLowerCase().includes(q) || (s.market_name ?? "").toLowerCase().includes(q) || (s.location ?? "").toLowerCase().includes(q);
    });
  }, [shops, search, market]);

  function openShop(shopNo: string) {
    // Opens in its own window/tab, as asked - the report is meant to be
    // reviewed alongside the list, not replace it. No noopener/
    // noreferrer here on purpose - this is an internal, same-origin
    // route, and the admin login token lives in sessionStorage (see
    // admin-auth.ts), which only gets copied into a new tab when the
    // browser keeps an opener relationship to it. noopener breaks
    // that relationship, so the new tab opened with an empty
    // sessionStorage and useAdminGuard bounced it straight to login.
    window.open(`/admin/shop-wise-report/${encodeURIComponent(shopNo)}`, "_blank");
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
            The shop-wise report is restricted to the Municipal Commissioner and City Manager.
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />

      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <Store className="h-6 w-6" />
          Shop-wise Report
        </h1>
        <p className="mb-6 text-sm text-slate-500">
          Every shop, filterable by market. Click a shop to open its full report - details, agreement history, and
          change log - in a new window, where you can also flag something for Stall Prabhari.
        </p>

        <div className="mb-5 flex flex-col gap-3 sm:flex-row">
          <div className="flex flex-1 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2.5">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by shop number, market, or location"
              className="w-full text-sm outline-none"
            />
          </div>
          <select
            value={market}
            onChange={(e) => setMarket(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1 sm:w-64"
          >
            <option value="">All markets</option>
            {markets.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {!shops ? (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : filtered && filtered.length === 0 ? (
          <p className="text-sm text-slate-400">No shops match.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Shop No</th>
                  <th className="px-4 py-3 font-medium">Market</th>
                  <th className="px-4 py-3 font-medium">Location</th>
                  <th className="px-4 py-3 font-medium">Area (sqft)</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered?.map((s) => (
                  <tr key={s.shop_no} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs">{s.shop_no}</td>
                    <td className="px-4 py-3">{s.market_name ?? "-"}</td>
                    <td className="px-4 py-3">{s.location}</td>
                    <td className="px-4 py-3">{s.area_sqft ?? "-"}</td>
                    <td className="px-4 py-3 text-xs capitalize text-slate-500">{s.status}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openShop(s.shop_no)}
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
        )}
      </main>
    </div>
  );
}
