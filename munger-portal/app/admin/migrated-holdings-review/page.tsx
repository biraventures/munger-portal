"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, ClipboardCheck, Loader2 } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import {
  discardMigratedReviewRow,
  fetchMigratedReviewRows,
  importMigratedReviewRow,
  type MigratedReviewRow,
  type MigratedRowData,
} from "@/lib/admin-api";

const ROLES = ["commissioner", "tax_daroga"];
const input = "w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-nnm-blue";
const label = "mb-1 block text-xs font-medium text-slate-600";
type Status = "pending" | "imported" | "discarded";

type Draft = Record<keyof MigratedRowData, string>;
const toDraft = (d: MigratedRowData): Draft => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v === null || v === undefined ? "" : String(v)])) as Draft;
const fromDraft = (d: Draft): MigratedRowData => {
  const t = (v: string) => (v.trim() ? v.trim() : null);
  const n = (v: string) => (v.trim() ? Number(v) : null);
  return {
    ward: d.ward.trim(),
    oldHoldingNo: t(d.oldHoldingNo),
    oldPid: t(d.oldPid),
    ownerName: d.ownerName.trim(),
    relation: t(d.relation),
    relativeName: t(d.relativeName),
    arvPre96: n(d.arvPre96),
    arv97to2010: n(d.arv97to2010),
    arv2011to2020: n(d.arv2011to2020),
    lastPaymentYear: t(d.lastPaymentYear),
    taxStatus: t(d.taxStatus),
    remarks: t(d.remarks),
  };
};
const FIELDS: { k: keyof MigratedRowData; l: string; type?: string }[] = [
  { k: "ward", l: "Ward No." },
  { k: "oldHoldingNo", l: "Old Holding No." },
  { k: "oldPid", l: "Old PID No." },
  { k: "ownerName", l: "Holding Owner Name" },
  { k: "relation", l: "Relation (S/O, D/O, W/O, C/O)" },
  { k: "relativeName", l: "Relative Name" },
  { k: "arvPre96", l: "ARV before 1996-97", type: "number" },
  { k: "arv97to2010", l: "ARV 1997-98 to 2010-11", type: "number" },
  { k: "arv2011to2020", l: "ARV 2011-12 to 2020-21", type: "number" },
  { k: "lastPaymentYear", l: "Last Payment Year" },
  { k: "taxStatus", l: "Tax Status" },
  { k: "remarks", l: "Remarks" },
];

/** Rows of the old-holding (MUNG-MIG) upload held back for review: see the issue, correct and import, or discard. */
export default function MigratedHoldingsReviewPage() {
  const admin = useAdminGuard();
  const [status, setStatus] = useState<Status>("pending");
  const [rows, setRows] = useState<MigratedReviewRow[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function load(s: Status = status) {
    setRows(null);
    try {
      setRows(await fetchMigratedReviewRows(s));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the rows.");
    }
  }

  useEffect(() => {
    if (admin && ROLES.includes(admin.role)) load(status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, status]);

  if (!admin) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  if (!ROLES.includes(admin.role)) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <main className="mx-auto max-w-2xl px-6 py-10">
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" /> This page is for the Commissioner and the Tax Daroga.
          </div>
        </main>
      </div>
    );
  }

  function openRow(r: MigratedReviewRow) {
    setError(null);
    setDone(null);
    setNote("");
    if (open === r.id) {
      setOpen(null);
      return;
    }
    setOpen(r.id);
    setDraft(toDraft(r.data));
  }

  async function act(r: MigratedReviewRow, what: "import" | "discard") {
    if (!draft) return;
    if (what === "discard" && note.trim().length < 3) return setError("Write why this row is discarded.");
    setBusy(true);
    setError(null);
    try {
      if (what === "import") {
        const x = await importMigratedReviewRow(r.id, fromDraft(draft), note);
        setDone(`Row ${r.source_row} imported as ${x.holdingNo}.`);
      } else {
        await discardMigratedReviewRow(r.id, note.trim());
        setDone(`Row ${r.source_row} discarded.`);
      }
      setOpen(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <ClipboardCheck className="h-6 w-6" /> Old Holdings - Rows to Review
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Rows of the old-holding upload that were not imported - a &quot;Needs Review&quot; note in the sheet or a problem in the row. Open a row, correct
          it and import it as a MUNG-MIG holding, or discard it with a reason.
        </p>

        <div className="mt-5 inline-flex rounded-md border border-slate-300 bg-white p-0.5 text-xs font-semibold" role="group" aria-label="Show">
          {(["pending", "imported", "discarded"] as Status[]).map((s) => (
            <button key={s} onClick={() => setStatus(s)} aria-pressed={status === s} className={`rounded px-3 py-1.5 capitalize ${status === s ? "bg-nnm-blue text-white" : "text-slate-600"}`}>
              {s === "pending" ? "To review" : s}
            </button>
          ))}
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        {done && (
          <p role="status" className="mt-4 flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            <CheckCircle2 className="h-4 w-4" /> {done}
          </p>
        )}

        {rows === null ? (
          <p className="mt-6 flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </p>
        ) : rows.length === 0 ? (
          <p className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-400">
            {status === "pending" ? "No rows waiting for review." : `No ${status} rows.`}
          </p>
        ) : (
          <div className="mt-4 space-y-2">
            {rows.map((r) => (
              <div key={r.id} className="rounded-xl border border-slate-200 bg-white text-sm">
                <button onClick={() => openRow(r)} className="flex w-full flex-wrap items-start gap-x-3 gap-y-1 p-3 text-left" aria-expanded={open === r.id}>
                  <span className="font-mono text-xs text-slate-500">
                    Row {r.source_row}
                    {r.file_name ? ` · ${r.file_name}` : ""}
                  </span>
                  <span className="font-semibold text-slate-900">{r.data.ownerName || "(no owner name)"}</span>
                  <span className="text-slate-600">
                    Ward {r.data.ward || "-"} · Old holding {r.data.oldHoldingNo ?? "-"}
                  </span>
                  <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.kind === "needs_review" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"}`}>
                    {r.kind === "needs_review" ? "Marked for review" : "Problem in row"}
                  </span>
                  <span className="w-full text-xs text-red-700">Issue: {r.reason}</span>
                  {r.status !== "pending" && (
                    <span className="w-full text-xs text-slate-500">
                      {r.status === "imported" ? `Imported as ${r.holding_no}` : "Discarded"} by {r.resolved_by}
                      {r.resolution_note ? ` - ${r.resolution_note}` : ""}
                    </span>
                  )}
                </button>
                {open === r.id && draft && r.status === "pending" && (
                  <div className="border-t border-slate-100 p-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      {FIELDS.map((f) => (
                        <div key={f.k} className={f.k === "remarks" ? "sm:col-span-3" : ""}>
                          <label className={label} htmlFor={`f-${f.k}`}>
                            {f.l}
                          </label>
                          <input
                            id={`f-${f.k}`}
                            type={f.type ?? "text"}
                            min={f.type === "number" ? 0 : undefined}
                            value={draft[f.k]}
                            onChange={(e) => setDraft({ ...draft, [f.k]: e.target.value })}
                            className={input}
                          />
                        </div>
                      ))}
                    </div>
                    <label className={`${label} mt-3`} htmlFor="note">
                      Note (what was corrected, or why it is discarded)
                    </label>
                    <input id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className={input} />
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        onClick={() => act(r, "import")}
                        disabled={busy}
                        className="rounded-md bg-nnm-blue px-4 py-2 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
                      >
                        {busy ? "Saving…" : "Import this row"}
                      </button>
                      <button
                        onClick={() => act(r, "discard")}
                        disabled={busy}
                        className="rounded-md border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                      >
                        Discard
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
