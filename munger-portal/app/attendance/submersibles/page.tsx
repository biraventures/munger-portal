"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, Droplets, History, Pencil, PlusCircle, Search, Wrench, AlertTriangle } from "lucide-react";
import { AttendanceHeader } from "@/components/attendance/attendance-header";
import { useAttendanceGuard } from "@/lib/use-attendance-guard";
import type { AttendanceRole } from "@/lib/attendance-auth";
import { FaultModal, HistoryModal, PyauFormModal, RepairModal, inputClass } from "@/components/pyau-dashboard-parts";
import {
  PYAU_EDIT_ROLES,
  PYAU_VIEW_ROLES,
  STRUCTURE_LABELS,
  fetchDashboard,
  rupees,
  type DashboardData,
  type PyauRecord,
} from "@/lib/pyau-officer-api";

type StatusFilter = "all" | "functional" | "non_functional" | "builder";

export default function SubmersiblesDashboardPage() {
  const admin = useAttendanceGuard(PYAU_VIEW_ROLES as AttendanceRole[]);
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wardId, setWardId] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<PyauRecord | "new" | null>(null);
  const [faultFor, setFaultFor] = useState<PyauRecord | null>(null);
  const [repairId, setRepairId] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);

  const allowed = !!admin && PYAU_VIEW_ROLES.includes(admin.role);
  const canEdit = !!admin && PYAU_EDIT_ROLES.includes(admin.role);

  const load = useCallback(() => {
    fetchDashboard()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load the submersibles."));
  }, []);
  useEffect(() => {
    if (allowed) load();
  }, [allowed, load]);

  const visible = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.pyaus.filter(
      (p) =>
        (!wardId || p.ward_id === wardId) &&
        (status === "all" || (status === "builder" ? p.under_builder_maintenance : p.functional_status === status)) &&
        (!q ||
          [p.serial_number, p.location_address, p.agency_name, p.contractor_name, p.builder_name].some((v) =>
            v?.toLowerCase().includes(q),
          )),
    );
  }, [data, wardId, status, query]);

  const totals = useMemo(() => {
    const ws = data?.wards.filter((w) => !wardId || w.id === wardId) ?? [];
    return ws.reduce(
      (t, w) => ({
        total: t.total + w.total,
        functional: t.functional + w.functional,
        non: t.non + w.non_functional,
        builder: t.builder + w.under_builder,
      }),
      { total: 0, functional: 0, non: 0, builder: 0 },
    );
  }, [data, wardId]);

  if (!admin) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  if (!allowed) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AttendanceHeader user={admin} />
        <main className="mx-auto max-w-2xl px-6 py-10">
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            The submersible dashboard is for the AE / JE - Mechanical, the Commissioner, the Deputy Commissioner and the City Manager.
          </div>
        </main>
      </div>
    );
  }

  const tile = (label: string, value: number, active: boolean, onClick: () => void, tone: string) => (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-3 text-left ${active ? "border-nnm-blue ring-2 ring-nnm-blue/30" : "border-slate-200"} bg-white`}
    >
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-2xl font-semibold ${tone}`}>{value.toLocaleString("en-IN")}</p>
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <AttendanceHeader user={admin} />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
              <Droplets className="h-6 w-6" /> Submersible Pyau Dashboard
            </h1>
            <p className="mt-1 text-sm text-slate-500">Ward-wise status, details and repairs of every submersible pyau.</p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/attendance/submersible-audit-trail"
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Repair audit trail
            </Link>
            {canEdit && (
              <button
                type="button"
                onClick={() => setEditing("new")}
                className="inline-flex items-center gap-1.5 rounded-md bg-nnm-blue px-4 py-2 text-sm font-semibold text-white hover:bg-nnm-blue-dark"
              >
                <PlusCircle className="h-4 w-4" /> Add submersible
              </button>
            )}
          </div>
        </div>

        {error && (
          <div role="alert" className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tile("Total", totals.total, status === "all", () => setStatus("all"), "text-slate-900")}
          {tile("Functional", totals.functional, status === "functional", () => setStatus("functional"), "text-green-700")}
          {tile("Non-functional", totals.non, status === "non_functional", () => setStatus("non_functional"), "text-red-700")}
          {tile("Under builder maintenance", totals.builder, status === "builder", () => setStatus("builder"), "text-amber-700")}
        </div>

        <div className="mb-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row">
          <label className="sm:w-56">
            <span className="mb-1 block text-xs font-medium text-slate-500">Ward</span>
            <select value={wardId} onChange={(e) => setWardId(e.target.value)} className={inputClass}>
              <option value="">All wards</option>
              {data?.wards.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.ward_name} ({w.total}
                  {w.non_functional ? `, ${w.non_functional} not working` : ""})
                </option>
              ))}
            </select>
          </label>
          <label className="flex-1">
            <span className="mb-1 block text-xs font-medium text-slate-500">Search</span>
            <span className="relative block">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Serial no., address, agency, contractor or builder"
                className={`${inputClass} pl-8`}
              />
            </span>
          </label>
        </div>

        {!data ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : (
          <>
            <p className="mb-2 text-xs text-slate-500">{visible.length.toLocaleString("en-IN")} submersible(s)</p>
            <div className="space-y-2">
              {visible.map((p) => (
                <div key={p.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">
                        <span className="font-mono">{p.serial_number ?? "-"}</span>{" "}
                        <span className="font-normal text-slate-500">· {p.ward_name}</span>
                      </p>
                      <p className="text-slate-700">{p.location_address || "-"}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          p.functional_status === "functional" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700"
                        }`}
                      >
                        {p.functional_status === "functional" ? "Functional" : "Non-functional"}
                      </span>
                      {p.under_builder_maintenance && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                          Builder maintenance
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {p.structure_type ? STRUCTURE_LABELS[p.structure_type] : "Stand -"} · tanks {p.overhead_tank_count} · taps{" "}
                    {p.water_tap_count ?? "-"} · standposts {p.standpost_count ?? "-"} · houses {p.houses_served ?? "-"} · agency{" "}
                    {p.agency_name ?? "-"} ·{" "}
                    {p.under_builder_maintenance
                      ? `builder ${p.builder_name ?? "-"}${p.builder_contact ? ` (${p.builder_contact})` : ""}`
                      : `contractor ${p.contractor_name ?? "not assigned"}${p.contractor_from_ward ? " (ward's)" : ""}`}
                    {p.repairs_done > 0 && ` · ${p.repairs_done} repair(s), ${rupees(p.repairs_cost)}`}
                  </p>
                  {p.open_issue_id && (
                    <p className="mt-1.5 flex flex-wrap items-center gap-1.5 rounded-md bg-red-50 px-2 py-1 text-xs text-red-800">
                      <AlertTriangle className="h-3.5 w-3.5" /> Under repair since{" "}
                      {p.open_issue_date ? new Date(p.open_issue_date).toLocaleDateString("en-IN") : "-"} · {p.open_issue_items} item(s),{" "}
                      {rupees(p.open_issue_cost)} · application {p.open_issue_has_application ? "attached" : "not attached"}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => setEditing(p)}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-50"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </button>
                    )}
                    {canEdit && !p.open_issue_id && (
                      <button
                        type="button"
                        onClick={() => setFaultFor(p)}
                        className="inline-flex items-center gap-1 rounded-md border border-red-300 px-2.5 py-1 text-xs text-red-700 hover:bg-red-50"
                      >
                        <AlertTriangle className="h-3.5 w-3.5" /> Mark non-functional
                      </button>
                    )}
                    {p.open_issue_id && (
                      <button
                        type="button"
                        onClick={() => setRepairId(p.open_issue_id)}
                        className="inline-flex items-center gap-1 rounded-md bg-nnm-blue px-2.5 py-1 text-xs font-semibold text-white hover:bg-nnm-blue-dark"
                      >
                        <Wrench className="h-3.5 w-3.5" /> {canEdit ? "Repair - items, photos, close" : "View repair"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setHistoryId(p.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-50"
                    >
                      <History className="h-3.5 w-3.5" /> History
                    </button>
                  </div>
                </div>
              ))}
              {visible.length === 0 && (
                <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">No submersibles match.</p>
              )}
            </div>
          </>
        )}
      </main>

      {editing && data && (
        <PyauFormModal
          pyau={editing === "new" ? null : editing}
          wards={data.allWards}
          defaultWardId={wardId}
          agencies={data.agencies}
          contractors={data.contractors}
          onClose={() => setEditing(null)}
          onAgencyAdded={(a) =>
            setData((d) =>
              d ? { ...d, agencies: [...d.agencies.filter((x) => x.id !== a.id), a].sort((x, y) => x.name.localeCompare(y.name)) } : d,
            )
          }
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
      {faultFor && (
        <FaultModal
          pyau={faultFor}
          onClose={() => setFaultFor(null)}
          onSaved={(issueId) => {
            setFaultFor(null);
            load();
            setRepairId(issueId);
          }}
        />
      )}
      {repairId && <RepairModal issueId={repairId} canEdit={canEdit} onClose={() => setRepairId(null)} onChanged={load} />}
      {historyId && <HistoryModal pyauId={historyId} onClose={() => setHistoryId(null)} />}
    </div>
  );
}
