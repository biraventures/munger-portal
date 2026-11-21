"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, AlertTriangle, ChevronLeft, ChevronRight, Loader2, Pencil, Search, Trash2, Upload, X } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import {
  approveMigRecords,
  deleteLegacyHoldings,
  editMigRecord,
  fetchAllMigRecords,
  fetchLegacyPreview,
  latestArv,
  MIG_STATUS_LABEL,
  restoreMigRecord,
  setAsideMigRecord,
  type MigRecord,
  type MigStatus,
  type MigTotals,
} from "@/lib/mig-records-api";

const input = "rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-nnm-blue focus:outline-none";
const TONE: Record<MigStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-blue-100 text-blue-800",
  taken_up: "bg-violet-100 text-violet-800",
  finalized: "bg-green-100 text-green-800",
  set_aside: "bg-slate-200 text-slate-600",
};

/**
 * Old Records (MIG) - Municipal Commissioner. Every row of every old-holdings upload is here: awaiting approval (with
 * its problems), approved (MIG-), being entered (MUNG-MIG-), final (MNN-) or set aside. Approval gives the MIG- number
 * and shows the record to the field staff. Also: deleting the untouched MUNG-MIG holdings made by earlier direct uploads.
 */
export default function MigRecordsPage() {
  const admin = useAdminGuard();
  const [status, setStatus] = useState("pending");
  const [ward, setWard] = useState("");
  const [issues, setIssues] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ records: MigRecord[]; total: number; pageSize: number; totals: MigTotals } | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<MigRecord | null>(null);
  const [open, setOpen] = useState<MigRecord | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await fetchAllMigRecords({ status, ward: ward.trim(), issues, q, page }));
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load.");
    }
  }, [status, ward, issues, q, page]);

  useEffect(() => {
    if (admin?.role === "commissioner") load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filters apply on Show / tab change
  }, [admin, status, page, issues]);

  if (!admin) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  if (admin.role !== "commissioner")
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <p className="mx-auto mt-10 max-w-xl rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          For the Municipal Commissioner.
        </p>
      </div>
    );

  const t = data?.totals;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const selectable = (r: MigRecord) => r.status === "pending" && !r.blocking;

  async function approve(sel: { ids?: number[]; allPending?: { ward?: string } }, confirmText: string) {
    if (!window.confirm(confirmText)) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await approveMigRecords(sel);
      setMsg(
        `${r.approved.toLocaleString("en-IN")} record(s) approved and given their MIG- number.${r.skippedBlocking ? ` ${r.skippedBlocking} skipped - they have a problem to correct first.` : ""}`,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not approve.");
    } finally {
      setBusy(false);
    }
  }

  const tile = (label: string, value: number | undefined, s: string, tone = "") => (
    <button
      onClick={() => {
        setStatus(s);
        setIssues("");
        setPage(1);
      }}
      className={`rounded-lg border p-3 text-left ${status === s ? "border-nnm-blue ring-2 ring-nnm-blue/20" : "border-slate-200"} bg-white`}
    >
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-lg font-semibold ${tone || "text-slate-900"}`}>{(value ?? 0).toLocaleString("en-IN")}</p>
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />
      <main className="mx-auto max-w-7xl space-y-5 px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Old Records (MIG) - Approvals</h1>
            <p className="text-sm text-slate-500">
              Every uploaded old-holding row. Approve to give it a MIG- number - only approved records are seen by the field staff.
            </p>
          </div>
          <Link
            href="/admin/migrated-holdings-bulk-upload"
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
          >
            <Upload className="h-4 w-4" /> Upload sheet
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {tile("All uploaded", t?.total, "all")}
          {tile("Awaiting approval", t?.pending, "pending", "text-amber-700")}
          {tile("Approved (MIG)", t?.approved, "approved", "text-blue-700")}
          {tile("Being entered (MUNG-MIG)", t?.taken_up, "taken_up", "text-violet-700")}
          {tile("Final (MNN)", t?.finalized, "finalized", "text-green-700")}
          {tile("Set aside", t?.set_aside, "set_aside")}
          <button
            onClick={() => {
              setStatus("pending");
              setIssues("blocking");
              setPage(1);
            }}
            className={`rounded-lg border bg-white p-3 text-left ${issues === "blocking" ? "border-red-400 ring-2 ring-red-200" : "border-slate-200"}`}
          >
            <p className="text-xs text-slate-500">To correct first</p>
            <p className="text-lg font-semibold text-red-700">{(t?.pending_blocking ?? 0).toLocaleString("en-IN")}</p>
          </button>
        </div>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-end gap-2">
            <div>
              <label className="mb-1 block text-xs text-slate-500" htmlFor="m-ward">
                Ward
              </label>
              <input id="m-ward" value={ward} onChange={(e) => setWard(e.target.value)} placeholder="All" className={`${input} w-20`} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500" htmlFor="m-issues">
                Problems
              </label>
              <select
                id="m-issues"
                value={issues}
                onChange={(e) => {
                  setIssues(e.target.value);
                  setPage(1);
                }}
                className={input}
              >
                <option value="">Any</option>
                <option value="blocking">To correct before approval</option>
                <option value="warning">Warnings only</option>
                <option value="none">No problems</option>
              </select>
            </div>
            <div className="min-w-56 flex-1">
              <label className="mb-1 block text-xs text-slate-500" htmlFor="m-q">
                Old holding no. / old PID / owner / MIG no.
              </label>
              <input
                id="m-q"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setPage(1);
                    load();
                  }
                }}
                className={`${input} w-full`}
              />
            </div>
            <button
              onClick={() => {
                setPage(1);
                load();
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-nnm-blue px-4 py-2 text-sm font-semibold text-white"
            >
              <Search className="h-4 w-4" /> Show
            </button>
          </div>

          {status === "pending" && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md bg-amber-50 p-3 text-sm">
              <button
                disabled={busy || selected.size === 0}
                onClick={() => approve({ ids: [...selected] }, `Approve ${selected.size} selected record(s)?`)}
                className="rounded-md bg-green-600 px-3 py-1.5 font-semibold text-white disabled:opacity-40"
              >
                Approve selected ({selected.size})
              </button>
              <button
                disabled={busy || !t?.pending_ready}
                onClick={() =>
                  approve(
                    { allPending: { ward: ward.trim() || undefined } },
                    ward.trim()
                      ? `Approve every record of ward ${ward.trim()} that has no problem to correct?`
                      : `Approve all ${t?.pending_ready.toLocaleString("en-IN")} records that have no problem to correct?`,
                  )
                }
                className="rounded-md border border-green-600 px-3 py-1.5 font-semibold text-green-700 disabled:opacity-40"
              >
                {ward.trim()
                  ? `Approve all ready in ward ${ward.trim()}`
                  : `Approve all ready (${(t?.pending_ready ?? 0).toLocaleString("en-IN")})`}
              </button>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              <span className="text-xs text-amber-800">
                Records with a problem to correct (no owner name / no valid ward) are skipped until corrected.
              </span>
            </div>
          )}
          {msg && <p className="mb-3 rounded-md bg-green-50 p-3 text-sm text-green-800">{msg}</p>}
          {error && (
            <p role="alert" className="mb-3 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" /> {error}
            </p>
          )}

          {!data ? (
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          ) : data.records.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">Nothing here.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm [&_td]:px-2 [&_th]:px-2">
                <thead>
                  <tr className="border-b text-left text-xs text-slate-500">
                    <th className="py-1.5">
                      {status === "pending" && (
                        <input
                          type="checkbox"
                          aria-label="Select all on this page"
                          checked={
                            data.records.filter(selectable).length > 0 && data.records.filter(selectable).every((r) => selected.has(r.id))
                          }
                          onChange={(e) =>
                            setSelected(e.target.checked ? new Set(data.records.filter(selectable).map((r) => r.id)) : new Set())
                          }
                        />
                      )}
                    </th>
                    <th>Ward</th>
                    <th>Old holding / PID</th>
                    <th>Owner</th>
                    <th>Last paid</th>
                    <th className="text-right">Latest ARV</th>
                    <th>Number</th>
                    <th>Status / problems</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.records.map((r) => (
                    <tr key={r.id} className="border-b border-slate-100 align-top">
                      <td className="py-2">
                        {status === "pending" && (
                          <input
                            type="checkbox"
                            aria-label={`Select ${r.ownerName ?? r.id}`}
                            disabled={!selectable(r)}
                            checked={selected.has(r.id)}
                            onChange={(e) => {
                              const s = new Set(selected);
                              if (e.target.checked) s.add(r.id);
                              else s.delete(r.id);
                              setSelected(s);
                            }}
                          />
                        )}
                      </td>
                      <td>{r.ward ?? <span className="text-red-600">-</span>}</td>
                      <td>
                        {r.oldHoldingNo ?? "-"}
                        {r.oldPid && (
                          <p className={`text-xs ${r.pidShared ? "font-semibold text-amber-700" : "text-slate-500"}`}>PID {r.oldPid}</p>
                        )}
                      </td>
                      <td>
                        <button onClick={() => setOpen(r)} className="text-left font-medium text-slate-900 hover:underline">
                          {r.ownerName ?? <span className="text-red-600">(no name)</span>}
                        </button>
                        {r.relativeName && (
                          <p className="text-xs text-slate-500">
                            {r.relation ?? ""} {r.relativeName}
                          </p>
                        )}
                      </td>
                      <td className="whitespace-nowrap">{r.lastPaymentYear ?? "-"}</td>
                      <td className="text-right">{latestArv(r)?.toLocaleString("en-IN") ?? "-"}</td>
                      <td className="whitespace-nowrap font-mono text-xs">
                        {r.migNo ?? "-"}
                        {r.holdingNo && <p className="text-slate-500">{r.holdingNo}</p>}
                      </td>
                      <td>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TONE[r.status]}`}>
                          {MIG_STATUS_LABEL[r.status]}
                        </span>
                        {r.issues.map((i, k) => (
                          <p key={k} className={`mt-0.5 text-xs ${i.blocking ? "font-semibold text-red-700" : "text-amber-700"}`}>
                            {i.blocking ? "✕ " : "! "}
                            {i.text}
                          </p>
                        ))}
                        {r.pidShared && <p className="mt-0.5 text-xs text-amber-700">! Old PID also on another record / holding</p>}
                        {r.setAsideReason && <p className="mt-0.5 text-xs text-slate-500">Set aside: {r.setAsideReason}</p>}
                        {r.entry && (
                          <p className="mt-0.5 text-xs text-violet-700">
                            Entry {r.entry.status === "reverted" ? "sent back" : `with ${r.entry.stage.replace(/_/g, " ")}`}
                          </p>
                        )}
                      </td>
                      <td className="whitespace-nowrap text-right">
                        {["pending", "approved", "set_aside"].includes(r.status) && (
                          <button
                            onClick={() => setEditing(r)}
                            className="mr-2 inline-flex items-center gap-1 text-xs font-semibold text-nnm-blue"
                          >
                            <Pencil className="h-3.5 w-3.5" /> Correct
                          </button>
                        )}
                        {r.status === "pending" && selectable(r) && (
                          <button
                            onClick={() => approve({ ids: [r.id] }, `Approve ${r.ownerName}?`)}
                            className="mr-2 text-xs font-semibold text-green-700"
                          >
                            Approve
                          </button>
                        )}
                        {["pending", "approved"].includes(r.status) && (
                          <button
                            onClick={async () => {
                              const reason = window.prompt("Why set this record aside? (e.g. duplicate of another record)");
                              if (!reason?.trim()) return;
                              try {
                                await setAsideMigRecord(r.id, reason.trim());
                                load();
                              } catch (e) {
                                window.alert(e instanceof Error ? e.message : "Could not set aside.");
                              }
                            }}
                            className="text-xs font-semibold text-slate-600"
                          >
                            Set aside
                          </button>
                        )}
                        {r.status === "set_aside" && (
                          <button
                            onClick={async () => {
                              await restoreMigRecord(r.id).catch((e) =>
                                window.alert(e instanceof Error ? e.message : "Could not restore."),
                              );
                              load();
                            }}
                            className="text-xs font-semibold text-slate-600"
                          >
                            Restore
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data && pages > 1 && (
            <div className="mt-3 flex items-center justify-center gap-3 text-sm">
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" /> Previous
              </button>
              <span className="text-slate-500">
                Page {page} of {pages} ({data.total.toLocaleString("en-IN")} records)
              </span>
              <button
                disabled={page >= pages}
                onClick={() => setPage(page + 1)}
                className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 disabled:opacity-40"
              >
                Next <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </section>

        <LegacyCleanup />
      </main>
      {editing && (
        <EditPanel
          r={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
      {open && <RecordPanel r={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function RecordPanel({ r, onClose }: { r: MigRecord; onClose: () => void }) {
  const a = r.arv;
  const rows: [string, React.ReactNode][] = [
    ["Number", `${r.migNo ?? "-"}${r.holdingNo ? ` / ${r.holdingNo}` : ""}`],
    ["Status", MIG_STATUS_LABEL[r.status]],
    ["Ward", r.ward ?? "-"],
    ["Old holding no.", r.oldHoldingNo ?? "-"],
    ["Old PID", r.oldPid ?? "-"],
    ["Owner", `${r.ownerName ?? "-"}${r.relativeName ? ` ${r.relation ?? ""} ${r.relativeName}` : ""}`],
    ["ARV before 1996-97", a.pre1996 ?? "-"],
    ["ARV 1997-98 to 1999-2000", a.y1997to2000 ?? "-"],
    ["ARV 2000-01 to 2010-11", a.y2000to2011 ?? a.y1997to2010 ?? "-"],
    ["ARV 2011-12 to 2016-17", a.y2011to2017 ?? a.y2011to2020 ?? "-"],
    ["ARV 2017-18 to 2020-21", a.y2017to2021 ?? "-"],
    ["ARV 2021-22 onwards", a.y2021on ?? "-"],
    ["Holding creation year", r.holdingCreationYear ?? "-"],
    ["Last payment year", r.lastPaymentYear ?? "-"],
    ["Tax status", r.taxStatus ?? "-"],
    ["Remarks", r.remarks ?? "-"],
    [
      "Uploaded",
      `${r.fileName ?? ""}${r.rowNo ? `, row ${r.rowNo}` : ""} - ${new Date(r.uploadedAt).toLocaleString("en-IN")}${r.uploadedBy ? ` by ${r.uploadedBy}` : ""}`,
    ],
  ];
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div className="h-full w-full max-w-lg overflow-y-auto bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Old record</h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-slate-500">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        {r.events.length > 0 && (
          <div className="mt-4">
            <p className="mb-1 text-sm font-semibold">History</p>
            <ul className="space-y-0.5 text-xs text-slate-600">
              {r.events.map((e, i) => (
                <li key={i}>
                  {new Date(e.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} - <b>{e.action}</b> by {e.by}
                  {e.note ? `: ${e.note}` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function EditPanel({ r, onClose, onSaved }: { r: MigRecord; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    ward: r.ward ?? "",
    oldHoldingNo: r.oldHoldingNo ?? "",
    oldPid: r.oldPid ?? "",
    ownerName: r.ownerName ?? "",
    relation: r.relation ?? "",
    relativeName: r.relativeName ?? "",
    holdingCreationYear: r.holdingCreationYear ?? "",
    lastPaymentYear: r.lastPaymentYear ?? "",
    taxStatus: r.taxStatus ?? "",
    remarks: r.remarks ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const fields: [keyof typeof f, string][] = [
    ["ward", "Ward *"],
    ["oldHoldingNo", "Old holding no."],
    ["oldPid", "Old PID"],
    ["ownerName", "Owner name *"],
    ["relation", "Relation (S/O, D/O, W/O, C/O)"],
    ["relativeName", "Relative's name"],
    ["holdingCreationYear", "Holding creation year (e.g. 2005-2006)"],
    ["lastPaymentYear", "Last payment year (e.g. 2015-16)"],
    ["taxStatus", "Tax status"],
    ["remarks", "Remarks"],
  ];
  async function save() {
    const n = (v: string) => v.trim() || null;
    try {
      await editMigRecord(r.id, {
        ward: f.ward,
        ownerName: f.ownerName,
        oldHoldingNo: n(f.oldHoldingNo),
        oldPid: n(f.oldPid),
        relation: n(f.relation),
        relativeName: n(f.relativeName),
        holdingCreationYear: n(f.holdingCreationYear),
        lastPaymentYear: n(f.lastPaymentYear),
        taxStatus: n(f.taxStatus),
        remarks: n(f.remarks),
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div className="h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Correct the record</h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        {r.issues.length > 0 && (
          <div className="mb-3 rounded-md bg-amber-50 p-3 text-xs text-amber-900">
            {r.issues.map((i, k) => (
              <p key={k}>{i.text}</p>
            ))}
          </div>
        )}
        <div className="space-y-3">
          {fields.map(([k, l]) => (
            <div key={k}>
              <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor={`e-${k}`}>
                {l}
              </label>
              <input id={`e-${k}`} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className={`${input} w-full`} />
            </div>
          ))}
        </div>
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
        <div className="mt-4 flex gap-2">
          <button onClick={save} className="rounded-md bg-nnm-blue px-4 py-2 text-sm font-semibold text-white">
            Save
          </button>
          <button onClick={onClose} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold">
            Cancel
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          The record&apos;s problems are checked again on saving. Its original row in the sheet stays its identity for re-uploads.
        </p>
      </div>
    </div>
  );
}

/** Deleting the untouched MUNG-MIG holdings made by earlier direct uploads (before the MIG stage existed). */
function LegacyCleanup() {
  const [p, setP] = useState<Awaited<ReturnType<typeof fetchLegacyPreview>> | null>(null);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function preview() {
    setError(null);
    try {
      setP(await fetchLegacyPreview());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not check.");
    }
  }
  async function del() {
    setBusy(true);
    setError(null);
    try {
      const r = await deleteLegacyHoldings(confirm);
      setMsg(
        `${r.deleted.toLocaleString("en-IN")} holdings deleted. Each keeps a "Deleted" entry in its history. Upload the sheet again to bring them in as MIG records.`,
      );
      setConfirm("");
      await preview();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="rounded-xl border border-red-200 bg-white p-4">
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-red-700">
        <Trash2 className="h-4 w-4" /> Delete the MUNG-MIG holdings made by earlier uploads
      </summary>
      <div className="mt-3 space-y-3 text-sm">
        <p className="text-slate-600">
          Before the MIG stage, the upload made MUNG-MIG holdings directly. Holdings nothing has happened to yet - not assigned or surveyed,
          no details entered, no payment, notice, field visit or any other record - can be deleted, so the sheet can be uploaded again into
          the MIG flow. Holdings with anything on them are kept and listed.
        </p>
        <button onClick={preview} className="rounded-md border border-slate-300 px-3 py-1.5 font-semibold">
          Check what can be deleted
        </button>
        {error && (
          <p role="alert" className="flex items-center gap-2 rounded-md bg-red-50 p-3 text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </p>
        )}
        {msg && <p className="rounded-md bg-green-50 p-3 text-green-800">{msg}</p>}
        {p && (
          <>
            <p>
              MUNG-MIG holdings: <b>{p.total.toLocaleString("en-IN")}</b> - can be deleted:{" "}
              <b className="text-red-700">{p.deletable.toLocaleString("en-IN")}</b> - kept:{" "}
              <b>{(p.total - p.deletable).toLocaleString("en-IN")}</b>
            </p>
            {p.kept.length > 0 && (
              <details className="text-xs text-slate-600">
                <summary className="cursor-pointer">Kept holdings and why</summary>
                <ul className="mt-1 max-h-48 overflow-y-auto">
                  {p.kept.map((k) => (
                    <li key={k.holding_no}>
                      {k.holding_no} - {k.owner_name} (ward {k.ward}): {k.why}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {p.deletable > 0 && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3">
                <p className="mb-2 flex items-center gap-1.5 font-semibold text-red-800">
                  <AlertTriangle className="h-4 w-4" /> This cannot be undone. Type <code className="font-mono">DELETE {p.deletable}</code>{" "}
                  to confirm.
                </p>
                <div className="flex flex-wrap gap-2">
                  <input
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder={`DELETE ${p.deletable}`}
                    className={`${input} w-48`}
                  />
                  <button
                    disabled={busy || confirm.trim().toUpperCase() !== `DELETE ${p.deletable}`}
                    onClick={del}
                    className="rounded-md bg-red-600 px-4 py-2 font-semibold text-white disabled:opacity-40"
                  >
                    {busy ? "Deleting…" : `Delete ${p.deletable.toLocaleString("en-IN")} holdings`}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </details>
  );
}
