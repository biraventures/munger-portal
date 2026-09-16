"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, ClipboardCheck, Search } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { fetchShopsList, type ShopListEntry } from "@/lib/shop-api";
import { createShopInspection, fetchShopInspections, SHOP_IRREGULARITY_OPTIONS, type ShopInspection } from "@/lib/admin-shop-api";

const INSPECTION_ROLES = ["city_manager", "deputy_commissioner"];

export default function ShopInspectionPage() {
  const admin = useAdminGuard();
  const [shops, setShops] = useState<ShopListEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [inspecting, setInspecting] = useState<ShopListEntry | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [comments, setComments] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<ShopInspection | null>(null);
  const [history, setHistory] = useState<ShopInspection[] | null>(null);

  useEffect(() => {
    if (!admin) return;
    fetchShopsList()
      .then(setShops)
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Could not load shops."));
  }, [admin]);

  const filtered = useMemo(() => {
    if (!shops) return null;
    const q = search.trim().toLowerCase();
    if (!q) return shops;
    return shops.filter((s) => (s.holderName ?? "").toLowerCase().includes(q) || (s.marketName ?? "").toLowerCase().includes(q) || s.shopNo.toLowerCase().includes(q));
  }, [shops, search]);

  function openInspection(shop: ShopListEntry) {
    setInspecting(shop);
    setSelected(new Set());
    setComments("");
    setSubmitError(null);
    setSubmitted(null);
    setHistory(null);
    fetchShopInspections(shop.shopNo)
      .then(setHistory)
      .catch(() => setHistory(null));
  }

  function toggleIrregularity(option: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(option)) next.delete(option);
      else next.add(option);
      return next;
    });
  }

  async function handleSubmit() {
    if (!inspecting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await createShopInspection(inspecting.shopNo, Array.from(selected), comments.trim() || null);
      setSubmitted(result);
      setHistory((prev) => [result, ...(prev ?? [])]);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not record this inspection.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!admin) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  if (!INSPECTION_ROLES.includes(admin.role)) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <main className="mx-auto max-w-2xl px-6 py-10">
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Shop inspection is restricted to the City Manager and the Deputy Municipal Commissioner.
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />

      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <ClipboardCheck className="h-6 w-6" />
          Shop Inspection
        </h1>
        <p className="mb-6 text-sm text-slate-500">Search for a shop by holder name or market, then start an inspection.</p>

        {loadError && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {loadError}
          </div>
        )}

        {!inspecting ? (
          <>
            <div className="mb-5 flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2.5">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by holder name, market, or shop number"
                className="flex-1 text-sm outline-none"
                autoFocus
              />
            </div>

            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
              {!filtered ? (
                <p className="p-4 text-sm text-slate-400">Loading shops…</p>
              ) : filtered.length === 0 ? (
                <p className="p-4 text-sm text-slate-400">No matching shops.</p>
              ) : (
                filtered.slice(0, 50).map((s) => (
                  <div key={s.shopNo} className="flex items-center justify-between p-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        {s.shopNo} {s.marketName ? `- ${s.marketName}` : ""}
                      </p>
                      <p className="text-xs text-slate-500">
                        {s.holderName ?? "Vacant"} - {s.location}
                      </p>
                    </div>
                    <button
                      onClick={() => openInspection(s)}
                      className="rounded-md bg-nnm-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-nnm-blue-dark"
                    >
                      Start Inspection
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  {inspecting.shopNo} {inspecting.marketName ? `- ${inspecting.marketName}` : ""}
                </h2>
                <p className="text-xs text-slate-500">
                  {inspecting.holderName ?? "Vacant"} - {inspecting.location}
                </p>
              </div>
              <button onClick={() => setInspecting(null)} className="text-xs font-semibold text-slate-500 hover:underline">
                Back to search
              </button>
            </div>

            {submitted && (
              <div role="status" className="mb-5 flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Inspection recorded.
              </div>
            )}

            <div className="mb-5">
              <p className="mb-2 text-xs font-medium text-slate-600">Irregularities found (select all that apply - leave blank if none)</p>
              <div className="space-y-2">
                {SHOP_IRREGULARITY_OPTIONS.map((option) => (
                  <label key={option} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={selected.has(option)} onChange={() => toggleIrregularity(option)} className="h-4 w-4 rounded border-slate-300" />
                    {option}
                  </label>
                ))}
              </div>
            </div>

            <div className="mb-5">
              <label className="mb-1 block text-xs font-medium text-slate-600">Comments</label>
              <textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                rows={4}
                placeholder="(optional)"
                className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1"
              />
            </div>

            {submitError && (
              <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {submitError}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full rounded-md bg-nnm-blue px-4 py-3 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
            >
              {submitting ? "Recording…" : "Record Inspection"}
            </button>

            {history && history.length > 0 && (
              <div className="mt-8 border-t border-slate-200 pt-5">
                <p className="mb-3 text-xs font-semibold text-slate-600">Past inspections for this shop</p>
                <div className="space-y-3">
                  {history.map((h) => (
                    <div key={h.id} className="rounded-md border border-slate-200 p-3 text-xs">
                      <p className="font-semibold text-slate-700">
                        {new Date(h.inspected_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} - {h.inspected_by}
                      </p>
                      {h.irregularities.length > 0 ? (
                        <p className="mt-1 text-red-700">{h.irregularities.join(", ")}</p>
                      ) : (
                        <p className="mt-1 text-green-700">No irregularities found</p>
                      )}
                      {h.comments && <p className="mt-1 text-slate-500">{h.comments}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
