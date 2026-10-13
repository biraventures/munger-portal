"use client";

import { useState } from "react";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { exemptionFromInput, exemptionFromProperty, openExemptionOrder, type TaxExemptionInput } from "@/lib/tax-exemption-api";

/**
 * Reviewer view of a holding tax exemption change inside a property change request:
 * what is on record now vs what is proposed, and the scanned order to check it against.
 * Renders nothing when the request does not touch the exemption.
 */
export function TaxExemptionReview({ current, proposed }: { current: Record<string, unknown> | null; proposed: unknown }) {
  const [err, setErr] = useState<string | null>(null);
  const next = exemptionFromInput(proposed as TaxExemptionInput | undefined);
  if (!next) return null;
  const now = exemptionFromProperty(current ?? {});

  const rows: [string, string, string][] = [
    ["Exempt from holding tax", now.isExempt ? "Yes" : "No", next.isExempt ? "Yes" : "No"],
    ["Category", now.isExempt ? now.category : "—", next.isExempt ? next.category : "—"],
    ["Order number", now.isExempt ? now.orderNo : "—", next.isExempt ? next.orderNo : "—"],
    ["Order date", now.isExempt ? now.orderDate : "—", next.isExempt ? next.orderDate : "—"],
    ["Exempt from year", now.isExempt ? now.fromYear : "—", next.isExempt ? next.fromYear : "—"],
    ["Remarks", now.isExempt ? now.remarks || "—" : "—", next.isExempt ? next.remarks || "—" : "—"],
  ];
  const unchanged = rows.every(([, a, b]) => a === b) && now.orderDocId === next.orderDocId;
  if (unchanged) return null;

  const open = (id: string) => openExemptionOrder(id, "admin").catch((e) => setErr(e instanceof Error ? e.message : "Could not open."));

  return (
    <section className="rounded-xl border border-amber-300 bg-amber-50 p-6">
      <h2 className="mb-1 flex items-center gap-2 text-base font-semibold text-slate-900">
        <ShieldCheck className="h-4 w-4 text-amber-700" /> Holding tax exemption
      </h2>
      <p className="mb-4 text-xs text-amber-900">
        {next.isExempt
          ? `If approved, no holding tax is charged from ${next.fromYear} onward; arrears for earlier years stay payable. The solid waste user charge continues.`
          : "If approved, the exemption is removed and holding tax is charged again."}{" "}
        Check the details against the order copy before approving.
      </p>
      <div className="overflow-hidden rounded-lg border border-amber-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2.5 font-medium">Field</th>
              <th className="px-4 py-2.5 font-medium">Current</th>
              <th className="px-4 py-2.5 font-medium">Proposed</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, a, b]) => (
              <tr key={label} className={`border-b border-slate-100 last:border-0 ${a !== b ? "bg-amber-50" : ""}`}>
                <td className="px-4 py-2.5 text-slate-500">{label}</td>
                <td className="px-4 py-2.5">{a || "—"}</td>
                <td className={`px-4 py-2.5 ${a !== b ? "font-semibold text-amber-800" : ""}`}>{b || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-sm">
        {next.isExempt && next.orderDocId && (
          <button type="button" onClick={() => open(next.orderDocId)} className="inline-flex items-center gap-1.5 font-semibold text-nnm-blue hover:underline">
            <ExternalLink className="h-4 w-4" /> Open order copy
          </button>
        )}
        {now.isExempt && now.orderDocId && now.orderDocId !== next.orderDocId && (
          <button type="button" onClick={() => open(now.orderDocId)} className="inline-flex items-center gap-1.5 text-slate-600 hover:underline">
            <ExternalLink className="h-4 w-4" /> Order currently on record
          </button>
        )}
      </div>
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
    </section>
  );
}
