"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { fetchPendingCount } from "@/lib/pre2011-arv-api";

/** Dashboard card: pre-2011 ARV entries from the demand register (Tax Daroga enters, City Manager approves). */
export function Pre2011ArvCard({ role }: { role: string }) {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    fetchPendingCount()
      .then(setN)
      .catch(() => setN(null));
  }, []);
  const mine = role === "city_manager" && !!n;
  return (
    <Link
      href="/admin/pre2011-arv"
      className={`flex flex-col rounded-xl p-6 transition-shadow hover:shadow-md ${mine ? "border-2 border-red-300 bg-red-50" : "border border-slate-200 bg-white"}`}
    >
      <span className={`mb-4 flex h-12 w-12 items-center justify-center rounded-full ${mine ? "bg-red-100 text-red-600" : "bg-blue-50 text-nnm-blue"}`}>
        <BookOpen className="h-6 w-6" strokeWidth={1.8} />
      </span>
      <h3 className="mb-1.5 text-base font-semibold text-slate-900">Pre-2011 ARV Entry</h3>
      <p className="text-sm text-slate-500">
        {role === "tax_daroga"
          ? "Enter the ARV from the old demand register for holdings with unpaid years before 2011-12 - they cannot be billed until it is approved."
          : role === "city_manager"
            ? n
              ? `${n} entr${n === 1 ? "y" : "ies"} waiting for your approval.`
              : "Approve the Tax Daroga's pre-2011 ARV entries from the demand register."
            : "Pre-2011 ARV entries from the demand register and holdings still waiting for them."}
      </p>
    </Link>
  );
}
