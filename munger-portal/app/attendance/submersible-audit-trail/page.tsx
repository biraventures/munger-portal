"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, Download, ScrollText } from "lucide-react";
import { AttendanceHeader } from "@/components/attendance/attendance-header";
import { useAttendanceGuard } from "@/lib/use-attendance-guard";
import type { AttendanceRole } from "@/lib/attendance-auth";
import { HistoryModal, auditDetails, inputClass } from "@/components/pyau-dashboard-parts";
import {
  AUDIT_ACTION_LABELS,
  PYAU_VIEW_ROLES,
  fetchAuditTrail,
  fetchDashboard,
  type AuditEvent,
  type WardSummary,
} from "@/lib/pyau-officer-api";

const fmtWhen = (d: string) =>
  new Date(d).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function SubmersibleAuditTrailPage() {
  const admin = useAttendanceGuard(PYAU_VIEW_ROLES as AttendanceRole[]);
  const [wards, setWards] = useState<WardSummary[]>([]);
  const [filter, setFilter] = useState({ wardId: "", from: "", to: "" });
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const allowed = !!admin && PYAU_VIEW_ROLES.includes(admin.role);

  useEffect(() => {
    if (!allowed) return;
    fetchDashboard()
      .then((d) => setWards(d.wards))
      .catch(() => undefined);
  }, [allowed]);

  useEffect(() => {
    if (!allowed) return;
    setEvents(null);
    fetchAuditTrail(filter)
      .then(setEvents)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load the audit trail."));
  }, [allowed, filter]);

  function download() {
    if (!events) return;
    const rows = [
      ["Date & time", "Ward", "Serial", "Location", "Action", "Details", "By", "Role"],
      ...events.map((e) => [
        fmtWhen(e.at),
        e.ward_name ?? "",
        e.serial_number ?? "",
        e.location_address ?? "",
        AUDIT_ACTION_LABELS[e.action] ?? e.action,
        auditDetails(e),
        e.by_name,
        e.by_role ?? "",
      ]),
    ];
    const esc = (c: string) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);
    const blob = new Blob(["﻿" + rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `submersible-audit-trail-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  if (!admin) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  if (!allowed) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AttendanceHeader user={admin} />
        <main className="mx-auto max-w-2xl px-6 py-10">
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" /> Not available for your role.
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AttendanceHeader user={admin} />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
              <ScrollText className="h-6 w-6" /> Submersible Audit Trail
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Every change to a submersible and every step of every repair, with who did it and when.
            </p>
          </div>
          <Link
            href="/attendance/submersibles"
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Back to dashboard
          </Link>
        </div>
        {error && (
          <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}
        <div className="mb-4 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-4">
          <label>
            <span className="mb-1 block text-xs font-medium text-slate-500">Ward</span>
            <select value={filter.wardId} onChange={(e) => setFilter({ ...filter, wardId: e.target.value })} className={inputClass}>
              <option value="">All wards</option>
              {wards.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.ward_name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium text-slate-500">From</span>
            <input
              type="date"
              value={filter.from}
              onChange={(e) => setFilter({ ...filter, from: e.target.value })}
              className={inputClass}
            />
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium text-slate-500">To</span>
            <input type="date" value={filter.to} onChange={(e) => setFilter({ ...filter, to: e.target.value })} className={inputClass} />
          </label>
          <div className="flex items-end">
            <button
              type="button"
              onClick={download}
              disabled={!events?.length}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> Download (Excel)
            </button>
          </div>
        </div>
        {!events ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : events.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">
            Nothing recorded for this filter.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">Submersible</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                  <th className="px-3 py-2 font-medium">Details</th>
                  <th className="px-3 py-2 font-medium">By</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} className="border-t border-slate-100 align-top">
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">{fmtWhen(e.at)}</td>
                    <td className="px-3 py-2">
                      {e.pyau_id ? (
                        <button type="button" onClick={() => setHistoryId(e.pyau_id)} className="text-left text-nnm-blue underline">
                          {e.serial_number ?? "-"}
                        </button>
                      ) : (
                        "-"
                      )}
                      <span className="block text-xs text-slate-500">{[e.ward_name, e.location_address].filter(Boolean).join(" · ")}</span>
                    </td>
                    <td className="px-3 py-2 font-medium">{AUDIT_ACTION_LABELS[e.action] ?? e.action}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{auditDetails(e)}</td>
                    <td className="px-3 py-2 text-xs">{e.by_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
      {historyId && <HistoryModal pyauId={historyId} onClose={() => setHistoryId(null)} />}
    </div>
  );
}
