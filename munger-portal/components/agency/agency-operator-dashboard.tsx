import Link from "next/link";
import { BarChart3, Award, Printer, Receipt } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import type { AdminInfo } from "@/lib/admin-auth";

const cardClass = "flex flex-col rounded-xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md";
const iconWrapClass = "mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-nnm-blue";

/**
 * The Agency Operator's whole dashboard. The login belongs to a private agency, so it gets only these cards (not the
 * shared admin dashboard with per-role switches) - and the server refuses everything else anyway.
 */
export function AgencyOperatorDashboard({ admin }: { admin: AdminInfo }) {
  const cards = [
    {
      href: "/admin/agency-collection",
      icon: Receipt,
      title: "Holding Tax Collection",
      text: "Search any holding (all wards), see its dues, demand notices and payments, and receive holding tax against the current demand notice.",
    },
    {
      href: "/admin/agency-notices",
      icon: Printer,
      title: "Ward-wise Demand Notices",
      text: "Print the demand notices already issued for every holding with dues pending in a ward. No new demand is created here.",
    },
    {
      href: "/admin/agency-reports",
      icon: BarChart3,
      title: "Tax Collector Reports",
      text: "Collection, notice distribution and field reports - ward-wise and Tax Collector-wise, daily to annual.",
    },
    {
      href: "/admin/trade-license-dashboard",
      icon: Award,
      title: "Trade Licences",
      text: "Trade licence applications and their status, and the trade licence survey notices - view only.",
    },
  ];
  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">Welcome, {admin.displayName}</h1>
        <p className="mb-8 text-sm text-slate-500">
          Signed in as Agency Operator. You can search holdings, receive holding tax, print existing demand notices and view reports. Holding details cannot be
          changed from this login.
        </p>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {cards.map((c) => (
            <Link key={c.href} href={c.href} className={cardClass}>
              <span className={iconWrapClass}>
                <c.icon className="h-6 w-6" strokeWidth={1.8} />
              </span>
              <h3 className="mb-1.5 text-base font-semibold text-slate-900">{c.title}</h3>
              <p className="text-sm text-slate-500">{c.text}</p>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
