"use client";

import { useEffect, useState } from "react";
import { AlertCircle, ClipboardList, CheckCircle2, XCircle } from "lucide-react";
import { AttendanceHeader } from "@/components/attendance/attendance-header";
import { useAttendanceGuard } from "@/lib/use-attendance-guard";
import { fetchFaultAuditTrail, type FaultAuditTrailEntry } from "@/lib/streetlight-api";

/**
 * Flat, most-recent-first log of every Mark Defective/Mark Functional
 * action, city-wide - who raised each fault and who closed it out.
 * ward_parshad only sees their own ward (the backend scopes it, same
 * as the status dashboard). Same viewer set as the status dashboards:
 * City Manager/DMC/Commissioner/attendance_admin, plus Mayor/Deputy
 * Mayor/Ward Parshad.
 */
const ALLOWED_ROLES = ["city_manager", "deputy_municipal_commissioner", "municipal_commissioner", "attendance_admin", "mayor", "deputy_mayor", "ward_parshad"];

export default function StreetlightFaultAuditTrailPage() {
  const attendance = useAttendanceGuard();
  const [trail, setTrail] = useState<FaultAuditTrailEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!attendance || !ALLOWED_ROLES.includes(attendance.role)) return;
    fetchFaultAuditTrail()
      .then(setTrail)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the fault audit trail."));
  }, [attendance]);

  if (!attendance) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  if (!ALLOWED_ROLES.includes(attendance.role)) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AttendanceHeader user={attendance} />
        <main className="mx-auto max-w-2xl px-6 py-10">
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            This is restricted to City Manager, Deputy Municipal Commissioner, Municipal Commissioner, Mayor, Deputy Mayor, and Ward Parshad.
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AttendanceHeader user={attendance} />

      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <ClipboardList className="h-6 w-6" />
          Streetlight Fault Audit Trail
        </h1>
        <p className="mb-6 text-sm text-slate-500">Every light marked defective or functional, most recent first, with who did it. Last 300 actions.</p>

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {!trail ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : trail.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">No fault activity recorded yet.</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase text-slate-500">
                  <th className="px-4 py-2.5">Light</th>
                  <th className="px-4 py-2.5">Ward / Street</th>
                  <th className="px-4 py-2.5">Marked Defective</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Marked Functional</th>
                  <th className="px-4 py-2.5">Notes</th>
                </tr>
              </thead>
              <tbody>
                {trail.map((f) => (
                  <tr key={f.faultId} className="border-b border-slate-50 align-top last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-700">
                      {f.serialNumber ?? "—"}
                      {f.lightType === "high_mast" && <span className="ml-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-500">High Mast</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-600">
                      {f.wardName ?? "—"}
                      {f.startPoint && <div className="text-slate-400">{f.endPoint ? `${f.startPoint} - ${f.endPoint}` : f.startPoint}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      <div className="flex items-center gap-1 text-red-700">
                        <XCircle className="h-3.5 w-3.5" />
                        {new Date(f.reportedAt).toLocaleString("en-IN")}
                      </div>
                      <div className="text-slate-500">{f.reportedByName ?? (f.reportedByType === "public" ? "Public report" : "—")}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      {f.status === "open" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-red-700">Open</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-green-700">Repaired</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      {f.repairedAt ? (
                        <>
                          <div className="flex items-center gap-1 text-green-700">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {new Date(f.repairedAt).toLocaleString("en-IN")}
                          </div>
                          <div className="text-slate-500">{f.repairedByName ?? "—"}</div>
                        </>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-600">
                      {f.reporterNotes && <div>Reported: {f.reporterNotes}</div>}
                      {f.repairNotes && <div>Repaired: {f.repairNotes}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
