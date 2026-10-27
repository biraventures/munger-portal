"use client";

import { useEffect, useState } from "react";
import { Loader2, Printer } from "lucide-react";
import { fetchPermitLetter, type PermitLetter } from "@/lib/building-permit-api";
import { PermitLetterView } from "@/components/building-permit/permit-letter";

/** Printable permit for the applicant. The status page passes application no + mobile through sessionStorage (not the URL). */
export default function PublicPermitPage() {
  const [p, setP] = useState<PermitLetter | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let creds: { applicationNo: string; mobile: string } | null = null;
    try {
      creds = JSON.parse(sessionStorage.getItem("bp_lookup") ?? "null");
    } catch {
      creds = null;
    }
    if (!creds) {
      setError("Open the permit from the Track Application page.");
      return;
    }
    fetchPermitLetter(creds.applicationNo, creds.mobile).then(setP).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  if (error) return <p className="p-10 text-center text-sm text-red-700">{error}</p>;
  if (!p) return <Loader2 className="mx-auto mt-20 h-6 w-6 animate-spin text-slate-400" />;
  return (
    <div className="min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[780px] justify-end print:hidden">
        <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-md bg-nnm-blue px-4 py-2 text-sm font-semibold text-white">
          <Printer className="h-4 w-4" /> Print / Save as PDF
        </button>
      </div>
      <PermitLetterView p={p} />
    </div>
  );
}
