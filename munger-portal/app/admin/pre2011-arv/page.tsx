"use client";

import { useEffect, useState } from "react";
import { AlertCircle, BookOpen, CheckCircle2, Loader2, Search, XCircle } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { WARDS } from "@/lib/new-holding-api";
import {
  approveEntry,
  fetchEntries,
  fetchWorklist,
  lookupHolding,
  rejectEntry,
  submitEntry,
  type HoldingLookup,
  type Pre2011Entry,
  type WorklistRow,
} from "@/lib/pre2011-arv-api";

const ALLOWED = ["tax_daroga", "city_manager", "deputy_commissioner", "commissioner"];
const inputClass = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-nnm-blue";
const labelClass = "mb-1 block text-xs font-medium text-slate-600";
const rs = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const fmt = (v: string | null) => (v ? new Date(v).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" }) : "-");

/** Tax Daroga: look up a holding and enter its register ARV for each pre-2011 period that is pending. */
function EntryForm({ onSaved }: { onSaved: (msg: string) => void }) {
  const [holdingNo, setHoldingNo] = useState("");
  const [data, setData] = useState<HoldingLookup | null>(null);
  const [arv, setArv] = useState<Record<string, string>>({});
  const [reference, setReference] = useState("");
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function find(no = holdingNo) {
    if (!no.trim()) return;
    setErr(null);
    setData(null);
    setBusy(true);
    try {
      const d = await lookupHolding(no);
      setData(d);
      setArv({});
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load this holding.");
    } finally {
      setBusy(false);
    }
  }

  // Opened from the worklist: ?holding=...
  useEffect(() => {
    const h = new URLSearchParams(window.location.search).get("holding");
    if (h) {
      setHoldingNo(h);
      find(h);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    if (!data) return;
    setErr(null);
    const entries = data.neededPeriods.map((p) => ({ period: p.period, arv: Number(arv[p.period]) }));
    if (entries.some((e) => !(e.arv > 0))) return setErr("Enter the ARV for every period shown.");
    if (reference.trim().length < 3) return setErr("Give the demand register reference (register / page / serial no.).");
    setBusy(true);
    try {
      await submitEntry({ holdingNo: data.holding.holdingNo, entries, registerReference: reference.trim(), remarks: remarks.trim() || null });
      onSaved(`Holding ${data.holding.holdingNo}: ARV sent to the City Manager for approval.`);
      setData(null);
      setHoldingNo("");
      setReference("");
      setRemarks("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  const total = data?.neededPeriods.reduce((s, p) => s + (Number(arv[p.period]) || 0) * (p.taxRatePercent / 100) * p.pendingYearCount, 0) ?? 0;

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-base font-semibold text-slate-900">Enter ARV from the demand register</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          find();
        }}
        className="flex flex-wrap gap-2"
      >
        <input value={holdingNo} onChange={(e) => setHoldingNo(e.target.value)} placeholder="Holding number" maxLength={32} className={`${inputClass} max-w-xs`} />
        <button disabled={busy || !holdingNo.trim()} className="inline-flex items-center gap-1.5 rounded-md bg-nnm-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
          {busy && !data ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Find
        </button>
      </form>
      {err && <p className="text-sm font-medium text-red-700">{err}</p>}
      {data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-lg bg-slate-50 p-3 text-xs sm:grid-cols-3">
            <div>
              <span className="text-slate-500">Holding:</span> <b>{data.holding.holdingNo}</b>
            </div>
            <div>
              <span className="text-slate-500">Owner:</span> <b>{data.holding.ownerName}</b>
            </div>
            <div>
              <span className="text-slate-500">Ward:</span> <b>{data.holding.ward ?? "-"}</b>
            </div>
            <div>
              <span className="text-slate-500">Old holding no.:</span> <b>{data.holding.oldHoldingNo ?? "-"}</b>
            </div>
            <div>
              <span className="text-slate-500">Created:</span> <b>{data.holding.holdingCreationYear ?? "-"}</b>
            </div>
            <div>
              <span className="text-slate-500">Tax paid up to:</span> <b>{data.holding.taxPaidTillYear ?? "Never paid"}</b>
            </div>
          </div>
          {data.pending ? (
            <p className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
              An entry made by {data.pending.entered_by_name} on {fmt(data.pending.entered_at)} is waiting for the City Manager&apos;s approval.
            </p>
          ) : data.neededPeriods.length === 0 ? (
            <p className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
              No pending year before 2011-12 is missing its assessment - nothing to enter.
              {data.missingAfter2011 && ` (Years ${data.missingAfter2011} have no assessment: the holding's floor details need completing.)`}
            </p>
          ) : (
            <>
              <p className="text-sm text-slate-700">
                Pending years with no assessment: <b className="text-red-700">{data.missingYears}</b>. Enter the annual ARV recorded in the demand register for each period.
              </p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase text-slate-500">
                    <th className="py-2">Period of assessment</th>
                    <th className="py-2">Pending years</th>
                    <th className="py-2">Tax rate</th>
                    <th className="py-2">Annual ARV (₹)</th>
                    <th className="py-2 text-right">Tax for pending years</th>
                  </tr>
                </thead>
                <tbody>
                  {data.neededPeriods.map((p) => {
                    const a = Number(arv[p.period]) || 0;
                    return (
                      <tr key={p.period} className="border-b border-slate-100">
                        <td className="py-2">{p.period}</td>
                        <td className="py-2">
                          {p.pendingYears} ({p.pendingYearCount} yr)
                        </td>
                        <td className="py-2">{p.taxRatePercent}%</td>
                        <td className="py-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={arv[p.period] ?? ""}
                            onChange={(e) => setArv({ ...arv, [p.period]: e.target.value })}
                            className={`${inputClass} max-w-[10rem]`}
                          />
                        </td>
                        <td className="py-2 text-right font-mono">{a ? rs(a * (p.taxRatePercent / 100) * p.pendingYearCount) : "-"}</td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td colSpan={4} className="py-2 text-right text-xs font-semibold uppercase text-slate-500">
                      Tax for these years (before late fee)
                    </td>
                    <td className="py-2 text-right font-mono font-semibold">{rs(total)}</td>
                  </tr>
                </tbody>
              </table>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Demand register reference (register / page / serial no.) *</label>
                  <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={300} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Remarks</label>
                  <input value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={1000} className={inputClass} />
                </div>
              </div>
              <button onClick={save} disabled={busy} className="inline-flex items-center gap-1.5 rounded-md bg-nnm-blue px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Send to City Manager for approval
              </button>
            </>
          )}
          {data.history.length > 0 && (
            <div className="text-xs text-slate-600">
              <p className="mb-1 font-semibold">Earlier entries</p>
              {data.history.map((h) => (
                <p key={h.id}>
                  {fmt(h.entered_at)} by {h.entered_by_name}: {h.entries.map((e) => `${e.period} ARV ${rs(e.arv)}`).join("; ")} - <b>{h.status}</b>
                  {h.decided_by_name ? ` by ${h.decided_by_name}` : ""}
                  {h.decision_remarks ? ` (${h.decision_remarks})` : ""}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EntryCard({ e, canDecide, onDone }: { e: Pre2011Entry; canDecide: boolean; onDone: (m: string) => void }) {
  const [mode, setMode] = useState<"approve" | "reject" | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function act() {
    setErr(null);
    if (mode === "reject" && text.trim().length < 3) return setErr("Give the reason.");
    setBusy(true);
    try {
      if (mode === "approve") {
        await approveEntry(e.id, text.trim() || null);
        onDone(`Holding ${e.holding_no}: pre-2011 ARV approved. Any earlier notice is closed - generate a new demand notice, which now includes these years.`);
      } else {
        await rejectEntry(e.id, text.trim());
        onDone(`Holding ${e.holding_no}: entry rejected.`);
      }
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
      <div className="flex flex-wrap items-baseline gap-2">
        <b className="font-mono">{e.holding_no}</b>
        <span className="text-slate-700">{e.owner_name}</span>
        <span className="text-slate-500">· Ward {e.ward ?? "-"} · paid up to {e.tax_paid_till_year ?? "never"}</span>
        <span className="ml-auto text-xs text-slate-400">
          Entered by {e.entered_by_name}, {fmt(e.entered_at)}
        </span>
      </div>
      <table className="mt-2 w-full text-xs">
        <thead>
          <tr className="text-left text-slate-500">
            <th className="py-1">Period</th>
            <th className="py-1">Annual ARV</th>
            <th className="py-1">Rate</th>
            <th className="py-1">Annual tax</th>
            <th className="py-1">Pending years</th>
            <th className="py-1 text-right">Tax</th>
          </tr>
        </thead>
        <tbody>
          {e.lines.map((l) => (
            <tr key={l.period} className="border-t border-slate-100">
              <td className="py-1">{l.period}</td>
              <td className="py-1">{rs(l.arv)}</td>
              <td className="py-1">{l.taxRatePercent}%</td>
              <td className="py-1">{rs(l.annualTax)}</td>
              <td className="py-1">{l.pendingYears}</td>
              <td className="py-1 text-right font-mono">{rs(l.pendingTax)}</td>
            </tr>
          ))}
          <tr className="border-t border-slate-200">
            <td colSpan={5} className="py-1 text-right font-semibold">
              Tax added to the demand (before late fee)
            </td>
            <td className="py-1 text-right font-mono font-semibold">{rs(e.pendingTaxTotal)}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-2 text-xs text-slate-600">
        Register reference: <b>{e.register_reference}</b>
        {e.remarks ? ` · Remarks: ${e.remarks}` : ""}
      </p>
      {e.status !== "pending" ? (
        <p className={`mt-2 text-xs ${e.status === "approved" ? "text-green-700" : "text-red-700"}`}>
          {e.status === "approved" ? <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" /> : <XCircle className="mr-1 inline h-3.5 w-3.5" />}
          <b>{e.status === "approved" ? "Approved" : "Rejected"}</b> by {e.decided_by_name}, {fmt(e.decided_at)}
          {e.decision_remarks ? ` - ${e.decision_remarks}` : ""}
        </p>
      ) : canDecide ? (
        mode ? (
          <div className="mt-3 space-y-2">
            <input value={text} onChange={(x) => setText(x.target.value)} placeholder={mode === "approve" ? "Remarks (optional)" : "Reason for rejecting"} className={inputClass} />
            {err && <p className="text-xs font-medium text-red-700">{err}</p>}
            <div className="flex gap-2">
              <button
                onClick={act}
                disabled={busy}
                className={`rounded-md px-4 py-2 text-xs font-semibold text-white disabled:opacity-60 ${mode === "approve" ? "bg-green-600" : "bg-red-600"}`}
              >
                {busy ? "Saving…" : mode === "approve" ? "Confirm approval" : "Confirm rejection"}
              </button>
              <button onClick={() => setMode(null)} className="rounded-md border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex gap-2">
            <button onClick={() => setMode("approve")} className="rounded-md bg-green-600 px-4 py-2 text-xs font-semibold text-white">
              Approve
            </button>
            <button onClick={() => setMode("reject")} className="rounded-md border border-red-300 px-4 py-2 text-xs font-semibold text-red-700">
              Reject
            </button>
          </div>
        )
      ) : (
        <p className="mt-2 text-xs text-slate-500">Waiting for the City Manager&apos;s approval.</p>
      )}
    </div>
  );
}

export default function Pre2011ArvPage() {
  const admin = useAdminGuard();
  const [tab, setTab] = useState<"entries" | "worklist" | "enter">("entries");
  const [status, setStatus] = useState<"pending" | "approved" | "rejected" | "">("pending");
  const [entries, setEntries] = useState<Pre2011Entry[] | null>(null);
  const [ward, setWard] = useState("");
  const [worklist, setWorklist] = useState<WorklistRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isTd = admin?.role === "tax_daroga";
  const isCm = admin?.role === "city_manager";

  useEffect(() => {
    if (admin?.role === "tax_daroga" && new URLSearchParams(window.location.search).get("holding")) setTab("enter");
  }, [admin]);

  function loadEntries() {
    setEntries(null);
    fetchEntries(status || undefined)
      .then((r) => setEntries(r.entries))
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load."));
  }
  useEffect(() => {
    if (admin && ALLOWED.includes(admin.role) && tab === "entries") loadEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, tab, status]);
  useEffect(() => {
    if (admin && ALLOWED.includes(admin.role) && tab === "worklist") {
      setWorklist(null);
      fetchWorklist(ward || undefined)
        .then(setWorklist)
        .catch((e) => setError(e instanceof Error ? e.message : "Could not load."));
    }
  }, [admin, tab, ward]);

  if (!admin) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  if (!ALLOWED.includes(admin.role)) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <p className="p-10 text-sm text-slate-500">This page is for the Tax Daroga, City Manager, DMC and Commissioner.</p>
      </div>
    );
  }

  const tabs = [
    { id: "entries" as const, label: isCm ? "Entries to approve" : "Entries" },
    { id: "worklist" as const, label: "Holdings needing pre-2011 ARV" },
    ...(isTd ? [{ id: "enter" as const, label: "Enter ARV" }] : []),
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />
      <main className="mx-auto max-w-5xl space-y-5 px-4 py-8 sm:px-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
            <BookOpen className="h-6 w-6" /> Pre-2011 ARV Entry
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            The system has no tax rates before 2011-12, so a holding whose tax was last paid before then can only be assessed from the ARV in the old demand
            register. The <b>Tax Daroga</b> enters it with the register reference; the <b>City Manager</b> approves. Until then no demand notice can be generated
            and no payment collected for that holding. Tax: 37.5% of ARV for 1997-98 to 2010-11, 45% before 1996-97.
          </p>
        </div>
        {error && (
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
        {notice && <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm font-medium text-green-800">{notice}</div>}
        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${tab === t.id ? "bg-nnm-blue text-white" : "border border-slate-300 bg-white text-slate-700"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "enter" && isTd && (
          <EntryForm
            onSaved={(m) => {
              setNotice(m);
              setStatus("pending");
              setTab("entries");
            }}
          />
        )}

        {tab === "entries" && (
          <>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["pending", "Awaiting approval"],
                  ["approved", "Approved"],
                  ["rejected", "Rejected"],
                  ["", "All"],
                ] as const
              ).map(([v, l]) => (
                <button
                  key={l}
                  onClick={() => setStatus(v)}
                  className={`rounded-md px-3 py-1 text-xs font-semibold ${status === v ? "bg-slate-800 text-white" : "border border-slate-300 bg-white text-slate-600"}`}
                >
                  {l}
                </button>
              ))}
            </div>
            {!entries ? (
              <p className="text-sm text-slate-400">Loading…</p>
            ) : entries.length === 0 ? (
              <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Nothing here.</p>
            ) : (
              <div className="space-y-3">
                {entries.map((e) => (
                  <EntryCard
                    key={e.id}
                    e={e}
                    canDecide={isCm}
                    onDone={(m) => {
                      setNotice(m);
                      loadEntries();
                    }}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {tab === "worklist" && (
          <div className="space-y-3">
            <select value={ward} onChange={(e) => setWard(e.target.value)} className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm">
              <option value="">All wards</option>
              {WARDS.map((w) => (
                <option key={w} value={w}>
                  Ward {w}
                </option>
              ))}
            </select>
            {!worklist ? (
              <p className="text-sm text-slate-400">Loading…</p>
            ) : worklist.length === 0 ? (
              <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">No holding is missing its pre-2011 assessment.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <p className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">{worklist.length} holding(s) cannot be billed until their pre-2011 ARV is entered.</p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase text-slate-500">
                      <th className="px-4 py-2">Holding</th>
                      <th className="px-4 py-2">Owner</th>
                      <th className="px-4 py-2">Ward</th>
                      <th className="px-4 py-2">Paid up to</th>
                      <th className="px-4 py-2">Years missing</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {worklist.map((w) => (
                      <tr key={w.holdingNo} className="border-b border-slate-50">
                        <td className="px-4 py-2 font-mono text-xs">{w.holdingNo}</td>
                        <td className="px-4 py-2">{w.ownerName}</td>
                        <td className="px-4 py-2">{w.ward ?? "-"}</td>
                        <td className="px-4 py-2">{w.taxPaidTillYear ?? "Never"}</td>
                        <td className="px-4 py-2 text-red-700">{w.missingYears}</td>
                        <td className="px-4 py-2 text-xs">
                          {w.awaitingApprovalSince ? (
                            <span className="text-blue-700">Awaiting approval</span>
                          ) : isTd ? (
                            <a href={`/admin/pre2011-arv?holding=${encodeURIComponent(w.holdingNo)}`} className="font-semibold text-nnm-blue hover:underline">
                              Enter ARV
                            </a>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
