"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Clock, Edit3, FileCheck2, Forward, Link2, Loader2, RotateCcw, Send, XCircle } from "lucide-react";
import { DESK_LABEL, fetchTimeline, formatDuration, TIMELINE_LABEL, type MutationTimeline as Timeline, type TimelineKind } from "@/lib/mutation-api";

const ICON: Record<TimelineKind, { icon: typeof Clock; tone: string }> = {
  submitted: { icon: Send, tone: "text-nnm-blue" },
  holding_linked: { icon: Link2, tone: "text-nnm-blue" },
  entered_chain: { icon: Send, tone: "text-slate-400" },
  forwarded: { icon: Forward, tone: "text-green-600" },
  approved: { icon: CheckCircle2, tone: "text-green-700" },
  rejected: { icon: XCircle, tone: "text-red-600" },
  not_accepted: { icon: XCircle, tone: "text-red-600" },
  sent_back: { icon: RotateCcw, tone: "text-amber-600" },
  resubmitted: { icon: Send, tone: "text-nnm-blue" },
  applicant_edited: { icon: Edit3, tone: "text-slate-500" },
  area_verified: { icon: FileCheck2, tone: "text-green-600" },
};

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Audit trail of one mutation case with the time spent at each desk. Pass a change request id or an application id. */
export function MutationTimeline({ changeRequestId, applicationId }: { changeRequestId?: string | number; applicationId?: string }) {
  const [t, setT] = useState<Timeline | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setT(null);
    fetchTimeline({ changeRequestId, applicationId })
      .then(setT)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the audit trail."));
  }, [changeRequestId, applicationId]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!t)
    return (
      <p className="flex items-center gap-2 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading audit trail…
      </p>
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-xs">
        {t.deskTimes.map((d) => (
          <span key={d.desk} className={`rounded-full px-2.5 py-1 ${d.ongoing ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700"}`}>
            {d.label}: <b>{formatDuration(d.minutes)}</b>
            {d.visits > 1 ? ` (${d.visits} times)` : ""}
            {d.ongoing ? " · now" : ""}
          </span>
        ))}
        <span className="rounded-full bg-nnm-blue/10 px-2.5 py-1 text-nnm-blue">
          Total: <b>{formatDuration(t.totalMinutes)}</b>
          {t.currentDesk ? " so far" : ""}
        </span>
      </div>

      <ol className="relative space-y-3 border-l border-slate-200 pl-5">
        {t.events.map((e, i) => {
          const { icon: Icon, tone } = ICON[e.kind];
          const d = e.details as Record<string, string | number | boolean> | null;
          return (
            <li key={i} className="relative text-sm">
              <span className="absolute -left-[27px] top-0.5 rounded-full bg-white p-0.5">
                <Icon className={`h-4 w-4 ${tone}`} />
              </span>
              <p className="text-slate-800">
                <b>{TIMELINE_LABEL[e.kind]}</b>
                {e.stage && e.kind !== "entered_chain" ? ` — ${DESK_LABEL[e.stage] ?? e.stage}` : ""}
                <span className="text-slate-500"> · {e.actor}</span>
              </p>
              <p className="text-xs text-slate-500">
                {when(e.at)}
                {e.minutesAtDesk !== null && <> · at this desk for <b>{formatDuration(e.minutesAtDesk)}</b></>}
              </p>
              {e.comment && <p className="mt-0.5 text-slate-600">&ldquo;{e.comment}&rdquo;</p>}
              {e.kind === "area_verified" && d && (
                <p className="mt-0.5 text-xs text-slate-600">
                  Jamabandi {String(d.jamabandiAreaSqft)} · Document {String(d.documentAreaSqft)} · Holding {String(d.holdingAreaSqft)} sq ft
                  {d.areasMatch ? " — match" : " — DIFFER"} · Khata {String(d.khataNo)}, Khesra {String(d.khesraNo)}, Sheet {String(d.surveySheetNo)}, Ward {String(d.surveyWard)}
                </p>
              )}
            </li>
          );
        })}
        {t.currentDesk && (
          <li className="relative text-sm">
            <span className="absolute -left-[27px] top-0.5 rounded-full bg-white p-0.5">
              <Clock className="h-4 w-4 text-amber-600" />
            </span>
            <p className="font-semibold text-amber-800">
              Now with {DESK_LABEL[t.currentDesk] ?? t.currentDesk} — waiting {formatDuration(t.minutesAtCurrentDesk)}
            </p>
          </li>
        )}
      </ol>
    </div>
  );
}
