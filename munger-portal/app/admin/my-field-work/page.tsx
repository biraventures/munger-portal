"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ClipboardList, Loader2 } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { fetchSurveyorWork, type SurveyorWorkItem, type SurveyorWorkType } from "@/lib/admin-api";

const LABEL: Record<SurveyorWorkType, string> = {
  new_holding: "New holding - field verification",
  mutation: "Mutation - field report",
  remeasurement: "Remeasurement",
  migrated_survey: "Old holding survey",
};
const TONE: Record<SurveyorWorkType, string> = {
  new_holding: "bg-blue-100 text-blue-800",
  mutation: "bg-purple-100 text-purple-800",
  remeasurement: "bg-amber-100 text-amber-800",
  migrated_survey: "bg-teal-100 text-teal-800",
};
const linkOf = (w: SurveyorWorkItem) =>
  w.type === "new_holding"
    ? "/admin/new-holding-requests"
    : w.type === "mutation"
      ? `/admin/change-requests/${w.id}`
      : w.type === "migrated_survey"
        ? "/admin/migrated-holdings-my-surveys"
        : `/admin/property-discrepancy-requests/${w.id}`;
const since = (v: string) => {
  const d = Math.floor((Date.now() - new Date(v).getTime()) / 86400000);
  return d <= 0 ? "today" : d === 1 ? "1 day" : `${d} days`;
};

/** Tax Surveyor: everything waiting for him, in one list - new holdings, mutations, remeasurements, old holding surveys. */
export default function MyFieldWorkPage() {
  const admin = useAdminGuard();
  const [items, setItems] = useState<SurveyorWorkItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (admin?.role === "tax_surveyor") fetchSurveyorWork().then(setItems).catch((e) => setError(e instanceof Error ? e.message : "Could not load your work."));
  }, [admin]);

  if (!admin) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  if (admin.role !== "tax_surveyor") {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <main className="mx-auto max-w-2xl px-6 py-10">
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" /> This page is for Tax Surveyors.
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <ClipboardList className="h-6 w-6" /> My Field Work
        </h1>
        <p className="mt-1 text-sm text-slate-500">Every request assigned to you, in one place. Open one to do the field visit and submit your report.</p>
        {error && (
          <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        {items === null ? (
          <p className="mt-6 flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </p>
        ) : items.length === 0 ? (
          <p className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-400">Nothing is waiting for you.</p>
        ) : (
          <ul className="mt-5 space-y-3">
            {items.map((w) => (
              <li key={`${w.type}:${w.id}`}>
                <Link href={linkOf(w)} className="block rounded-xl border border-slate-200 bg-white p-4 hover:border-nnm-blue">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${TONE[w.type]}`}>{LABEL[w.type]}</span>
                    <span className="font-semibold text-nnm-blue">{w.reference}</span>
                    {w.holding_no && <span className="font-mono text-xs text-slate-600">{w.holding_no}</span>}
                  </div>
                  <p className="mt-1 text-sm text-slate-700">
                    {w.owner ?? "-"}
                    {w.ward ? ` · Ward ${w.ward}` : ""} <span className="text-xs text-slate-400">· waiting {since(w.waiting_since)}</span>
                  </p>
                  {!w.surveyor_username && <p className="mt-0.5 text-xs text-amber-700">Not yet given to a particular surveyor - any surveyor may take it.</p>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
