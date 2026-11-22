"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BarChart3, Download, FileSpreadsheet, Loader2, PlusCircle, Search, Upload, UserCog } from "lucide-react";
import { AttendanceHeader } from "@/components/attendance/attendance-header";
import { useAttendanceGuard } from "@/lib/use-attendance-guard";
import type { AttendanceRole } from "@/lib/attendance-auth";
import { fetchAttendanceWards, type AttendanceWard } from "@/lib/attendance-api";
import {
  DISCIPLINE_LABELS,
  ENGINEER_LOGIN_ROLES,
  ONGOING_STAGES,
  PAST_STAGES,
  PROJECT_ADMIN_ROLES,
  PROJECT_ENTRY_ROLES,
  PROJECT_ROLES,
  PROJECT_STAGES,
  STAGE_LABELS,
  bulkUpload,
  categoryLabel,
  downloadReportFormat,
  downloadTemplate,
  fetchProjects,
  fileToBase64,
  formatDate,
  rupees,
  type ImportResult,
  type Project,
  type ProjectFilter,
  type StageCount,
} from "@/lib/project-api";
import {
  Card,
  ErrorLine,
  Spinner,
  StagePill,
  downloadCsv,
  inputClass,
  labelClass,
  outlineBtn,
  primaryBtn,
} from "@/components/projects/parts";

const monitorsOf = (p: Project) =>
  [
    p.je_civil_name && `JE-C: ${p.je_civil_name}`,
    p.ae_civil_name && `AE-C: ${p.ae_civil_name}`,
    p.je_mechanical_name && `JE-M: ${p.je_mechanical_name}`,
    p.ae_mechanical_name && `AE-M: ${p.ae_mechanical_name}`,
  ]
    .filter((x) => x && (p.discipline === "both" || x.includes(p.discipline === "civil" ? "-C:" : "-M:")))
    .join(", ");

export default function ProjectsPage() {
  const user = useAttendanceGuard(PROJECT_ROLES as AttendanceRole[]);
  const isEngineer = !!user && ENGINEER_LOGIN_ROLES.includes(user.role);
  const canEnter = !!user && PROJECT_ENTRY_ROLES.includes(user.role);
  const isAdmin = !!user && PROJECT_ADMIN_ROLES.includes(user.role);

  const [wards, setWards] = useState<AttendanceWard[]>([]);
  const [filter, setFilter] = useState<ProjectFilter>({ group: "" });
  const [search, setSearch] = useState("");
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [counts, setCounts] = useState<StageCount[]>([]);
  const [years, setYears] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetchProjects(filter);
      setProjects(r.projects);
      setCounts(r.counts);
      setYears(r.years);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load projects.");
    }
  }, [filter]);

  useEffect(() => {
    if (!user) return;
    fetchAttendanceWards()
      .then(setWards)
      .catch(() => {});
  }, [user]);
  useEffect(() => {
    if (user) load();
  }, [user, load]);

  if (!user) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading...</div>;

  const sum = (stages: string[]) => counts.filter((c) => stages.includes(c.stage)).reduce((a, c) => a + c.count, 0);
  const setStage = (stage: string) => setFilter((f) => ({ ...f, stage: f.stage === stage ? "" : stage, group: "" }));
  const setGroup = (group: "" | "ongoing" | "past") => setFilter((f) => ({ ...f, group: f.group === group ? "" : group, stage: "" }));

  function exportList() {
    if (!projects) return;
    downloadCsv("projects.csv", [
      [
        "Code",
        "Name",
        "Ward",
        "Location",
        "Scheme",
        "Category",
        "Discipline",
        "Stage",
        "Estimated cost",
        "Work order amount",
        "Agency",
        "Target date",
        "Start",
        "Completion",
        "Payment",
        "Monitors",
      ],
      ...projects.map((p) => [
        p.project_code,
        p.name,
        p.ward_name,
        p.location_text,
        p.scheme_name,
        categoryLabel(p.category),
        DISCIPLINE_LABELS[p.discipline],
        STAGE_LABELS[p.stage],
        p.estimated_cost,
        p.work_order_amount,
        p.agency_name,
        formatDate(p.target_completion_date),
        formatDate(p.actual_start_date),
        formatDate(p.actual_completion_date),
        p.payment_amount,
        monitorsOf(p),
      ]),
    ]);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AttendanceHeader user={user} />
      <main className="mx-auto max-w-7xl space-y-5 px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{isEngineer ? "My Projects" : "Project Monitoring"}</h1>
            <p className="text-sm text-slate-500">
              {isEngineer
                ? "Projects in the wards assigned to you, and the ones the Commissioner has given you."
                : "Every project by stage, from approval to payment."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canEnter && (
              <Link href="/attendance/projects/new" className={primaryBtn}>
                <PlusCircle className="h-4 w-4" /> Add project
              </Link>
            )}
            <Link href="/attendance/projects/report" className={outlineBtn}>
              <BarChart3 className="h-4 w-4" /> Ward-wise report
            </Link>
            {isAdmin && (
              <Link href="/attendance/projects/engineers" className={outlineBtn}>
                <UserCog className="h-4 w-4" /> Assign wards to JE / AE
              </Link>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          <button
            onClick={() => setGroup("ongoing")}
            className={`rounded-xl border p-4 text-left ${filter.group === "ongoing" ? "border-nnm-blue ring-2 ring-nnm-blue/30" : "border-slate-200"} bg-white`}
          >
            <p className="text-xs font-medium text-slate-500">All ongoing</p>
            <p className="text-2xl font-semibold text-slate-900">{sum(ONGOING_STAGES)}</p>
          </button>
          <button
            onClick={() => setGroup("past")}
            className={`rounded-xl border p-4 text-left ${filter.group === "past" ? "border-nnm-blue ring-2 ring-nnm-blue/30" : "border-slate-200"} bg-white`}
          >
            <p className="text-xs font-medium text-slate-500">All finished</p>
            <p className="text-2xl font-semibold text-slate-900">{sum(PAST_STAGES)}</p>
          </button>
          {PROJECT_STAGES.map((s) => {
            const c = counts.find((x) => x.stage === s);
            return (
              <button
                key={s}
                onClick={() => setStage(s)}
                className={`rounded-xl border p-4 text-left ${filter.stage === s ? "border-nnm-blue ring-2 ring-nnm-blue/30" : "border-slate-200"} bg-white`}
              >
                <p className="text-xs font-medium text-slate-500">{STAGE_LABELS[s]}</p>
                <p className="text-2xl font-semibold text-slate-900">{c?.count ?? 0}</p>
                {!!c?.count && Number(c.estimated) > 0 && <p className="text-xs text-slate-400">Est. {rupees(c.estimated)}</p>}
              </button>
            );
          })}
        </div>

        {canEnter && <BulkUpload onDone={load} />}

        <Card
          title={projects ? `${projects.length} project${projects.length === 1 ? "" : "s"}` : "Projects"}
          right={
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => downloadReportFormat(filter).catch((e) => setError(e.message))}
                className={outlineBtn}
                disabled={!projects?.length}
              >
                <FileSpreadsheet className="h-4 w-4" /> Download (3 Years Report format)
              </button>
              <button onClick={exportList} className={outlineBtn} disabled={!projects?.length}>
                <Download className="h-4 w-4" /> Short list (CSV)
              </button>
            </div>
          }
        >
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-5">
            <div>
              <label className={labelClass}>Ward</label>
              <select
                className={inputClass}
                value={filter.wardId ?? ""}
                onChange={(e) => setFilter((f) => ({ ...f, wardId: e.target.value }))}
              >
                <option value="">All wards</option>
                <option value="0">City-wide works (no ward)</option>
                {wards.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.wardName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Financial year</label>
              <select
                className={inputClass}
                value={filter.financialYear ?? ""}
                onChange={(e) => setFilter((f) => ({ ...f, financialYear: e.target.value }))}
              >
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
              <select
                className={inputClass}
                value={filter.discipline ?? ""}
                onChange={(e) => setFilter((f) => ({ ...f, discipline: e.target.value }))}
              >
                <option value="">Civil and mechanical</option>
                <option value="civil">Civil</option>
                <option value="mechanical">Mechanical</option>
                <option value="both">Only joint (civil + mechanical)</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Stage</label>
              <select
                className={inputClass}
                value={filter.stage || (filter.group ? `group:${filter.group}` : "")}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v.startsWith("group:")) setFilter((f) => ({ ...f, group: v.slice(6) as "ongoing" | "past", stage: "" }));
                  else setFilter((f) => ({ ...f, stage: v, group: "" }));
                }}
              >
                <option value="">All stages</option>
                <option value="group:ongoing">All ongoing</option>
                <option value="group:past">All finished / past</option>
                {PROJECT_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {STAGE_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setFilter((f) => ({ ...f, q: search.trim() }));
              }}
            >
              <label className={labelClass}>Search</label>
              <div className="flex gap-2">
                <input
                  className={inputClass}
                  placeholder="Name, code, place, agency"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <button className={outlineBtn} aria-label="Search">
                  <Search className="h-4 w-4" />
                </button>
              </div>
            </form>
          </div>

          <ErrorLine error={error} />
          {!projects ? (
            <Spinner />
          ) : projects.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No projects match.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3">Project</th>
                    <th className="py-2 pr-3">Ward</th>
                    <th className="py-2 pr-3">Type</th>
                    <th className="py-2 pr-3">Stage</th>
                    <th className="py-2 pr-3 text-right">Estimate</th>
                    <th className="py-2 pr-3 text-right">Progress</th>
                    <th className="py-2 pr-3">Monitored by</th>
                    <th className="py-2 pr-3 text-center">Photos</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((p) => (
                    <tr key={p.id} className="border-b border-slate-100 align-top hover:bg-slate-50">
                      <td className="py-2.5 pr-3">
                        <Link href={`/attendance/projects/${p.id}`} className="font-medium text-nnm-blue hover:underline">
                          {p.name}
                        </Link>
                        <div className="text-xs text-slate-400">
                          {p.project_code}
                          {p.location_text ? ` · ${p.location_text}` : ""}
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 whitespace-nowrap">{p.ward_name}</td>
                      <td className="py-2.5 pr-3">
                        {categoryLabel(p.category)}
                        <div className="text-xs text-slate-400">{DISCIPLINE_LABELS[p.discipline]}</div>
                      </td>
                      <td className="py-2.5 pr-3">
                        <StagePill stage={p.stage} />
                      </td>
                      <td className="py-2.5 pr-3 text-right whitespace-nowrap">{rupees(p.estimated_cost)}</td>
                      <td className="py-2.5 pr-3 text-right whitespace-nowrap text-xs">
                        {p.physical_progress_pct !== null ? `${Number(p.physical_progress_pct)}%` : "-"}
                        {p.financial_progress_pct !== null && (
                          <div className="text-slate-400">Fin. {Number(p.financial_progress_pct)}%</div>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-slate-600">
                        {monitorsOf(p) || <span className="text-amber-700">No engineer assigned</span>}
                      </td>
                      <td className="py-2.5 pr-3 text-center">{p.photo_count}</td>
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

function BulkUpload({ onDone }: { onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return setError("Choose the Excel or CSV file first.");
    if (file.size > 7 * 1024 * 1024) return setError("The file is too large - at most 7 MB.");
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await bulkUpload(await fileToBase64(file)));
      if (fileRef.current) fileRef.current.value = "";
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Bulk upload - 3 Years Report format">
      <p className="mb-3 text-sm text-slate-600">
        Upload the scheme sheet in the 3 Years Report format, as Excel (.xlsx) or CSV, exactly as it is prepared - columns are read by their
        headings. The estimate cost, ward and scheme are read from the name of work when there is no separate column, the type of work is
        guessed from the name, and the stage is worked out from the dates and progress. Blank ward = a city-wide work.
      </p>
      <p className="mb-3 text-sm text-slate-600">
        Upload the same sheet again whenever it is updated: works already entered (same name and financial year) are updated with the filled
        cells - blank or &quot;-&quot; cells never erase anything - and the stage only moves forward.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => downloadTemplate().catch((e) => setError(e.message))} className={outlineBtn}>
          <FileSpreadsheet className="h-4 w-4" /> Download template
        </button>
        <input ref={fileRef} type="file" accept=".xlsx,.csv,text/csv" className="text-sm" />
        <button onClick={upload} disabled={busy} className={primaryBtn}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload
        </button>
      </div>
      <ErrorLine error={error} />
      {result && (
        <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
          <p>
            <b>{result.created}</b> added, <b>{result.updated}</b> updated, <b>{result.unchanged}</b> already up to date
            {result.errors.length > 0 && (
              <>
                , <b className="text-red-700">{result.errors.length}</b> rows not taken
              </>
            )}
            .
          </p>
          <p className="text-xs text-slate-500">{result.columnsFound} columns recognised.</p>
          {result.errors.length > 0 && (
            <ul className="mt-2 max-h-48 list-disc overflow-y-auto pl-5 text-red-700">
              {result.errors.map((e) => (
                <li key={e.row}>
                  Row {e.row}: {e.message}
                </li>
              ))}
            </ul>
          )}
          {result.warnings.length > 0 && (
            <>
              <p className="mt-2 font-medium text-amber-800">
                {result.warnings.length} cell{result.warnings.length === 1 ? "" : "s"} to check (the rest of the row was taken):
              </p>
              <ul className="mt-1 max-h-48 list-disc overflow-y-auto pl-5 text-amber-800">
                {result.warnings.map((w, i) => (
                  <li key={i}>
                    Row {w.row}: {w.message}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
