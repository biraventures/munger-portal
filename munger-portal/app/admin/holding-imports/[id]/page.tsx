"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, X } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import {
  discardImport,
  excludeStaged,
  fetchImportBatch,
  fetchStagedHolding,
  integrateStaged,
  markReviewed,
  restoreStaged,
  type ImportBatch,
  type StagedHolding,
  type StagedHoldingDetail,
  type StagedHoldingList,
} from "@/lib/holding-import-api";

const STATUS_LABEL: Record<string, string> = { pending: "Pending", excluded: "Kept out", integrated: "Integrated", failed: "Failed" };
const STATUS_CLASS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  excluded: "bg-slate-200 text-slate-600",
  integrated: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <span className="block text-xs text-slate-400">{label}</span>
      <span className={`text-lg font-semibold ${tone ?? "text-slate-900"}`}>{value}</span>
    </div>
  );
}

export default function HoldingImportReviewPage() {
  const admin = useAdminGuard();
  const params = useParams();
  const batchId = Number(params.id);

  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [list, setList] = useState<StagedHoldingList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("pending");
  const [issues, setIssues] = useState("all");
  const [review, setReview] = useState("all");
  const [ward, setWard] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<StagedHoldingDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const wasIntegrating = useRef(false);

  const allowed = admin && ["tax_daroga", "city_manager", "commissioner"].includes(admin.role);
  const isCityManager = admin?.role === "city_manager";
  const isDaroga = admin?.role === "tax_daroga";
  const isCommissioner = admin?.role === "commissioner";

  const load = useCallback(async () => {
    try {
      const r = await fetchImportBatch(batchId, { status, issues, review, ward, search, page, pageSize: 50 });
      setBatch(r.batch);
      setList(r.holdings);
      setError(null);
      if (wasIntegrating.current && !r.batch.integrating && r.batch.lastRunSummary) {
        const s = r.batch.lastRunSummary;
        setNotice(`Integration finished: ${s.integrated} holding(s) are now live${s.failed ? `, ${s.failed} failed` : ""}${s.notes.length ? ` - ${s.notes.join("; ")}` : ""}.`);
        setSelected(new Set());
      }
      wasIntegrating.current = r.batch.integrating;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load this upload.");
    }
  }, [batchId, status, issues, review, ward, search, page]);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  // While an integration runs in the background, refresh every few seconds to show progress.
  useEffect(() => {
    if (!batch?.integrating) return;
    const t = setInterval(() => void load(), 3000);
    return () => clearInterval(t);
  }, [batch?.integrating, load]);

  async function run(action: () => Promise<unknown>, doneMessage?: (r: never) => string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await action();
      if (doneMessage) setNotice(doneMessage(r as never));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not work.");
    } finally {
      setBusy(false);
    }
  }

  const sel = [...selected];
  const c = batch?.counts;
  const locked = busy || !!batch?.integrating || batch?.status === "discarded";

  function startIntegration(mode: "all" | "selected" | "all_except") {
    if (!c) return;
    const n = mode === "all" ? c.reviewedPending : mode === "selected" ? sel.length : Math.max(c.reviewedPending - sel.length, 0);
    const warn = c.awaitingReview > 0 ? ` ${c.awaitingReview} holding(s) not yet reviewed by the Tax Daroga will stay out.` : "";
    const what =
      mode === "all"
        ? `Integrate ALL ${n} reviewed holdings (holdings kept out stay out)?${warn}`
        : mode === "selected"
          ? `Integrate the ${n} selected holding(s)?`
          : `Integrate every reviewed holding EXCEPT the ${sel.length} selected (about ${n})?${warn}`;
    if (!window.confirm(`${what}\n\nThis is the final approval - they will go live straight away.`)) return;
    void run(() => integrateStaged(batchId, mode, mode === "all" ? undefined : sel), (r: { holdings: number }) => `Integration started for ${r.holdings} holding(s). You can leave this page - progress shows here.`);
  }

  async function openDetail(h: StagedHolding) {
    setDetailLoading(true);
    setDetail(null);
    try {
      setDetail(await fetchStagedHolding(batchId, h.holdingNo));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load this holding.");
    } finally {
      setDetailLoading(false);
    }
  }

  function togglePage(on: boolean) {
    const next = new Set(selected);
    for (const h of list?.items ?? []) {
      if (h.hasBlocker || h.status === "integrated") continue;
      if (on) next.add(h.holdingNo);
      else next.delete(h.holdingNo);
    }
    setSelected(next);
  }

  if (!admin) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  if (!allowed) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <main className="mx-auto max-w-2xl px-6 py-10">
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Uploaded holdings can be viewed only by the Tax Daroga, City Manager and Commissioner.
          </div>
        </main>
      </div>
    );
  }

  const totalPages = list ? Math.max(1, Math.ceil(list.total / list.pageSize)) : 1;
  const pageSelectable = (list?.items ?? []).filter((h) => !h.hasBlocker && h.status !== "integrated");
  const allOnPage = pageSelectable.length > 0 && pageSelectable.every((h) => selected.has(h.holdingNo));

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Link href="/admin/holding-imports" className="text-sm text-nnm-blue hover:underline">← All uploads</Link>
        <h1 className="mb-1 mt-2 text-2xl font-semibold text-slate-900">{batch?.dataSourceName ?? "Upload"}</h1>
        {batch && (
          <p className="mb-4 text-xs text-slate-500">
            {batch.fileName ? `${batch.fileName} · ` : ""}uploaded by {batch.uploadedBy} · {batch.totalHoldings} holdings
            {batch.status === "discarded" && " · DISCARDED"}
          </p>
        )}

        {error && (
          <div role="alert" className="mb-3 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
        {notice && (
          <div role="status" className="mb-3 flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {notice}
          </div>
        )}
        {batch?.integrating && (
          <div className="mb-3 flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
            <Loader2 className="h-4 w-4 animate-spin" />
            Integrating into the live data… {c?.integrated ?? 0} done so far. This page refreshes by itself.
          </div>
        )}

        {c && (
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            <Stat label="Pending" value={c.pending} />
            <Stat label="Reviewed by Tax Daroga" value={c.reviewedPending} tone="text-green-700" />
            <Stat label="Awaiting review" value={c.awaitingReview} tone="text-amber-700" />
            <Stat label="Cannot import" value={c.blocked} tone="text-red-700" />
            <Stat label="Kept out" value={c.excluded} />
            <Stat label="Integrated (live)" value={c.integrated} tone="text-green-700" />
            <Stat label="Failed" value={c.failed} tone="text-red-700" />
          </div>
        )}

        {batch && batch.uploadErrors.length > 0 && (
          <details className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <summary className="cursor-pointer font-semibold">{batch.uploadErrors.length} row(s) in the file could not be staged</summary>
            <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
              {batch.uploadErrors.map((e, i) => (
                <li key={i}>
                  <span className="font-mono">{e.sheet} row {e.row}</span>: {e.message}
                </li>
              ))}
            </ul>
          </details>
        )}

        {c && (
          <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-1 flex items-baseline justify-between text-sm">
              <span className="font-semibold text-slate-700">Import progress</span>
              <span className="text-slate-600">
                {c.integrated} of {batch!.totalHoldings} holdings live ({batch!.totalHoldings ? Math.round((c.integrated / batch!.totalHoldings) * 100) : 0}%)
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full bg-green-500" style={{ width: `${batch!.totalHoldings ? (c.integrated / batch!.totalHoldings) * 100 : 0}%` }} />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {c.reviewedPending} reviewed and ready for final approval · {c.awaitingReview} awaiting Tax Daroga review · {c.excluded} kept out · {c.failed} failed · {c.blocked} cannot be imported
              {batch!.lastRunAt ? ` · last run ${new Date(batch!.lastRunAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}
            </p>
          </div>
        )}

        {isCommissioner && (
          <p className="rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-600">
            The City Manager gives final approval and integrates the holdings. You can follow the progress here.
          </p>
        )}

        {!isCommissioner && (
        <>
        {!isCityManager && (
          <p className="mb-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
            Review the holdings, keep out any that should not go live, and tag the rest as reviewed. Only reviewed holdings can be integrated, and the final approval is the City Manager&apos;s.
          </p>
        )}
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
          {isCityManager && (
          <>
          <button disabled={locked || !c || c.reviewedPending === 0} onClick={() => startIntegration("all")} className="rounded-md bg-nnm-blue px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
            Integrate all reviewed
          </button>
          <button disabled={locked || sel.length === 0} onClick={() => startIntegration("selected")} className="rounded-md border border-nnm-blue px-3 py-2 text-sm font-semibold text-nnm-blue disabled:opacity-50">
            Integrate selected ({sel.length})
          </button>
          <button disabled={locked || sel.length === 0} onClick={() => startIntegration("all_except")} className="rounded-md border border-nnm-blue px-3 py-2 text-sm font-semibold text-nnm-blue disabled:opacity-50">
            Integrate all except selected
          </button>
          <span className="mx-1 h-6 border-l border-slate-200" />
          </>
          )}
          {isDaroga && (
          <>
          <button
            disabled={locked || sel.length === 0}
            onClick={() => void run(() => markReviewed(batchId, true, { holdingNos: sel }), (r: { updated: number }) => `${r.updated} holding(s) tagged as reviewed.`).then(() => setSelected(new Set()))}
            className="rounded-md bg-green-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Mark selected reviewed
          </button>
          <button
            disabled={locked || !c || c.awaitingReview === 0}
            onClick={() => {
              if (window.confirm(`Tag all ${c?.awaitingReview} pending holding(s) that are not yet reviewed as reviewed by you? Holdings kept out or with a blocking issue are not included.`))
                void run(() => markReviewed(batchId, true, { all: true }), (r: { updated: number }) => `${r.updated} holding(s) tagged as reviewed.`);
            }}
            className="rounded-md border border-green-700 px-3 py-2 text-sm font-semibold text-green-700 disabled:opacity-50"
          >
            Mark all pending reviewed
          </button>
          <button
            disabled={locked || sel.length === 0}
            onClick={() => void run(() => markReviewed(batchId, false, { holdingNos: sel }), (r: { updated: number }) => `Reviewed tag removed from ${r.updated} holding(s).`).then(() => setSelected(new Set()))}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
          >
            Remove reviewed tag
          </button>
          <span className="mx-1 h-6 border-l border-slate-200" />
          </>
          )}
          <button
            disabled={locked || sel.length === 0}
            onClick={() => {
              const reason = window.prompt("Reason for keeping these holdings out (optional):") ?? undefined;
              void run(() => excludeStaged(batchId, sel, reason), (r: { excluded: number }) => `${r.excluded} holding(s) kept out.`).then(() => setSelected(new Set()));
            }}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
          >
            Keep selected out
          </button>
          <button
            disabled={locked || sel.length === 0}
            onClick={() => void run(() => restoreStaged(batchId, sel), (r: { restored: number }) => `${r.restored} holding(s) put back to pending.`).then(() => setSelected(new Set()))}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
          >
            Put selected back
          </button>
          {isCityManager && (
          <button
            disabled={locked}
            onClick={() => {
              if (window.confirm("Discard this whole upload? Holdings not yet integrated are dropped for good; integrated ones stay live.")) void run(() => discardImport(batchId), () => "Upload discarded.");
            }}
            className="ml-auto rounded-md border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-50"
          >
            Discard upload
          </button>
          )}
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            <option value="pending">Pending</option>
            <option value="excluded">Kept out</option>
            <option value="failed">Failed</option>
            <option value="integrated">Integrated</option>
            <option value="all">All</option>
          </select>
          <select value={issues} onChange={(e) => { setIssues(e.target.value); setPage(1); }} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            <option value="all">Any issues</option>
            <option value="clean">No issues</option>
            <option value="warnings">With warnings</option>
            <option value="blocked">Cannot import</option>
          </select>
          <select value={review} onChange={(e) => { setReview(e.target.value); setPage(1); }} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            <option value="all">Reviewed or not</option>
            <option value="reviewed">Reviewed</option>
            <option value="unreviewed">Not reviewed</option>
          </select>
          <select value={ward} onChange={(e) => { setWard(e.target.value); setPage(1); }} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            <option value="">All wards</option>
            {list?.wards.map((w) => <option key={w} value={w}>Ward {w}</option>)}
          </select>
          <form onSubmit={(e) => { e.preventDefault(); setSearch(searchInput.trim()); setPage(1); }} className="flex gap-1">
            <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Holding no. or owner" className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
            <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">Search</button>
          </form>
          {selected.size > 0 && (
            <button onClick={() => setSelected(new Set())} className="text-sm text-slate-500 underline">Clear selection ({selected.size})</button>
          )}
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="w-10 px-3 py-2"><input type="checkbox" checked={allOnPage} onChange={(e) => togglePage(e.target.checked)} aria-label="Select all on this page" /></th>
                <th className="px-3 py-2">Holding</th>
                <th className="px-3 py-2">Owner</th>
                <th className="px-3 py-2">Ward</th>
                <th className="px-3 py-2">Area</th>
                <th className="px-3 py-2">Floors</th>
                <th className="px-3 py-2">Checks</th>
                <th className="px-3 py-2">Review</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {!list && <tr><td colSpan={9} className="px-3 py-6 text-center text-slate-400">Loading…</td></tr>}
              {list?.items.length === 0 && <tr><td colSpan={9} className="px-3 py-6 text-center text-slate-400">Nothing matches these filters.</td></tr>}
              {list?.items.map((h) => {
                const blocks = h.issues.filter((i) => i.severity === "block").length;
                const warns = h.issues.length - blocks;
                return (
                  <tr key={h.holdingNo} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2">
                      <input type="checkbox" disabled={h.hasBlocker || h.status === "integrated"} checked={selected.has(h.holdingNo)}
                        onChange={(e) => { const n = new Set(selected); if (e.target.checked) n.add(h.holdingNo); else n.delete(h.holdingNo); setSelected(n); }} aria-label={`Select ${h.holdingNo}`} />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      <button onClick={() => void openDetail(h)} className="text-nnm-blue hover:underline">{h.holdingNo}</button>
                    </td>
                    <td className="px-3 py-2">{h.ownerName ?? "-"}</td>
                    <td className="px-3 py-2">{h.ward ?? "-"}</td>
                    <td className="px-3 py-2">{h.areaSqft ?? "-"}</td>
                    <td className="px-3 py-2">{h.floorsCount}</td>
                    <td className="px-3 py-2 text-xs">
                      {blocks > 0 && <span className="mr-1 rounded bg-red-100 px-1.5 py-0.5 font-semibold text-red-700">{blocks} blocking</span>}
                      {warns > 0 && <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-700">{warns} warning{warns > 1 ? "s" : ""}</span>}
                      {h.issues.length === 0 && <span className="text-green-700">OK</span>}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {h.reviewedAt ? (
                        <span className="text-green-700">Reviewed{h.reviewedBy ? ` by ${h.reviewedBy}` : ""}</span>
                      ) : h.status === "integrated" ? (
                        "-"
                      ) : (
                        <span className="text-slate-400">Not reviewed</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_CLASS[h.status]}`}>{STATUS_LABEL[h.status]}</span>
                      {h.excludeReason && <span className="mt-0.5 block text-[11px] text-slate-500">{h.excludeReason}</span>}
                      {h.error && <span className="mt-0.5 block text-[11px] text-red-600">{h.error}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {list && (
          <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
            <span>{list.total} holding(s)</span>
            <div className="flex items-center gap-2">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40">Previous</button>
              <span>Page {page} of {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
        </>
        )}
      </main>

      {(detail || detailLoading) && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={() => setDetail(null)}>
          <div className="mt-8 w-full max-w-3xl rounded-xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-mono text-base font-semibold">{detail?.holdingNo ?? "Loading…"}</h2>
              <button onClick={() => setDetail(null)} aria-label="Close"><X className="h-5 w-5" /></button>
            </div>
            {detailLoading && <Loader2 className="h-5 w-5 animate-spin" />}
            {detail && (
              <div className="space-y-4 text-sm">
                {detail.issues.length > 0 && (
                  <ul className="space-y-1">
                    {detail.issues.map((i, k) => (
                      <li key={k} className={i.severity === "block" ? "text-red-700" : "text-amber-700"}>
                        {i.severity === "block" ? "Blocking: " : "Warning: "}{i.message}
                      </li>
                    ))}
                  </ul>
                )}
                {detail.error && <p className="text-red-700">{detail.error}</p>}
                <p className="text-slate-600">{detail.reviewedAt ? `Reviewed by ${detail.reviewedBy ?? "Tax Daroga"}.` : "Not yet reviewed by the Tax Daroga."}</p>
                {Object.keys(detail.master).length === 0 && <p className="text-slate-500">The staged data for this holding is no longer kept (it is already live or the upload was discarded).</p>}
                {Object.keys(detail.master).length > 0 && (
                  <div>
                    <h3 className="mb-1 font-semibold">Master</h3>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
                      {Object.entries(detail.master).filter(([, v]) => v !== "").map(([k, v]) => (
                        <div key={k}><dt className="text-[11px] text-slate-400">{k}</dt><dd className="break-words">{v}</dd></div>
                      ))}
                    </dl>
                  </div>
                )}
                {Object.entries(detail.sheets).map(([name, rows]) => (
                  <div key={name}>
                    <h3 className="mb-1 font-semibold">{name} ({rows.length})</h3>
                    <div className="overflow-x-auto rounded border border-slate-200">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50"><tr>{Object.keys(rows[0] ?? {}).filter((k) => k !== "HoldingNo").map((k) => <th key={k} className="whitespace-nowrap px-2 py-1">{k}</th>)}</tr></thead>
                        <tbody>
                          {rows.slice(0, 50).map((r, i) => (
                            <tr key={i} className="border-t border-slate-100">{Object.entries(r).filter(([k]) => k !== "HoldingNo").map(([k, v]) => <td key={k} className="whitespace-nowrap px-2 py-1">{v}</td>)}</tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
