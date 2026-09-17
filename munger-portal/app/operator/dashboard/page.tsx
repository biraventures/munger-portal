"use client";

import { Store, Building2, ShoppingBag, Award, Download, ClipboardCheck } from "lucide-react";
import { OperatorHeader } from "@/components/operator-header";
import { OperatorTaskCard } from "@/components/operator-task-card";
import { DashboardSummaryWidget } from "@/components/dashboard-summary-widget";
import { useOperatorGuard } from "@/lib/use-operator-guard";
import {
  fetchDashboardSummary,
  fetchDashboardHoldings,
  fetchDashboardPropertyChanges,
  fetchDashboardShops,
  fetchDashboardShopApplications,
  fetchDashboardTradeLicenseApplications,
  fetchDashboardTradeLicensesIssued,
} from "@/lib/operator-api";

export default function OperatorDashboardPage() {
  const operator = useOperatorGuard();

  if (!operator) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <OperatorHeader operator={operator} />

      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">Welcome, {operator.displayName}</h1>
        <p className="mb-8 text-sm text-slate-500">Choose a task to get started.</p>

        <DashboardSummaryWidget
          fetchSummary={fetchDashboardSummary}
          fetchHoldings={fetchDashboardHoldings}
          fetchPropertyChanges={fetchDashboardPropertyChanges}
          fetchShops={fetchDashboardShops}
          fetchShopApplications={fetchDashboardShopApplications}
          fetchTradeLicenseApplications={fetchDashboardTradeLicenseApplications}
          fetchTradeLicensesIssued={fetchDashboardTradeLicensesIssued}
        />

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <OperatorTaskCard
            href="/operator/property-tax"
            icon={Building2}
            title="Property Tax"
            description="Search, create, or edit a holding — generate demand notices and collect payments."
          />

          <OperatorTaskCard
            href="/operator/property-survey"
            icon={ClipboardCheck}
            title="Property Survey Worklist"
            description="Holdings added with only old ARV values, awaiting a real physical survey."
          />

          <OperatorTaskCard
            href="/operator/migrated-holding-entry"
            icon={ClipboardCheck}
            title="Migrated Holding Survey Entry"
            description="Enter real floor-wise details for old holdings forwarded by a Tax Daroga."
          />

          <OperatorTaskCard
            href="/operator/shops-hub"
            icon={Store}
            title="Nagar Nigam Shop / Stall"
            description="Rent collection, agreements, and new shop entries."
          />

          <OperatorTaskCard
            href="/operator/trade-license"
            icon={Award}
            title="Trade License Application"
            description="Search an application, tick off the document checklist, or record an offline application."
          />

          <OperatorTaskCard
            icon={ShoppingBag}
            title="Building Map Application"
            description="Coming soon."
          />

          <OperatorTaskCard
            href="/operator/receipts"
            icon={Download}
            title="Tax Receipt Data"
            description="Download collected receipts - daily, monthly, or overall."
          />
        </div>
      </main>
    </div>
  );
}