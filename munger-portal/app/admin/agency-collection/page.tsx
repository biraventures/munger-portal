"use client";

import { useState } from "react";
import { AlertCircle, Loader2, Lock, Receipt, Search } from "lucide-react";
import { MobileHoldingLookup } from "@/components/mobile-holding-lookup";
import { AdminHeader } from "@/components/admin-header";
import { PaymentForm } from "@/components/operator/payment-form";
import { ReceiptView } from "@/components/operator/receipt-view";
import { PropertyDocumentHistory } from "@/components/operator/property-document-history";
import { CollectPaymentWarningDialog } from "@/components/collect-payment-warning-dialog";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { agencyHistoryApi, agencyPaymentApi, fetchHolding, type AgencyHolding } from "@/lib/agency-collection-api";
import type { ReceiptData } from "@/lib/payment-api";

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const rs = (v: unknown) => {
  const n = num(v);
  return n == null ? "-" : `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-1.5 text-sm last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-900">{value ?? "-"}</span>
    </div>
  );
}

/**
 * Agency Operator: search any holding (all wards), see its dues, notices and payments, and receive holding tax against
 * an existing demand notice. Nothing about the holding can be changed here, and no demand notice can be created - if a
 * holding has no notice open for payment, the Nagar Nigam counter has to issue one first.
 */
export default function AgencyCollectionPage() {
  const admin = useAdminGuard();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [holding, setHolding] = useState<AgencyHolding | null>(null);
  const [showWarning, setShowWarning] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  if (!admin) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  if (admin.role !== "agency_operator") {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <main className="mx-auto max-w-2xl px-6 py-10">
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" /> This page is for the Agency Operator login.
          </div>
        </main>
      </div>
    );
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    await searchHolding(query);
  }

  async function searchHolding(value: string) {
    const h = value.trim();
    if (!h) return;
    setSearching(true);
    setError(null);
    setHolding(null);
    setShowPayment(false);
    setReceipt(null);
    try {
      const r = await fetchHolding(h);
      if (!r) setError(`No holding found with number "${h}". Check the number (e.g. MUNG-02002).`);
      else setHolding(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this holding.");
    } finally {
      setSearching(false);
    }
  }

  const p = holding?.property;
  const blocked = !!p && (p.is_disputed || p.resurvey_required);
  const due = p ? (num(p.totalPayable) ?? (num(p.currentTax) ?? 0) + (num(p.pendingArrearsTotal) ?? 0) + (num(p.autoPenalty) ?? 0)) : null;

  if (receipt) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
          <ReceiptView
            receipt={receipt}
            onNewPayment={() => {
              setReceipt(null);
              setShowPayment(false);
              setHolding(null);
              setQuery("");
            }}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
            <Receipt className="h-6 w-6" /> Holding Tax Collection
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Search a holding in any ward and receive its holding tax against the demand notice already issued. Holding details cannot be changed from this login,
            and no new demand notice can be created here.
          </p>
        </div>

        <form onSubmit={search} className="flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Holding number, e.g. MUNG-02002"
            maxLength={40}
            className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue"
          />
          <button disabled={searching || !query.trim()} className="inline-flex items-center gap-2 rounded-md bg-nnm-blue px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Search
          </button>
        </form>

        <MobileHoldingLookup
          as="admin"
          onPick={(h) => {
            setQuery(h);
            void searchHolding(h);
          }}
        />

        {error && (
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {p && holding && (
          <>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <h2 className="mb-2 flex items-center gap-2 text-base font-semibold text-slate-900">
                  Holding {p.holding_no} <Lock className="h-3.5 w-3.5 text-slate-400" aria-label="View only" />
                </h2>
                <Row label="Owner" value={p.owner_name} />
                {p.relation_name && <Row label={p.relation_type ? `${p.relation_type}` : "Relation"} value={p.relation_name} />}
                <Row label="Ward" value={p.ward} />
                <Row label="Address" value={p.address} />
                <Row label="Mobile" value={p.mobile_no} />
                {p.old_holding_no && <Row label="Old holding no." value={p.old_holding_no} />}
                <Row label="Plot area" value={p.area_sqft != null ? `${Number(p.area_sqft).toLocaleString("en-IN")} sq ft` : "-"} />
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <h2 className="mb-2 text-base font-semibold text-slate-900">Tax</h2>
                <Row label="Annual holding tax" value={rs(p.currentTax)} />
                <Row label="Arrears pending" value={rs(p.pendingArrearsTotal)} />
                <Row label="Late fee (penalty)" value={rs(p.autoPenalty)} />
                <Row label="Tax paid up to" value={p.tax_paid_till_year ?? "Not paid yet"} />
                <Row label="Total payable now (approx.)" value={<span className="text-nnm-blue">{rs(due)}</span>} />
                <p className="mt-2 text-xs text-slate-400">The exact amount is the one on the demand notice you collect against.</p>
              </div>
            </div>

            {holding.floors.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase text-slate-500">
                      <th className="px-4 py-2">Floor</th>
                      <th className="px-4 py-2">Built-up (sq ft)</th>
                      <th className="px-4 py-2">Construction</th>
                      <th className="px-4 py-2">Usage</th>
                      <th className="px-4 py-2">Occupancy</th>
                      <th className="px-4 py-2">Year built</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holding.floors.map((f, i) => (
                      <tr key={i} className="border-b border-slate-50 last:border-0">
                        <td className="px-4 py-2">{f.floor_label}</td>
                        <td className="px-4 py-2">{Number(f.buildup_sqft).toLocaleString("en-IN")}</td>
                        <td className="px-4 py-2">{f.const_type}</td>
                        <td className="px-4 py-2">{f.usage_type}</td>
                        <td className="px-4 py-2 capitalize">{f.occupancy}</td>
                        <td className="px-4 py-2">{f.year_built ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {blocked ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                {p.is_disputed
                  ? "This holding is marked as DISPUTED - no payment can be collected until the Nagar Nigam resolves it."
                  : "This holding is flagged for re-survey - no payment can be collected until the re-survey is complete."}
              </div>
            ) : (
              !showPayment && (
                <button
                  onClick={() => setShowWarning(true)}
                  className="inline-flex items-center gap-2 rounded-md bg-nnm-gold px-6 py-3 text-sm font-semibold text-[#20240a] hover:brightness-95"
                >
                  <Receipt className="h-4 w-4" /> Collect Payment
                </button>
              )
            )}

            {showWarning && (
              <CollectPaymentWarningDialog
                holdingNo={p.holding_no}
                ownerName={p.owner_name}
                amountDue={due}
                collectingAs={`${admin.displayName} (Agency Operator)`}
                onCancel={() => setShowWarning(false)}
                onContinue={() => {
                  setShowWarning(false);
                  setShowPayment(true);
                }}
              />
            )}

            {showPayment && !blocked && (
              <div className="rounded-xl border-2 border-nnm-gold bg-white p-5">
                <PaymentForm holdingNo={p.holding_no} ownerName={p.owner_name} onSuccess={setReceipt} api={agencyPaymentApi} />
                <p className="mt-3 text-xs text-slate-500">
                  No demand notice listed? The Nagar Nigam has not issued one for this holding yet - payment can be received once it is issued.
                </p>
              </div>
            )}

            <PropertyDocumentHistory holdingNo={p.holding_no} api={agencyHistoryApi} />
          </>
        )}
      </main>
    </div>
  );
}
