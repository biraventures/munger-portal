"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, AlertTriangle, FilePlus2, Loader2, Plus, Search, Sparkles } from "lucide-react";
import { OperatorHeader } from "@/components/operator-header";
import { ShopAgreementForm } from "@/components/operator/shop-agreement-form";
import { ShopEditForm } from "@/components/operator/shop-edit-form";
import { ShopAgreementDocumentPanel } from "@/components/operator/shop-agreement-document-panel";
import { ShopRentEscalationPanel } from "@/components/operator/shop-rent-escalation-panel";
import { ShopRentalApplicationForm } from "@/components/operator/shop-rental-application-form";
import { ShopRentPaymentPanel } from "@/components/operator/shop-rent-payment-panel";
import { ShopViolationNotices } from "@/components/operator/shop-violation-notices";
import { ShopDocumentHistory } from "@/components/operator/shop-document-history";
import { ShopReceiptView } from "@/components/operator/shop-receipt-view";
import { ShopAgreementPermitView } from "@/components/operator/shop-agreement-permit-view";
import { useOperatorGuard } from "@/lib/use-operator-guard";
import {
  fetchShopByShopNo,
  createShop,
  fetchMarketList,
  fetchNextShopNumber,
  fetchPrintableAgreement,
  fetchShopsList,
  type ShopSearchResult,
  type ShopRentPaymentResult,
  type PrintableShopAgreement,
  type ShopListEntry,
} from "@/lib/shop-api";

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";
const labelClass = "mb-1.5 block text-sm font-medium text-slate-700";

type Mode =
  | { kind: "idle" }
  | { kind: "found"; result: ShopSearchResult }
  | { kind: "notFoundCreate"; shopNo: string }
  | { kind: "newAuto" };

export default function OperatorShopsPage() {
  const operator = useOperatorGuard();
  const [shopNoQuery, setShopNoQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [mode, setMode] = useState<Mode>({ kind: "idle" });
  const [shopList, setShopList] = useState<ShopListEntry[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [listFilter, setListFilter] = useState("");
  const [showAgreementForm, setShowAgreementForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showApplicationForm, setShowApplicationForm] = useState(false);
  const [receipt, setReceipt] = useState<ShopRentPaymentResult | null>(null);
  const [permit, setPermit] = useState<PrintableShopAgreement | null>(null);
  const [permitLoading, setPermitLoading] = useState(false);

  const [markets, setMarkets] = useState<string[] | null>(null);
  const [selectedMarket, setSelectedMarket] = useState("");
  const [customMarket, setCustomMarket] = useState("");
  const [previewShopNo, setPreviewShopNo] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [newLocation, setNewLocation] = useState("");
  const [newWard, setNewWard] = useState("");
  const [newAreaSqft, setNewAreaSqft] = useState("");
  const [newTotalAreaSqft, setNewTotalAreaSqft] = useState("");
  const [newBuiltUpAreaSqft, setNewBuiltUpAreaSqft] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (mode.kind === "newAuto" && markets === null) {
      fetchMarketList()
        .then(setMarkets)
        .catch(() => setMarkets([]));
    }
  }, [mode.kind, markets]);

  const effectiveMarket = selectedMarket === "__other__" ? customMarket.trim() : selectedMarket;

  useEffect(() => {
    if (mode.kind !== "newAuto" || !effectiveMarket) {
      setPreviewShopNo(null);
      return;
    }
    setPreviewLoading(true);
    fetchNextShopNumber(effectiveMarket)
      .then(setPreviewShopNo)
      .catch(() => setPreviewShopNo(null))
      .finally(() => setPreviewLoading(false));
  }, [mode.kind, effectiveMarket]);

  useEffect(() => {
    if (mode.kind !== "idle" || shopList !== null) return;
    fetchShopsList()
      .then(setShopList)
      .catch((err) => setListError(err instanceof Error ? err.message : "Could not load the shop list."));
  }, [mode.kind, shopList]);

  async function searchByShopNo(shopNo: string) {
    setSearching(true);
    setReceipt(null);
    setShowAgreementForm(false);
    setShowApplicationForm(false);
    try {
      const result = await fetchShopByShopNo(shopNo);
      if (result.found) {
        setMode({ kind: "found", result });
      } else {
        setMode({ kind: "notFoundCreate", shopNo });
      }
    } finally {
      setSearching(false);
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const shopNo = shopNoQuery.trim();
    if (!shopNo) return;
    await searchByShopNo(shopNo);
  }

  function startNewAuto() {
    setReceipt(null);
    setShowAgreementForm(false);
    setShowApplicationForm(false);
    setSelectedMarket("");
    setCustomMarket("");
    setPreviewShopNo(null);
    setNewLocation("");
    setNewWard("");
    setNewAreaSqft("");
    setCreateError(null);
    setMode({ kind: "newAuto" });
  }

  async function handleCreateShop(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);

    let shopNo: string;
    let marketName: string;
    if (mode.kind === "notFoundCreate") {
      shopNo = mode.shopNo;
      marketName = customMarket || "";
    } else if (mode.kind === "newAuto") {
      if (!effectiveMarket) {
        setCreateError("Select or enter a market first.");
        return;
      }
      if (!previewShopNo) {
        setCreateError("Waiting on the auto-generated shop number — try again in a moment.");
        return;
      }
      shopNo = previewShopNo;
      marketName = effectiveMarket;
    } else {
      return;
    }

    if (!newLocation.trim()) {
      setCreateError("Location is required.");
      return;
    }
    setCreating(true);
    try {
      await createShop({
        shopNo,
        marketName: marketName || null,
        location: newLocation,
        ward: newWard || null,
        areaSqft: newAreaSqft ? Number(newAreaSqft) : null,
        totalAreaSqft: newTotalAreaSqft ? Number(newTotalAreaSqft) : null,
        builtUpAreaSqft: newBuiltUpAreaSqft ? Number(newBuiltUpAreaSqft) : null,
      });
      const result = await fetchShopByShopNo(shopNo);
      setMode({ kind: "found", result });
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Could not create shop.");
    } finally {
      setCreating(false);
    }
  }

  if (!operator) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  const shopNo = mode.kind === "found" ? String(mode.result.shop?.shop_no ?? "") : "";

  async function handlePrintAgreement(agreementId: number) {
    setPermitLoading(true);
    try {
      const p = await fetchPrintableAgreement(agreementId);
      setPermit(p);
    } finally {
      setPermitLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="no-print">
        <OperatorHeader operator={operator} />
      </div>

      <main className={`mx-auto px-6 py-10 ${mode.kind === "idle" ? "max-w-6xl" : "max-w-3xl"}`}>
        {receipt ? (
          <ShopReceiptView receipt={receipt} onClose={() => setReceipt(null)} />
        ) : permit ? (
          <ShopAgreementPermitView permit={permit} onClose={() => setPermit(null)} />
        ) : (
          <>
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">Municipal Shop Rent</h1>
        <p className="mb-6 text-sm text-slate-500">
          Search an existing (or old, known) shop number below, or create a genuinely new shop with an auto-generated
          number.
        </p>

        <div className="mb-6 flex flex-col gap-3 sm:flex-row">
          <form onSubmit={handleSearch} className="flex flex-1 gap-2">
            <input
              value={shopNoQuery}
              onChange={(e) => setShopNoQuery(e.target.value)}
              placeholder="e.g. NNC-1 (existing/old shop number)"
              className={inputClass}
            />
            <button
              type="submit"
              disabled={searching}
              className="inline-flex shrink-0 items-center gap-2 rounded-md bg-nnm-blue px-5 py-2.5 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
            >
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Search
            </button>
          </form>
          <button
            onClick={startNewAuto}
            className="inline-flex shrink-0 items-center gap-2 rounded-md border border-nnm-blue px-5 py-2.5 text-sm font-semibold text-nnm-blue hover:bg-blue-50"
          >
            <Sparkles className="h-4 w-4" />
            New Shop (auto-number)
          </button>
          <Link
            href="/operator/shops/new-entry"
            className="inline-flex shrink-0 items-center gap-2 rounded-md bg-nnm-gold px-5 py-2.5 text-sm font-semibold text-[#20240a] hover:brightness-95"
          >
            <FilePlus2 className="h-4 w-4" />
            Full Entry (shop + tenant)
          </Link>
        </div>

        {mode.kind === "idle" && (
          <div>
            {listError && (
              <div role="alert" className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {listError}
              </div>
            )}
            {!shopList ? (
              <div className="flex items-center gap-2 py-8 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading shops…
              </div>
            ) : (
              <>
                <input
                  value={listFilter}
                  onChange={(e) => setListFilter(e.target.value)}
                  placeholder="Filter by shop no, market, or holder name"
                  className={`${inputClass} mb-4`}
                />
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                      <tr>
                        <th className="px-4 py-3 font-medium">Shop No</th>
                        <th className="px-4 py-3 font-medium">Market</th>
                        <th className="px-4 py-3 font-medium">Tenant</th>
                        <th className="px-4 py-3 font-medium">Rent Paid Till</th>
                        <th className="px-4 py-3 font-medium">Rent Amount</th>
                        <th className="px-4 py-3 font-medium">Agreement Date</th>
                        <th className="px-4 py-3 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {shopList
                        .filter(
                          (s) =>
                            !listFilter.trim() ||
                            s.shopNo.toLowerCase().includes(listFilter.toLowerCase()) ||
                            (s.marketName ?? "").toLowerCase().includes(listFilter.toLowerCase()) ||
                            (s.holderName ?? "").toLowerCase().includes(listFilter.toLowerCase()),
                        )
                        .map((s) => {
                          const tenantMismatch = Boolean(s.holderName && s.demandHolderName && s.holderName !== s.demandHolderName);
                          const rentMismatch = Boolean(s.baseMonthlyRent && s.demandBaseRentAmount && s.baseMonthlyRent !== s.demandBaseRentAmount);
                          return (
                          <tr key={s.shopNo} className="border-t border-slate-100">
                            <td className="px-4 py-3 font-mono text-xs">{s.shopNo}</td>
                            <td className="px-4 py-3">{s.marketName ?? "-"}</td>
                            <td className="px-4 py-3 text-xs">
                              <div className="text-slate-700">{s.holderName ?? "-"}</div>
                              <div className="text-slate-400">
                                <span className="text-slate-400">as per agreement</span>
                              </div>
                              {tenantMismatch && (
                                <div className="mt-1 flex items-center gap-1 text-amber-700" title="Differs from the agreement this shop's most recent demand was actually generated against">
                                  <AlertTriangle className="h-3 w-3 shrink-0" />
                                  <span>{s.demandHolderName} <span className="text-amber-500">as per demand</span></span>
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-500">{s.rentPaidTillMonth ?? "-"}</td>
                            <td className="px-4 py-3 text-xs">
                              <div className="text-slate-700">{s.baseMonthlyRent ? `₹${s.baseMonthlyRent}` : "-"}</div>
                              <div className="text-slate-400">as per agreement</div>
                              {rentMismatch && (
                                <div className="mt-1 flex items-center gap-1 text-amber-700" title="Differs from the agreement this shop's most recent demand was actually generated against">
                                  <AlertTriangle className="h-3 w-3 shrink-0" />
                                  <span>₹{s.demandBaseRentAmount} <span className="text-amber-500">as per demand</span></span>
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-500">
                              {s.agreementStartDate ? new Date(s.agreementStartDate).toLocaleDateString("en-IN") : "-"}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex justify-end gap-2 whitespace-nowrap text-xs">
                                <button onClick={() => searchByShopNo(s.shopNo)} className="font-medium text-nnm-blue hover:underline">
                                  Collect Rent
                                </button>
                                <span className="text-slate-300">|</span>
                                <button onClick={() => searchByShopNo(s.shopNo)} className="font-medium text-nnm-blue hover:underline">
                                  Issue Notice
                                </button>
                                <span className="text-slate-300">|</span>
                                <button onClick={() => searchByShopNo(s.shopNo)} className="font-medium text-nnm-blue hover:underline">
                                  Edit
                                </button>
                              </div>
                            </td>
                          </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {mode.kind === "notFoundCreate" && (
          <div className="space-y-4">
            <div className="flex items-start gap-2.5 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <Plus className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                No shop found for &ldquo;{mode.shopNo}&rdquo;. This will be created with that exact number — use
                this for an old/existing shop number from the paper register, not a brand new shop.
              </span>
            </div>
            {createError && (
              <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {createError}
              </div>
            )}
            <form onSubmit={handleCreateShop} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Market / area name</label>
                  <input value={customMarket} onChange={(e) => setCustomMarket(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Ward</label>
                  <input value={newWard} onChange={(e) => setNewWard(e.target.value)} className={inputClass} />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Location / address</label>
                  <input required value={newLocation} onChange={(e) => setNewLocation(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Area (sqft)</label>
                  <input type="number" min="0" value={newAreaSqft} onChange={(e) => setNewAreaSqft(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Total area (sqft)</label>
                  <input type="number" min="0" value={newTotalAreaSqft} onChange={(e) => setNewTotalAreaSqft(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Built-up area (sqft)</label>
                  <input type="number" min="0" value={newBuiltUpAreaSqft} onChange={(e) => setNewBuiltUpAreaSqft(e.target.value)} className={inputClass} />
                </div>
              </div>
              <button
                type="submit"
                disabled={creating}
                className="w-full rounded-md bg-nnm-blue py-3 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60 sm:w-auto sm:px-8"
              >
                {creating ? "Creating…" : `Create Shop ${mode.shopNo}`}
              </button>
            </form>
          </div>
        )}

        {mode.kind === "newAuto" && (
          <div className="space-y-4">
            {createError && (
              <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {createError}
              </div>
            )}
            <form onSubmit={handleCreateShop} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Market</label>
                  {markets === null ? (
                    <div className="flex items-center gap-2 py-2 text-sm text-slate-400">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading markets…
                    </div>
                  ) : (
                    <select value={selectedMarket} onChange={(e) => setSelectedMarket(e.target.value)} className={inputClass}>
                      <option value="">Select a market…</option>
                      {markets.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                      <option value="__other__">Other (new market)…</option>
                    </select>
                  )}
                </div>
                {selectedMarket === "__other__" && (
                  <div>
                    <label className={labelClass}>New market name</label>
                    <input value={customMarket} onChange={(e) => setCustomMarket(e.target.value)} className={inputClass} />
                  </div>
                )}
                <div>
                  <label className={labelClass}>Auto-generated shop number</label>
                  <div className="flex h-[42px] items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-mono">
                    {previewLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                    ) : previewShopNo ? (
                      <span className="font-semibold text-nnm-blue">{previewShopNo}</span>
                    ) : (
                      <span className="text-slate-400">Select a market first</span>
                    )}
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Ward</label>
                  <input value={newWard} onChange={(e) => setNewWard(e.target.value)} className={inputClass} />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Location / address</label>
                  <input required value={newLocation} onChange={(e) => setNewLocation(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Area (sqft)</label>
                  <input type="number" min="0" value={newAreaSqft} onChange={(e) => setNewAreaSqft(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Total area (sqft)</label>
                  <input type="number" min="0" value={newTotalAreaSqft} onChange={(e) => setNewTotalAreaSqft(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Built-up area (sqft)</label>
                  <input type="number" min="0" value={newBuiltUpAreaSqft} onChange={(e) => setNewBuiltUpAreaSqft(e.target.value)} className={inputClass} />
                </div>
              </div>
              <button
                type="submit"
                disabled={creating || !previewShopNo}
                className="w-full rounded-md bg-nnm-blue py-3 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60 sm:w-auto sm:px-8"
              >
                {creating ? "Creating…" : previewShopNo ? `Create Shop ${previewShopNo}` : "Create Shop"}
              </button>
            </form>
          </div>
        )}

        {mode.kind === "found" && (
          <div className="space-y-6">
            <button
              onClick={() => {
                setMode({ kind: "idle" });
                setShopList(null); // force a fresh fetch, since this shop's data may have just changed
              }}
              className="text-sm font-medium text-nnm-blue hover:underline"
            >
              ← Back to shop list
            </button>
            <section className="rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="mb-3 text-base font-semibold text-slate-900">Shop {shopNo}</h2>
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div>
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Market</span>
                  <span>{String(mode.result.shop?.market_name ?? "—")}</span>
                </div>
                <div>
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Location</span>
                  <span>{String(mode.result.shop?.location ?? "—")}</span>
                </div>
                <div>
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Status</span>
                  <span>{String(mode.result.shop?.status ?? "—")}</span>
                </div>
                <div>
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Area</span>
                  <span>{String(mode.result.shop?.area_sqft ?? "—")} sqft</span>
                </div>
              </div>

              <div className="mt-4 border-t border-slate-100 pt-4">
                <button
                  onClick={() => setShowEditForm((v) => !v)}
                  className="text-sm font-medium text-nnm-blue hover:underline"
                >
                  {showEditForm ? "Cancel edit" : "Edit this shop's details"}
                </button>
                {showEditForm && (
                  <div className="mt-3">
                    <ShopEditForm
                      shopNo={shopNo}
                      current={{
                        marketName: mode.result.shop?.market_name != null ? String(mode.result.shop.market_name) : null,
                        location: String(mode.result.shop?.location ?? ""),
                        ward: mode.result.shop?.ward != null ? String(mode.result.shop.ward) : null,
                        areaSqft: mode.result.shop?.area_sqft != null ? String(mode.result.shop.area_sqft) : null,
                        totalAreaSqft: mode.result.shop?.total_area_sqft != null ? String(mode.result.shop.total_area_sqft) : null,
                        builtUpAreaSqft: mode.result.shop?.built_up_area_sqft != null ? String(mode.result.shop.built_up_area_sqft) : null,
                      }}
                      onSubmitted={() => {}}
                      onCancel={() => setShowEditForm(false)}
                    />
                  </div>
                )}
              </div>

              <ShopAgreementDocumentPanel shopNo={shopNo} />

              <ShopRentEscalationPanel shopNo={shopNo} />

              {mode.result.agreement ? (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <div className="mb-2 flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-700">Active Agreement</h3>
                    {mode.result.agreement.data_status === "partial" && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                        Partial data — migrated
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                    <div>
                      <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Holder</span>
                      <span>{String(mode.result.agreement.holder_name)}</span>
                    </div>
                    <div>
                      <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Base Rent</span>
                      <span>₹{Number(mode.result.agreement.base_monthly_rent).toLocaleString("en-IN")}/mo</span>
                    </div>
                    <div>
                      <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Paid Till</span>
                      <span>{String(mode.result.agreement.rent_paid_till_month ?? "Never")}</span>
                    </div>
                  </div>
                  {mode.result.pendingRent && Number(mode.result.pendingRent.totalPending) > 0 && (
                    <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                      <b>Pending: ₹{Number(mode.result.pendingRent.totalPending).toLocaleString("en-IN")}</b> —{" "}
                      {mode.result.pendingRent.note}
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-4">
                    <button
                      onClick={() => setShowAgreementForm((s) => !s)}
                      className="text-sm font-medium text-nnm-blue hover:underline"
                    >
                      {showAgreementForm ? "Cancel edit" : "Edit this agreement"}
                    </button>
                    <button
                      onClick={() => handlePrintAgreement(Number(mode.result.agreement!.id))}
                      disabled={permitLoading}
                      className="text-sm font-medium text-slate-500 hover:underline disabled:opacity-60"
                    >
                      {permitLoading ? "Loading…" : "Print Agreement / Permit"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <p className="mb-2 text-sm text-slate-500">No active agreement for this shop.</p>
                  <div className="flex flex-wrap gap-4">
                    <button
                      onClick={() => {
                        setShowApplicationForm((s) => !s);
                        setShowAgreementForm(false);
                      }}
                      className="text-sm font-medium text-nnm-blue hover:underline"
                    >
                      {showApplicationForm ? "Cancel" : "Record new rental application"}
                    </button>
                    <button
                      onClick={() => {
                        setShowAgreementForm((s) => !s);
                        setShowApplicationForm(false);
                      }}
                      className="text-sm font-medium text-slate-500 hover:underline"
                    >
                      {showAgreementForm ? "Cancel" : "Or create agreement directly"}
                    </button>
                  </div>
                </div>
              )}
            </section>

            {showApplicationForm && (
              <ShopRentalApplicationForm shopNo={shopNo} onSubmitted={() => setShowApplicationForm(false)} />
            )}

            {showAgreementForm && (
              <ShopAgreementForm
                shopNo={shopNo}
                isEditing={Boolean(mode.result.agreement)}
                onSubmitted={() => setShowAgreementForm(false)}
              />
            )}

            {mode.result.agreement && (
              <ShopRentPaymentPanel
                shopNo={shopNo}
                hasPendingRent={Boolean(mode.result.pendingRent && mode.result.pendingRent.pendingMonths.length > 0)}
                onPaymentSuccess={(r) => {
                  setReceipt(r);
                  fetchShopByShopNo(shopNo).then((result) => setMode({ kind: "found", result }));
                }}
              />
            )}

            <ShopViolationNotices shopNo={shopNo} />

            <ShopDocumentHistory shopNo={shopNo} />
          </div>
        )}
          </>
        )}
      </main>
    </div>
  );
}