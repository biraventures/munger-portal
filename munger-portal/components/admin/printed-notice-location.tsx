import { BookOpen } from "lucide-react";
import type { NoticePrintPosition } from "@/lib/agency-api";

const STATUS: Record<NoticePrintPosition["noticeStatus"], string> = {
  open: "",
  paid: " - already paid",
  superseded: " - replaced by a newer notice",
  cancelled: " - cancelled, do not serve",
};

/** Where this holding's demand notice is in the printed ward bundle - the Sl. No. printed in the corner of the notice. */
export function PrintedNoticeLocation({ positions }: { positions: NoticePrintPosition[] | null }) {
  if (positions === null) return null;
  if (positions.length === 0) {
    return <p className="mb-3 text-xs text-slate-500">This holding&apos;s notice is not in any ward bundle printed with Sl. Nos.</p>;
  }
  const [latest, ...older] = positions;
  const when = (v: string) => new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  return (
    <div className="mb-3 rounded-lg border-2 border-nnm-blue bg-blue-50 p-3 text-sm text-slate-800">
      <div className="flex items-start gap-2">
        <BookOpen className="mt-0.5 h-5 w-5 shrink-0 text-nnm-blue" />
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-nnm-blue">Find the printed notice</div>
          <div className="mt-0.5 text-base">
            Ward {latest!.ward ?? "-"} bundle of {when(latest!.printedAt)} · Part {latest!.partNo} of {latest!.partCount} ·{" "}
            <b className="text-lg">Sl. No. {latest!.serialNo}</b> <span className="text-slate-500">of {latest!.partSize}</span>
          </div>
          <div className="text-xs text-slate-600">
            Notice {latest!.demandNo}
            {STATUS[latest!.noticeStatus]}
            {latest!.printedBy ? ` · printed by ${latest!.printedBy}` : ""}
          </div>
          {older.length > 0 && (
            <div className="mt-1 text-xs text-slate-500">
              Earlier prints:{" "}
              {older.map((o) => `${when(o.printedAt)} Part ${o.partNo}/${o.partCount} Sl. ${o.serialNo}`).join("; ")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
