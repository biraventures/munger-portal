"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Megaphone } from "lucide-react";
import { fetchPendingCounts } from "@/lib/public-reports-api";

/** Asset Management dashboard card: public complaints waiting for the City Manager's verification. */
export function PublicComplaintsCard({ role }: { role: string }) {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    fetchPendingCounts()
      .then((c) => setN(c.total))
      .catch(() => setN(null));
  }, []);
  return (
    <Link href="/attendance/public-complaints" className="relative flex flex-col rounded-xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md">
      {n ? <span className="absolute right-4 top-4 rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-bold text-white">{n} waiting</span> : null}
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-nnm-blue">
        <Megaphone className="h-6 w-6" strokeWidth={1.8} />
      </span>
      <h3 className="mb-1.5 text-base font-semibold text-slate-900">Public Complaints</h3>
      <p className="text-sm text-slate-500">
        {role === "city_manager"
          ? "Verify complaints about streetlights, High Mast lights and submersibles from the public website and approve them for repair."
          : "Complaints from the public website and the City Manager's verification of each."}
      </p>
    </Link>
  );
}
