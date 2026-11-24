"use client";

import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { AttendanceHeader } from "@/components/attendance/attendance-header";
import { useAttendanceGuard } from "@/lib/use-attendance-guard";
import type { AttendanceRole } from "@/lib/attendance-auth";
import {
  ONGOING_STAGES,
  PAST_STAGES,
  PROJECT_ROLES,
  STAGE_LABELS,
  fetchProjects,
  fetchWardReport,
  rupees,
  type ProjectStage,
} from "@/lib/project-api";
import { BackLink, Card, ErrorLine, Spinner, downloadCsv, inputClass, labelClass, outlineBtn } from "@/components/projects/parts";

type Row = Awaited<ReturnType<typeof fetchWardReport>>[number];

/** Ward-wise report of ongoing or finished (past) projects: count per stage, and the money. */
export default function ProjectWardReportPage() {
  const user = useAttendanceGuard(PROJECT_ROLES as AttendanceRole[]);
  const [group, setGroup] = useState<"ongoing" | "past">("ongoing");
  const [discipline, setDiscipline] = useState("");
  const [financialYear, setFinancialYear] = useState("");
  const [years, setYears] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setRows(null);
    fetchWardReport({ group, discipline, financialYear })
      .then(setRows)
      .catch((e) => setError(e.message));
  }, [user, group, discipline, financialYear]);
  useEffect(() => {
    if (user)
      fetchProjects({ q: "-no-match-" })
        .then((r) => setYears(r.years))
        .catch(() => {});
  }, [user]);

  const stages: ProjectStage[] = group === "ongoing" ? ONGOING_STAGES : PAST_STAGES;
  const table = useMemo(() => {
    const byWard = new Map<
      string,
      { ward: string; counts: Record<string, number>; total: number; estimated: number; workOrder: number; paid: number }
    >();
    for (const r of rows ?? []) {
      const w = byWard.get(r.ward_id ?? "city") ?? { ward: r.ward_name, counts: {}, total: 0, estimated: 0, workOrder: 0, paid: 0 };
      w.counts[r.stage] = (w.counts[r.stage] ?? 0) + r.count;
      w.total += r.count;
      w.estimated += Number(r.estimated);
      w.workOrder += Number(r.work_order);
      w.paid += Number(r.paid);
      byWard.set(r.ward_id ?? "city", w);
    }
    return [...byWard.values()];
  }, [rows]);
  const totals = table.reduce(
    (a, w) => {
      for (const s of stages) a.counts[s] = (a.counts[s] ?? 0) + (w.counts[s] ?? 0);
      a.total += w.total;
      a.estimated += w.estimated;
      a.workOrder += w.workOrder;
      a.paid += w.paid;
      return a;
    },
    { counts: {} as Record<string, number>, total: 0, estimated: 0, workOrder: 0, paid: 0 },
  );

  function download() {
    downloadCsv(`projects-${group}${financialYear ? `-${financialYear}` : ""}-ward-wise.csv`, [
      [
        "Ward",
        ...stages.map((s) => STAGE_LABELS[s]),
        "Total",
        "Estimated cost",
        "Work order amount",
        ...(group === "past" ? ["Paid"] : []),
      ],
      ...table.map((w) => [
        w.ward,
        ...stages.map((s) => w.counts[s] ?? 0),
        w.total,
        w.estimated,
        w.workOrder,
        ...(group === "past" ? [w.paid] : []),
      ]),
      [
        "Total",
        ...stages.map((s) => totals.counts[s] ?? 0),
        totals.total,
        totals.estimated,
        totals.workOrder,
        ...(group === "past" ? [totals.paid] : []),
      ],
    ]);
  }

  if (!user) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading...</div>;
  return (
    <div className="min-h-screen bg-slate-50">
      <AttendanceHeader user={user} />
      <main className="mx-auto max-w-7xl space-y-5 px-4 py-8 sm:px-6">
        <BackLink href="/attendance/projects" label="Projects" />
        <h1 className="text-2xl font-semibold text-slate-900">Ward-wise project report</h1>
        <Card
          title={group === "ongoing" ? "Ongoing projects" : "Finished and past projects"}
          right={
            <button className={outlineBtn} onClick={download} disabled={!table.length}>
              <Download className="h-4 w-4" /> Download (Excel / CSV)
            </button>
          }
        >
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className={labelClass}>Projects</label>
              <select className={inputClass} value={group} onChange={(e) => setGroup(e.target.value as "ongoing" | "past")}>
                <option value="ongoing">Ongoing</option>
                <option value="past">Finished / past</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Financial year</label>
              <select className={inputClass} value={financialYear} onChange={(e) => setFinancialYear(e.target.value)}>
                <option value="">All years</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Type</label>
              <select className={inputClass} value={discipline} onChange={(e) => setDiscipline(e.target.value)}>
                <option value="">Civil and mechanical</option>
                <option value="civil">Civil</option>
                <option value="mechanical">Mechanical</option>
              </select>
            </div>
          </div>
          <ErrorLine error={error} />
          {!rows ? (
            <Spinner />
          ) : table.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No projects.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3">Ward</th>
                    {stages.map((s) => (
                      <th key={s} className="py-2 pr-3 text-right">
                        {STAGE_LABELS[s]}
                      </th>
                    ))}
                    <th className="py-2 pr-3 text-right">Total</th>
                    <th className="py-2 pr-3 text-right">Estimated</th>
                    <th className="py-2 pr-3 text-right">Work order</th>
                    {group === "past" && <th className="py-2 pr-3 text-right">Paid</th>}
                  </tr>
                </thead>
                <tbody>
                  {[...table, { ward: "Total", ...totals }].map((w) => (
                    <tr key={w.ward} className={`border-b border-slate-100 ${w.ward === "Total" ? "font-semibold" : ""}`}>
                      <td className="py-2 pr-3 whitespace-nowrap">{w.ward}</td>
                      {stages.map((s) => (
                        <td key={s} className="py-2 pr-3 text-right">
                          {w.counts[s] ?? 0}
                        </td>
                      ))}
                      <td className="py-2 pr-3 text-right">{w.total}</td>
                      <td className="py-2 pr-3 text-right whitespace-nowrap">{rupees(w.estimated)}</td>
                      <td className="py-2 pr-3 text-right whitespace-nowrap">{rupees(w.workOrder)}</td>
                      {group === "past" && <td className="py-2 pr-3 text-right whitespace-nowrap">{rupees(w.paid)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}
