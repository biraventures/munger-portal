"use client";

import { useEffect, useState } from "react";
import { AlertCircle, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

export interface DashboardSummaryShape {
  holdings: { total: number };
  propertyChanges: {
    pending: number;
    byStage: { stage: string; label: string; count: number }[];
  };
  shops: { total: number };
  shopApplications: { received: number; pending: number };
  tradeLicense: { received: number; pending: number; issued: number };
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

interface HoldingListItem {
  holdingNo: string;
  ownerName: string;
  ward: string | null;
  taxPaidTillYear: string | null;
  annualTaxAmount: string | number | null;
  solidWasteChargeAmount: string | number | null;
}
interface PropertyChangeListItem {
  id: number;
  holdingNo: string;
  requestedBy: string;
  requestedAt: string;
  currentStage: string;
  currentStageLabel: string;
}
interface ShopListItem {
  shopNo: string;
  marketName: string | null;
  location: string;
  status: string;
}
interface ShopApplicationListItem {
  id: number;
  shopNo: string;
  applicantName: string;
  requestedAt: string;
  status: string;
}
interface TradeLicenseApplicationListItem {
  id: number;
  applicationNumber: string;
  applicantName: string;
  entityName: string;
  requestedAt: string;
  status: string;
}
interface TradeLicenseIssuedListItem {
  id: number;
  applicationNumber: string;
  applicantName: string;
  entityName: string;
  requestedAt: string;
  issuedOn?: string | null;
  validTill?: string | null;
}

export type TabKey = "holdings" | "propertyChanges" | "shops" | "shopApplications" | "tradeLicenseApplications" | "tradeLicensesIssued";

const PAGE_SIZE_OPTIONS = [25, 50];

function fmtDate(v: string): string {
  return new Date(v).toLocaleDateString("en-IN");
}

function fmtMoney(v: string | number | null): string {
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (n === null || n === undefined || Number.isNaN(n)) return "-";
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

/** Generic paginated table - one per active tab, columns supplied by the caller. */
function PaginatedTable<T>({
  fetchPage,
  columns,
  rowKey,
  emptyLabel,
}: {
  fetchPage: (page: number, pageSize: number) => Promise<PaginatedResult<T>>;
  columns: { label: string; render: (item: T) => React.ReactNode }[];
  rowKey: (item: T) => string | number;
  emptyLabel: string;
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [result, setResult] = useState<PaginatedResult<T> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchPage(page, pageSize)
      .then(setResult)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load this list."))
      .finally(() => setLoading(false));
    // fetchPage is a stable function identity from the parent per tab - intentionally not in deps to avoid re-fetch loops from inline arrow props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-slate-500">{result ? `${result.total} total` : ""}</span>
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          Show
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="rounded border border-slate-300 px-1.5 py-1"
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

      {error && (
        <div role="alert" className="mb-2 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      <div className="max-h-80 overflow-y-auto rounded-md border border-slate-200">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-50">
            <tr>
              {columns.map((c) => (
                <th key={c.label} className="border-b border-slate-200 px-2.5 py-2 text-left font-semibold text-slate-500">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="p-4 text-center text-slate-400">
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                </td>
              </tr>
            ) : !result || result.items.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="p-4 text-center text-slate-400">
                  {emptyLabel}
                </td>
              </tr>
            ) : (
              result.items.map((item) => (
                <tr key={rowKey(item)} className="border-b border-slate-100 last:border-0">
                  {columns.map((c) => (
                    <td key={c.label} className="px-2.5 py-1.5 text-slate-700">
                      {c.render(item)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {result && result.total > 0 && (
        <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded border border-slate-300 p-1 disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded border border-slate-300 p-1 disabled:opacity-40"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export interface DashboardSummaryWidgetProps {
  fetchSummary: () => Promise<DashboardSummaryShape>;
  fetchHoldings: (page: number, pageSize: number, ward?: string) => Promise<PaginatedResult<HoldingListItem>>;
  fetchPropertyChanges: (page: number, pageSize: number) => Promise<PaginatedResult<PropertyChangeListItem>>;
  fetchShops: (page: number, pageSize: number) => Promise<PaginatedResult<ShopListItem>>;
  fetchShopApplications: (page: number, pageSize: number) => Promise<PaginatedResult<ShopApplicationListItem>>;
  fetchTradeLicenseApplications: (page: number, pageSize: number) => Promise<PaginatedResult<TradeLicenseApplicationListItem>>;
  fetchTradeLicensesIssued: (page: number, pageSize: number) => Promise<PaginatedResult<TradeLicenseIssuedListItem>>;
  /** Restricts which tabs are shown/fetched - e.g. a role scoped to only the shop workflow shouldn't see property-tax or trade-license tabs. Defaults to every tab, so existing callers (e.g. the operator dashboard) are unaffected. */
  visibleTabs?: TabKey[];
}

export function DashboardSummaryWidget(props: DashboardSummaryWidgetProps) {
  const [summary, setSummary] = useState<DashboardSummaryShape | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const ALL_TAB_KEYS: TabKey[] = ["holdings", "propertyChanges", "shops", "shopApplications", "tradeLicenseApplications", "tradeLicensesIssued"];
  const visibleKeys = props.visibleTabs ?? ALL_TAB_KEYS;
  const [activeTab, setActiveTab] = useState<TabKey>(visibleKeys[0] ?? "holdings");
  const [wardFilter, setWardFilter] = useState("");
  const [wardFilterInput, setWardFilterInput] = useState("");

  useEffect(() => {
    props
      .fetchSummary()
      .then(setSummary)
      .catch((err) => setSummaryError(err instanceof Error ? err.message : "Could not load the overview."));
    // fetchSummary is a stable prop per dashboard page - intentionally not in deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allTabsWithCounts: { key: TabKey; label: string; count: number | null }[] = [
    { key: "holdings", label: "Holdings", count: summary?.holdings.total ?? null },
    { key: "propertyChanges", label: "Property Changes Pending", count: summary?.propertyChanges.pending ?? null },
    { key: "shops", label: "Shop Entries", count: summary?.shops.total ?? null },
    { key: "shopApplications", label: "Shop Applications", count: summary?.shopApplications.received ?? null },
    { key: "tradeLicenseApplications", label: "Trade License Applications", count: summary?.tradeLicense.received ?? null },
    { key: "tradeLicensesIssued", label: "Trade Licenses Issued", count: summary?.tradeLicense.issued ?? null },
  ];
  const tabs = allTabsWithCounts.filter((t) => visibleKeys.includes(t.key));

  return (
    <section className="mb-8 rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="mb-4 text-base font-semibold text-slate-900">Overview</h2>

      {summaryError && (
        <div role="alert" className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {summaryError}
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
              activeTab === t.key ? "bg-nnm-blue text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {t.label}
            {t.count !== null && <span className="ml-1.5 opacity-80">({t.count})</span>}
          </button>
        ))}
      </div>

      {activeTab === "holdings" && (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setWardFilter(wardFilterInput.trim());
            }}
            className="mb-3 flex items-center gap-2"
          >
            <label className="text-xs font-medium text-slate-600">Ward</label>
            <input
              value={wardFilterInput}
              onChange={(e) => setWardFilterInput(e.target.value)}
              placeholder="e.g. 12 (leave blank for all wards)"
              className="w-56 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1"
            />
            <button
              type="submit"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Apply
            </button>
            {wardFilter && (
              <button
                type="button"
                onClick={() => {
                  setWardFilterInput("");
                  setWardFilter("");
                }}
                className="text-xs font-semibold text-nnm-blue hover:underline"
              >
                Clear
              </button>
            )}
          </form>
          <PaginatedTable
            key={wardFilter}
            fetchPage={(page, pageSize) => props.fetchHoldings(page, pageSize, wardFilter || undefined)}
            rowKey={(i) => i.holdingNo}
            emptyLabel={wardFilter ? `No holdings on file for Ward ${wardFilter}.` : "No holdings on file."}
            columns={[
              { label: "Holding No", render: (i) => <span className="font-mono">{i.holdingNo}</span> },
              { label: "Owner", render: (i) => i.ownerName },
              { label: "Ward", render: (i) => i.ward ?? "-" },
              { label: "Tax Paid Till Year", render: (i) => i.taxPaidTillYear ?? "-" },
              { label: "Annual Tax Amount", render: (i) => fmtMoney(i.annualTaxAmount) },
              { label: "Solid Waste Charge", render: (i) => fmtMoney(i.solidWasteChargeAmount) },
            ]}
          />
        </>
      )}

      {activeTab === "propertyChanges" && (
        <PaginatedTable
          fetchPage={props.fetchPropertyChanges}
          rowKey={(i) => i.id}
          emptyLabel="No pending property changes."
          columns={[
            { label: "Holding No", render: (i) => <span className="font-mono">{i.holdingNo}</span> },
            { label: "Requested By", render: (i) => i.requestedBy },
            { label: "Requested On", render: (i) => fmtDate(i.requestedAt) },
            {
              label: "Stage",
              render: (i) => (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                  {i.currentStageLabel}
                </span>
              ),
            },
          ]}
        />
      )}

      {activeTab === "shops" && (
        <PaginatedTable
          fetchPage={props.fetchShops}
          rowKey={(i) => i.shopNo}
          emptyLabel="No shops on file."
          columns={[
            { label: "Shop No", render: (i) => <span className="font-mono">{i.shopNo}</span> },
            { label: "Market", render: (i) => i.marketName ?? "-" },
            { label: "Location", render: (i) => i.location },
            { label: "Status", render: (i) => i.status },
          ]}
        />
      )}

      {activeTab === "shopApplications" && (
        <PaginatedTable
          fetchPage={props.fetchShopApplications}
          rowKey={(i) => i.id}
          emptyLabel="No shop rental applications received."
          columns={[
            { label: "Shop No", render: (i) => <span className="font-mono">{i.shopNo}</span> },
            { label: "Applicant", render: (i) => i.applicantName },
            { label: "Received On", render: (i) => fmtDate(i.requestedAt) },
            { label: "Status", render: (i) => i.status },
          ]}
        />
      )}

      {activeTab === "tradeLicenseApplications" && (
        <PaginatedTable
          fetchPage={props.fetchTradeLicenseApplications}
          rowKey={(i) => i.id}
          emptyLabel="No trade license applications received."
          columns={[
            { label: "Application No", render: (i) => <span className="font-mono">{i.applicationNumber}</span> },
            { label: "Applicant", render: (i) => i.applicantName },
            { label: "Entity", render: (i) => i.entityName },
            { label: "Received On", render: (i) => fmtDate(i.requestedAt) },
            { label: "Status", render: (i) => i.status },
          ]}
        />
      )}

      {activeTab === "tradeLicensesIssued" && (
        <PaginatedTable
          fetchPage={props.fetchTradeLicensesIssued}
          rowKey={(i) => i.id}
          emptyLabel="No trade licenses issued yet."
          columns={[
            { label: "Application No", render: (i) => <span className="font-mono">{i.applicationNumber}</span> },
            { label: "Applicant", render: (i) => i.applicantName },
            { label: "Entity", render: (i) => i.entityName },
            { label: "Issued On", render: (i) => (i.issuedOn ? fmtDate(i.issuedOn) : "—") },
            { label: "Valid Till", render: (i) => (i.validTill ? fmtDate(i.validTill) : "—") },
          ]}
        />
      )}
    </section>
  );
}