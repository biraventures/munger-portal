"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { fetchPendingSummary, formatDuration, type PendingSummary } from "@/lib/mutation-api";

/** Mutation dashboard: how many cases are waiting at each desk (and who holds that login), oldest first-in waiting time. */
export function MutationPendingSummary({ highlight }: { highlight?: string }) {
  const [s, setS] = useState<PendingSummary | null>(null);

  useEffect(() => {
    fetchPendingSummary()
      .then(setS)
      .catch(() => undefined);
  }, []);

  if (!s) return null;
  return (
    <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-900">Mutations pending at each desk</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {s.desks.map((d) => (
          <div key={d.stage} className={`rounded-lg border p-3 ${highlight === d.stage ? "border-nnm-blue bg-blue-50" : "border-slate-200"}`}>
            <p className="text-xs font-medium text-slate-500">{d.label}</p>
            <p className="text-2xl font-semibold text-slate-900">{d.mutations}</p>
            {d.otherChanges > 0 && <p className="text-[11px] text-slate-500">+ {d.otherChanges} other change{d.otherChanges === 1 ? "" : "s"}</p>}
            {d.oldestMinutes !== null && (
              <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-700">
                <Clock className="h-3 w-3" /> oldest {formatDuration(d.oldestMinutes)}
              </p>
            )}
            <p className="mt-1 truncate text-[11px] text-slate-400" title={d.logins.join(", ")}>
              {d.logins.length ? d.logins.join(", ") : "no login"}
            </p>
          </div>
        ))}
        <div className={`rounded-lg border p-3 ${highlight === "tax_daroga" ? "border-nnm-blue bg-blue-50" : "border-slate-200"}`}>
          <p className="text-xs font-medium text-slate-500">Online — holding to be identified</p>
          <p className="text-2xl font-semibold text-slate-900">{s.awaitingHolding.count}</p>
          {s.awaitingHolding.oldestMinutes !== null && <p className="mt-1 text-[11px] text-amber-700">oldest {formatDuration(s.awaitingHolding.oldestMinutes)}</p>}
          <p className="mt-1 text-[11px] text-slate-400">Tax Daroga</p>
        </div>
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="text-xs font-medium text-slate-500">Sent back for correction</p>
          <p className="text-2xl font-semibold text-slate-900">{s.sentBack.online + s.sentBack.counter}</p>
          <p className="text-[11px] text-slate-500">
            {s.sentBack.online} with applicant · {s.sentBack.counter} with operator
          </p>
          {s.sentBack.oldestMinutes !== null && <p className="mt-1 text-[11px] text-amber-700">oldest {formatDuration(s.sentBack.oldestMinutes)}</p>}
        </div>
      </div>
    </section>
  );
}
