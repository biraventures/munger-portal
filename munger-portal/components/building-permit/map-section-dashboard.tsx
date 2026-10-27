"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Building2 } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import type { AdminInfo } from "@/lib/admin-auth";
import { fetchOfficeList } from "@/lib/building-permit-api";

const OPEN = ["submitted", "scrutiny", "awaiting_payment", "processing", "authority", "sanctioned"];

/** The Map Section Nodal Clerk's dashboard - building plan permits only. */
export function MapSectionDashboard({ admin }: { admin: AdminInfo }) {
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    fetchOfficeList("open", "").then((r) => setCounts(r.counts)).catch(() => setCounts(null));
  }, []);
  const open = counts ? OPEN.reduce((t, s) => t + (counts[s] ?? 0), 0) : null;
  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">Welcome, {admin.displayName}</h1>
        <p className="mb-8 text-sm text-slate-500">Signed in as Map Section Nodal Clerk.</p>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Link
            href="/admin/building-permits"
            className={`flex flex-col rounded-xl p-6 transition-shadow hover:shadow-md ${open ? "border-2 border-red-300 bg-red-50" : "border border-slate-200 bg-white"}`}
          >
            <span className={`mb-4 flex h-12 w-12 items-center justify-center rounded-full ${open ? "bg-red-100 text-red-600" : "bg-blue-50 text-nnm-blue"}`}>
              <Building2 className="h-6 w-6" strokeWidth={1.8} />
            </span>
            <h3 className="mb-1.5 text-base font-semibold text-slate-900">
              Building Plan Permits{open ? ` - ${open} in process` : ""}
            </h3>
            <p className="text-sm text-slate-500">
              Online applications: site verification with Assistant Architect, Amin and AE reports, technical scrutiny, fee, file processing, competent authority approval and issue of the permit.
            </p>
          </Link>
        </div>
      </main>
    </div>
  );
}
