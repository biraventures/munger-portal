"use client";

import { useState } from "react";
import { AlertCircle, FileText, Loader2, Printer, Receipt, Search, ShieldAlert } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { NoticeView } from "@/components/operator/notice-view";
import { ReceiptReprintView } from "@/components/operator/receipt-reprint-view";
import { ShopNoticeView } from "@/components/operator/shop-notice-view";
import { ShopReceiptReprintView } from "@/components/operator/shop-receipt-reprint-view";
import { ViolationNoticePrintView } from "@/components/operator/violation-notice-print-view";
import {
  fetchDemandNoticeHistoryAdmin,
  fetchDemandNoticeReprintAdmin,
  fetchPaymentHistoryAdmin,
  fetchReceiptReprintAdmin,
  type DemandNoticeHistoryEntry,
  type PaymentHistoryEntry,
  type PrintableReceiptHistory,
} from "@/lib/admin-api";
import type { DemandNoticeReprintData } from "@/lib/demand-notice-api";
import {
  fetchShopDemandHistoryAdmin,
  fetchShopReceiptReprintAdmin,
  fetchShopPaymentHistoryAdmin,
  fetchViolationNoticesAdmin,
  fetchPrintableDemandNoticeAdmin,
  fetchPrintableViolationNoticeAdmin,
  type ShopDemandHistoryEntry,
  type PrintableShopReceiptHistory,
  type ShopPaymentHistoryEntry,
  type ViolationNotice,
  type PrintableViolationNotice,
} from "@/lib/admin-shop-api";
import type { PrintableShopDemand } from "@/lib/shop-api";

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";

type Category = "property" | "shop";

export default function DocumentArchivePage() {
  const admin = useAdminGuard();
  const [category, setCategory] = useState<Category>("property");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingItem, setLoadingItem] = useState<string | null>(null);
  const [searchedFor, setSearchedFor] = useState<string | null>(null);

  const [noticeHistory, setNoticeHistory] = useState<DemandNoticeHistoryEntry[] | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<PaymentHistoryEntry[] | null>(null);
  const [shopDemandHistory, setShopDemandHistory] = useState<ShopDemandHistoryEntry[] | null>(null);
  const [shopPaymentHistory, setShopPaymentHistory] = useState<ShopPaymentHistoryEntry[] | null>(null);
  const [violations, setViolations] = useState<ViolationNotice[] | null>(null);

  const [noticeReprint, setNoticeReprint] = useState<DemandNoticeReprintData | null>(null);
  const [receiptReprint, setReceiptReprint] = useState<PrintableReceiptHistory | null>(null);
  const [shopDemandView, setShopDemandView] = useState<PrintableShopDemand | null>(null);
  const [shopReceiptView, setShopReceiptView] = useState<PrintableShopReceiptHistory | null>(null);
  const [violationView, setViolationView] = useState<PrintableViolationNotice | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    setNoticeHistory(null);
    setPaymentHistory(null);
    setShopDemandHistory(null);
    setShopPaymentHistory(null);
    setViolations(null);
    try {
      if (category === "property") {
        const [notices, payments] = await Promise.all([
          fetchDemandNoticeHistoryAdmin(query.trim()),
          fetchPaymentHistoryAdmin(query.trim()),
        ]);
        setNoticeHistory(notices);
        setPaymentHistory(payments);
      } else {
        const [demands, payments, violationRes] = await Promise.all([
          fetchShopDemandHistoryAdmin(query.trim()),
          fetchShopPaymentHistoryAdmin(query.trim()),
          fetchViolationNoticesAdmin(query.trim()).catch(() => ({ notices: [] as ViolationNotice[] })),
        ]);
        setShopDemandHistory(demands);
        setShopPaymentHistory(payments);
        setViolations(violationRes.notices);
      }
      setSearchedFor(query.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load documents for this number.");
    } finally {
      setSearching(false);
    }
  }

  async function withLoading(key: string, fn: () => Promise<void>) {
    setLoadingItem(key);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this document.");
    } finally {
      setLoadingItem(null);
    }
  }

  if (!admin) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  if (admin.role === "stall_prabhari") {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <main className="mx-auto max-w-2xl px-6 py-10">
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            The document archive isn&apos;t part of the shop/rental workflow this login is scoped to.
          </div>
        </main>
      </div>
    );
  }

  if (noticeReprint) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="no-print">
          <AdminHeader admin={admin} />
        </div>
        <main className="mx-auto max-w-3xl px-6 py-10">
          <NoticeView notice={noticeReprint} onClose={() => setNoticeReprint(null)} closeLabel="Close" />
        </main>
      </div>
    );
  }
  if (receiptReprint) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="no-print">
          <AdminHeader admin={admin} />
        </div>
        <main className="mx-auto max-w-3xl px-6 py-10">
          <ReceiptReprintView receipt={receiptReprint} onClose={() => setReceiptReprint(null)} />
        </main>
      </div>
    );
  }
  if (shopDemandView) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="no-print">
          <AdminHeader admin={admin} />
        </div>
        <main className="mx-auto max-w-3xl px-6 py-10">
          <ShopNoticeView notice={shopDemandView} onClose={() => setShopDemandView(null)} />
        </main>
      </div>
    );
  }
  if (shopReceiptView) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="no-print">
          <AdminHeader admin={admin} />
        </div>
        <main className="mx-auto max-w-3xl px-6 py-10">
          <ShopReceiptReprintView receipt={shopReceiptView} onClose={() => setShopReceiptView(null)} />
        </main>
      </div>
    );
  }
  if (violationView) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="no-print">
          <AdminHeader admin={admin} />
        </div>
        <main className="mx-auto max-w-3xl px-6 py-10">
          <ViolationNoticePrintView notice={violationView} onClose={() => setViolationView(null)} />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />

      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">Document Archive</h1>
        <p className="mb-6 text-sm text-slate-500">
          Look up every demand notice, receipt, and violation notice ever issued — view only, nothing here can be
          edited.
        </p>

        <div className="mb-6 flex gap-2">
          <button
            onClick={() => setCategory("property")}
            className={`rounded-md px-4 py-2 text-sm font-semibold ${
              category === "property" ? "bg-nnm-blue text-white" : "border border-slate-200 text-slate-600"
            }`}
          >
            Property Tax
          </button>
          <button
            onClick={() => setCategory("shop")}
            className={`rounded-md px-4 py-2 text-sm font-semibold ${
              category === "shop" ? "bg-nnm-blue text-white" : "border border-slate-200 text-slate-600"
            }`}
          >
            Municipal Shop Rent
          </button>
        </div>

        <form onSubmit={handleSearch} className="mb-6 flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={category === "property" ? "e.g. MUNG-08257 (holding number)" : "e.g. NNC-1 (shop number)"}
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

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {searchedFor && category === "property" && (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <FileText className="h-4 w-4" />
                Demand Notices
              </h3>
              {noticeHistory && noticeHistory.length === 0 && <p className="text-sm text-slate-400">None found.</p>}
              <ul className="space-y-1.5">
                {noticeHistory?.map((n) => (
                  <li key={n.demandNo} className="flex items-center justify-between rounded-md border border-slate-200 p-2.5 text-xs">
                    <div>
                      <span className="block font-mono font-semibold text-slate-800">
                        {n.date}
                        {n.reminderLabel && (
                          <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-700">
                            {n.reminderLabel}
                          </span>
                        )}
                      </span>
                      <span className="text-slate-500">
                        ₹{Number(n.totalAmountDemanded).toLocaleString("en-IN")} —{" "}
                        {n.settled ? "settled" : n.superseded ? "superseded" : "unsettled"}
                      </span>
                    </div>
                    <button
                      onClick={() => withLoading(`n-${n.demandNo}`, async () => setNoticeReprint(await fetchDemandNoticeReprintAdmin(n.demandNo)))}
                      disabled={loadingItem === `n-${n.demandNo}`}
                      className="inline-flex items-center gap-1 rounded border border-nnm-blue px-2 py-1 font-semibold text-nnm-blue hover:bg-blue-50 disabled:opacity-60"
                    >
                      {loadingItem === `n-${n.demandNo}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Printer className="h-3 w-3" />}
                      View
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <Receipt className="h-4 w-4" />
                Payment Receipts
              </h3>
              {paymentHistory && paymentHistory.length === 0 && <p className="text-sm text-slate-400">None found.</p>}
              <ul className="space-y-1.5">
                {paymentHistory?.map((p) => (
                  <li key={p.receiptNo} className="flex items-center justify-between rounded-md border border-slate-200 p-2.5 text-xs">
                    <div>
                      <span className="block font-mono font-semibold text-slate-800">{p.date}</span>
                      <span className="text-slate-500">
                        ₹{Number(p.amountReceived).toLocaleString("en-IN")} — {p.paymentMode}
                      </span>
                    </div>
                    <button
                      onClick={() => withLoading(`p-${p.receiptNo}`, async () => setReceiptReprint(await fetchReceiptReprintAdmin(p.receiptNo)))}
                      disabled={loadingItem === `p-${p.receiptNo}`}
                      className="inline-flex items-center gap-1 rounded border border-nnm-blue px-2 py-1 font-semibold text-nnm-blue hover:bg-blue-50 disabled:opacity-60"
                    >
                      {loadingItem === `p-${p.receiptNo}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Printer className="h-3 w-3" />}
                      View
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {searchedFor && category === "shop" && (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <FileText className="h-4 w-4" />
                Rent Demands
              </h3>
              {shopDemandHistory && shopDemandHistory.length === 0 && <p className="text-sm text-slate-400">None found.</p>}
              <ul className="space-y-1.5">
                {shopDemandHistory?.map((d) => (
                  <li key={d.demandNo} className="flex items-center justify-between rounded-md border border-slate-200 p-2.5 text-xs">
                    <div>
                      <span className="block font-mono font-semibold text-slate-800">{d.demandDate}</span>
                      <span className="text-slate-500">
                        ₹{Number(d.totalAmountDemanded).toLocaleString("en-IN")} — {d.settled ? "settled" : "unsettled"}
                      </span>
                    </div>
                    <button
                      onClick={() => withLoading(`sd-${d.demandNo}`, async () => setShopDemandView(await fetchPrintableDemandNoticeAdmin(d.demandNo)))}
                      disabled={loadingItem === `sd-${d.demandNo}`}
                      className="inline-flex items-center gap-1 rounded border border-nnm-blue px-2 py-1 font-semibold text-nnm-blue hover:bg-blue-50 disabled:opacity-60"
                    >
                      {loadingItem === `sd-${d.demandNo}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Printer className="h-3 w-3" />}
                      View
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <Receipt className="h-4 w-4" />
                Payment Receipts
              </h3>
              {shopPaymentHistory && shopPaymentHistory.length === 0 && <p className="text-sm text-slate-400">None found.</p>}
              <ul className="space-y-1.5">
                {shopPaymentHistory?.map((p) => (
                  <li key={p.receiptNo} className="flex items-center justify-between rounded-md border border-slate-200 p-2.5 text-xs">
                    <div>
                      <span className="block font-mono font-semibold text-slate-800">{p.date}</span>
                      <span className="text-slate-500">
                        ₹{Number(p.amountReceived).toLocaleString("en-IN")} — {p.paymentMode}
                      </span>
                    </div>
                    <button
                      onClick={() => withLoading(`sp-${p.receiptNo}`, async () => setShopReceiptView(await fetchShopReceiptReprintAdmin(p.receiptNo)))}
                      disabled={loadingItem === `sp-${p.receiptNo}`}
                      className="inline-flex items-center gap-1 rounded border border-nnm-blue px-2 py-1 font-semibold text-nnm-blue hover:bg-blue-50 disabled:opacity-60"
                    >
                      {loadingItem === `sp-${p.receiptNo}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Printer className="h-3 w-3" />}
                      View
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <ShieldAlert className="h-4 w-4" />
                Violation Notices
              </h3>
              {violations && violations.length === 0 && <p className="text-sm text-slate-400">None found.</p>}
              <ul className="space-y-1.5">
                {violations?.map((v) => (
                  <li key={v.id} className="flex items-center justify-between rounded-md border border-slate-200 p-2.5 text-xs">
                    <div>
                      <span className="block font-semibold text-slate-800">{v.violation_category}</span>
                      <span className="text-slate-500">
                        {new Date(v.issued_date).toLocaleDateString("en-IN")} — {v.status}
                      </span>
                    </div>
                    <button
                      onClick={() => withLoading(`v-${v.id}`, async () => setViolationView(await fetchPrintableViolationNoticeAdmin(v.id)))}
                      disabled={loadingItem === `v-${v.id}`}
                      className="inline-flex items-center gap-1 rounded border border-nnm-blue px-2 py-1 font-semibold text-nnm-blue hover:bg-blue-50 disabled:opacity-60"
                    >
                      {loadingItem === `v-${v.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Printer className="h-3 w-3" />}
                      View
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}