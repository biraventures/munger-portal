/** Where a citizen's complaint stands: City Manager verification first, then the contractor's repair. */
export type ReportStage = "pending" | "rejected" | "approved" | "repaired";

const fmtDate = (v: string | null) => (v ? new Date(v).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" }) : "");

export function ReportStageCell({ stage, repairedOn, reason }: { stage: ReportStage; repairedOn: string | null; reason: string | null }) {
  if (stage === "pending") return <span className="font-semibold text-blue-700">Awaiting verification by the City Manager</span>;
  if (stage === "rejected")
    return (
      <span className="font-semibold text-red-700">
        Not accepted{reason ? <span className="block font-normal text-slate-600">Reason: {reason}</span> : null}
      </span>
    );
  if (stage === "repaired") return <span className="font-semibold text-green-700">Repaired {fmtDate(repairedOn)}</span>;
  return <span className="font-semibold text-amber-700">Verified - with the contractor for repair</span>;
}

/** The status pill for an asset with a complaint still waiting for verification. */
export function PendingPill({ on }: { on: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-800">
      Reported {fmtDate(on)} - being verified
    </span>
  );
}
