"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, GitMerge, Loader2, Plus, RotateCcw, Trash2, X } from "lucide-react";
import {
  decideResolution,
  fetchHeld,
  fetchHeldItem,
  proposeResolution,
  type HeldCategory,
  type HeldDetail,
  type HeldItem,
  type HeldList,
  type MergeComparison,
  type MergePlan,
  type MergeSummary,
  type ResolutionAction,
  type ResolutionCase,
} from "@/lib/holding-import-api";

const CAT: Record<HeldCategory, { label: string; tone: string }> = {
  kept_out: { label: "Kept out", tone: "bg-slate-200 text-slate-700" },
  blocked: { label: "Cannot be imported", tone: "bg-red-100 text-red-700" },
  failed: { label: "Failed", tone: "bg-red-100 text-red-700" },
  not_staged: { label: "Not staged (file row)", tone: "bg-amber-100 text-amber-800" },
  resolved: { label: "Resolved", tone: "bg-green-100 text-green-700" },
};
const ACTION_LABEL: Record<ResolutionAction, string> = {
  correct_import: "Correct and import",
  import_as_is: "Import as it is",
  merge: "Merge into the live holding",
  drop: "Drop (do not import)",
};
const EVENT_LABEL: Record<string, string> = {
  proposed: "proposed",
  recommended: "recommended",
  reverted: "reverted to Tax Daroga",
  approved: "approved",
  failed: "could not be carried out",
};
const inputClass = "w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-nnm-blue";
const fmt = (v: string) =>
  new Date(v).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

function statusText(c: ResolutionCase | null) {
  if (!c) return { text: "Not taken up", tone: "text-slate-500" };
  if (c.status === "approved") return { text: `Done - ${c.outcome ?? ACTION_LABEL[c.action]}`, tone: "text-green-700" };
  if (c.status === "reverted") return { text: "Reverted to Tax Daroga", tone: "text-amber-700" };
  return { text: `${ACTION_LABEL[c.action]} - with ${c.stageLabel}`, tone: "text-blue-700" };
}

/**
 * The holdings of an upload that did not go live - kept out, cannot be imported, failed, or rows of the file that were
 * never staged - and their resolution: the Tax Daroga proposes (correct and import / import as it is / merge into the
 * live holding / drop), the City Manager and DMC recommend or revert, the Municipal Commissioner approves.
 */
/** "05", " 5 " -> "5": wards from the sheet are compared the way the staged holdings store them. */
const normWard = (w: string | null | undefined) => (w ?? "").trim().replace(/^0+(?=\d)/, "");

export function HeldHoldings({
  batchId,
  role,
  ward = "",
  onWardChange,
}: {
  batchId: number;
  role: string;
  /** The ward chosen on the page ("" = all) - shared with the holdings list below. */
  ward?: string;
  onWardChange?: (ward: string) => void;
}) {
  const [data, setData] = useState<HeldList | null>(null);
  const [filter, setFilter] = useState<HeldCategory | "all" | "mine">("all");
  const [open, setOpen] = useState<HeldItem | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchHeld(batchId)
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load."));
  }, [batchId]);
  useEffect(load, [load]);

  // Ward first, then the category chips count within that ward.
  const inWard = useMemo(() => (data?.items ?? []).filter((i) => !ward || normWard(i.ward) === ward), [data, ward]);
  const items = useMemo(
    () => inWard.filter((i) => filter === "all" || (filter === "mine" ? i.waitingForMe : i.category === filter)),
    [inWard, filter],
  );
  const wards = useMemo(() => {
    const ws = [...new Set((data?.items ?? []).map((i) => normWard(i.ward)).filter(Boolean))];
    return ws.sort((a, b) => (parseInt(a) || 9999) - (parseInt(b) || 9999) || a.localeCompare(b));
  }, [data]);
  if (err) return <p className="mb-4 text-sm text-red-700">{err}</p>;
  if (!data) return null;
  const count = (cat: HeldCategory) => inWard.filter((i) => i.category === cat).length;
  const c = ward
    ? {
        keptOut: count("kept_out"),
        blocked: count("blocked"),
        failed: count("failed"),
        notStaged: count("not_staged"),
        resolved: count("resolved"),
        inProgress: inWard.filter((i) => i.case && !i.resolved).length,
        waitingForMe: inWard.filter((i) => i.waitingForMe).length,
      }
    : data.counts;
  const total = c.keptOut + c.blocked + c.failed + c.notStaged;
  if (!data.items.length) return null;

  return (
    <section className="mb-5 rounded-xl border border-amber-200 bg-white p-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold text-slate-900">
          Held back / not uploaded ({total})
          <select
            value={ward}
            onChange={(e) => onWardChange?.(e.target.value)}
            aria-label="Ward"
            className="rounded-md border border-slate-300 px-2 py-1 text-sm font-normal"
          >
            <option value="">All wards</option>
            {wards.map((w) => (
              <option key={w} value={w}>
                Ward {w}
              </option>
            ))}
          </select>
        </h2>
        <span className="text-xs text-slate-500">
          {c.resolved} resolved · {c.inProgress} in the approval chain
          {c.waitingForMe ? <b className="ml-1 text-amber-700">· {c.waitingForMe} waiting for you</b> : null}
        </span>
      </div>
      <p className="mb-3 text-xs text-slate-500">
        The Tax Daroga proposes how to resolve each one - correct and import, import as it is, merge into the live holding of the same
        number, or drop. It goes to the City Manager, then the DMC, and the Municipal Commissioner&apos;s approval carries it out. Every
        step, change and rejected value is kept.
      </p>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(
          [
            ["all", "All", inWard.length],
            ["mine", "Waiting for you", c.waitingForMe],
            ["kept_out", CAT.kept_out.label, c.keptOut],
            ["blocked", CAT.blocked.label, c.blocked],
            ["failed", CAT.failed.label, c.failed],
            ["not_staged", CAT.not_staged.label, c.notStaged],
            ["resolved", CAT.resolved.label, inWard.filter((i) => i.category === "resolved").length],
          ] as const
        ).map(([k, l, n]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium ${filter === k ? "border-nnm-blue bg-nnm-blue text-white" : "border-slate-300 bg-white text-slate-700"}`}
          >
            {l} ({n})
          </button>
        ))}
      </div>
      <div className="max-h-[28rem] overflow-auto rounded-md border border-slate-100">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2">Holding / row</th>
              <th className="px-3 py-2">Owner · ward</th>
              <th className="px-3 py-2">Why held</th>
              <th className="px-3 py-2">Resolution</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => {
              const st = statusText(i.case);
              return (
                <tr
                  key={i.ref}
                  onClick={() => setOpen(i)}
                  className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 ${i.waitingForMe ? "bg-amber-50" : ""}`}
                >
                  <td className="px-3 py-2">
                    <span className="font-mono font-semibold">{i.holdingNo ?? "(no holding no.)"}</span>
                    <span className={`ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold ${CAT[i.category].tone}`}>
                      {CAT[i.category].label}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {i.ownerName ?? "-"}
                    {i.ward ? ` · ${i.ward}` : ""}
                  </td>
                  <td className="max-w-md px-3 py-2 text-slate-600">{i.problem}</td>
                  <td className={`px-3 py-2 font-medium ${st.tone}`}>
                    {st.text}
                    {i.waitingForMe && <span className="block text-amber-700">Waiting for you</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {open && (
        <ResolutionPanel
          batchId={batchId}
          item={open}
          role={role}
          closed={data.batchStatus !== "open"}
          onClose={() => setOpen(null)}
          onChanged={() => {
            load();
          }}
        />
      )}
    </section>
  );
}

function ResolutionPanel({
  batchId,
  item,
  role,
  closed,
  onClose,
  onChanged,
}: {
  batchId: number;
  item: HeldItem;
  role: string;
  closed: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [d, setD] = useState<HeldDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState("");

  const load = useCallback(() => {
    fetchHeldItem(batchId, item.ref)
      .then(setD)
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load."));
  }, [batchId, item.ref]);
  useEffect(load, [load]);

  const current = d?.proposal ?? null;
  const tdMayPropose = role === "tax_daroga" && !closed && item.category !== "resolved" && (!current || current.status === "reverted");
  const myTurn = !!current && current.status === "open" && current.stage === role;

  async function decide(decision: "forward" | "approve" | "revert") {
    setErr(null);
    if (decision === "revert" && comment.trim().length < 5) return setErr("Say what the Tax Daroga has to correct.");
    setBusy(true);
    try {
      const r = await decideResolution(current!.id, decision, comment.trim() || null);
      setMsg(
        decision === "revert"
          ? "Reverted to the Tax Daroga."
          : decision === "forward"
            ? "Recommended and sent up the chain."
            : r.status === "approved"
              ? `Approved - ${(r.detail ?? r.outcome ?? "").replace(/\.$/, "")}.`
              : `Could not be carried out: ${r.outcome}. It has gone back to the Tax Daroga.`,
      );
      setComment("");
      load();
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="h-full w-full max-w-4xl overflow-y-auto bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-mono text-base font-semibold">{item.holdingNo ?? "(no holding no.)"}</h3>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${CAT[item.category].tone}`}>{CAT[item.category].label}</span>
            <p className="mt-1 text-sm text-slate-600">{item.problem}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        {err && <p className="mb-3 rounded-md border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">{err}</p>}
        {msg && <p className="mb-3 rounded-md border border-green-200 bg-green-50 p-2.5 text-sm text-green-800">{msg}</p>}
        {!d ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : (
          <div className="space-y-5">
            {current && current.status === "open" && <ProposalView p={current} detail={d} />}
            {current?.status === "reverted" && (
              <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <RotateCcw className="mr-1 inline h-4 w-4" />
                <b>Reverted:</b> {current.events[current.events.length - 1]?.comment}
                <span className="block text-xs">({current.events[current.events.length - 1]?.by})</span>
              </p>
            )}
            {myTurn && (
              <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={2}
                  placeholder={role === "commissioner" ? "Remarks (required to revert)" : "Remarks (required to revert)"}
                  className={inputClass}
                />
                <div className="flex flex-wrap gap-2">
                  {role === "commissioner" ? (
                    <button
                      onClick={() => decide("approve")}
                      disabled={busy}
                      className="rounded-md bg-green-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {busy ? "Working…" : "Approve and carry out"}
                    </button>
                  ) : (
                    <button
                      onClick={() => decide("forward")}
                      disabled={busy}
                      className="rounded-md bg-green-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      Recommend - send to {role === "city_manager" ? "DMC" : "Municipal Commissioner"}
                    </button>
                  )}
                  <button
                    onClick={() => decide("revert")}
                    disabled={busy}
                    className="inline-flex items-center gap-1 rounded-md border border-amber-400 bg-white px-4 py-2 text-xs font-semibold text-amber-800 disabled:opacity-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Revert to Tax Daroga
                  </button>
                </div>
                {role === "commissioner" && (
                  <p className="text-[11px] text-slate-500">
                    Approval carries it out at once: the holding is imported / merged into the live data, or recorded as dropped. Every
                    value taken and rejected is written to the holding history.
                  </p>
                )}
              </div>
            )}
            {tdMayPropose && (
              <ProposalForm
                batchId={batchId}
                item={item}
                detail={d}
                onDone={(m) => {
                  setMsg(m);
                  load();
                  onChanged();
                }}
              />
            )}
            {!tdMayPropose && !current && item.category !== "resolved" && (
              <p className="text-sm text-slate-500">No resolution proposed yet - the Tax Daroga proposes one.</p>
            )}
            <DataView d={d} />
            {d.history.length > 0 && <HistoryView cases={d.history} />}
          </div>
        )}
      </div>
    </div>
  );
}

function DataView({ d }: { d: HeldDetail }) {
  const row = d.master ?? d.rawRow;
  if (!row && !d.floors.length)
    return (
      <p className="text-xs text-slate-500">
        The data of this row is not kept (uploaded before rows were saved) - it can only be dropped, or put right in a new upload.
      </p>
    );
  return (
    <details className="rounded-lg border border-slate-200 p-3 text-xs">
      <summary className="cursor-pointer font-semibold text-slate-700">Uploaded data ({d.sheet} sheet)</summary>
      {row && (
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
          {Object.entries(row).map(([k, v]) => (
            <div key={k}>
              <span className="text-slate-500">{k}:</span> {v || <span className="text-slate-300">blank</span>}
            </div>
          ))}
        </div>
      )}
      {d.floors.length > 0 && <FloorsTable rows={d.floors} title="Floors" />}
    </details>
  );
}

function FloorsTable({ rows, title }: { rows: Record<string, string>[]; title: string }) {
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((c) => c !== "HoldingNo");
  return (
    <div className="mt-2 overflow-x-auto">
      <p className="mb-1 font-semibold text-slate-600">{title}</p>
      {rows.length === 0 ? (
        <p className="text-slate-400">None</p>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="text-left text-slate-500">
              {cols.map((c) => (
                <th key={c} className="pr-2">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-slate-100">
                {cols.map((c) => (
                  <td key={c} className="pr-2">
                    {r[c]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function HistoryView({ cases }: { cases: ResolutionCase[] }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <h4 className="mb-2 text-xs font-semibold uppercase text-slate-500">Audit trail</h4>
      {cases.map((c) => (
        <div key={c.id} className="mb-3 border-b border-slate-100 pb-2 text-xs last:border-0">
          <p className="font-semibold text-slate-800">
            Resolution no. {c.id} - {ACTION_LABEL[c.action]} - <span className={statusText(c).tone}>{statusText(c).text}</span>
          </p>
          <ul className="mt-1 space-y-0.5 text-slate-600">
            {c.events.map((e, i) => (
              <li key={i}>
                <span className="text-slate-400">{fmt(e.at)}</span> · <b>{e.by}</b> {EVENT_LABEL[e.action] ?? e.action}
                {e.comment ? ` - ${e.comment}` : ""}
              </li>
            ))}
          </ul>
          {c.merge && <RejectedList s={c.merge.summary} />}
        </div>
      ))}
    </div>
  );
}

function RejectedList({ s }: { s: MergeSummary }) {
  if (!s.valuesRejected.length) return null;
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-slate-500">{s.valuesRejected.length} value(s) not taken</summary>
      <ul className="mt-1 space-y-0.5">
        {s.valuesRejected.map((r, i) => (
          <li key={i}>
            {r.what}: <s className="text-red-600">{r.rejected.length > 120 ? `${r.rejected.slice(0, 120)}…` : r.rejected}</s> (
            {r.source === "upload" ? "uploaded" : "live"}) - kept {r.kept.length > 120 ? `${r.kept.slice(0, 120)}…` : r.kept}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** The proposal as the City Manager / DMC / Commissioner see it. */
function ProposalView({ p, detail }: { p: NonNullable<HeldDetail["proposal"]>; detail: HeldDetail }) {
  return (
    <div className="rounded-lg border border-blue-200 p-3 text-xs">
      <p className="text-sm font-semibold text-slate-900">
        Proposed: {ACTION_LABEL[p.action]}{" "}
        <span className="font-normal text-slate-500">
          - by {p.createdBy}, now with the {p.stageLabel}
        </span>
      </p>
      <p className="mt-1 text-slate-700">
        <b>Remarks:</b> {p.remarks}
      </p>
      {p.action === "correct_import" && (
        <div className="mt-2">
          {p.master && (
            <table className="w-full">
              <thead>
                <tr className="text-left text-slate-500">
                  <th>Field</th>
                  <th>Uploaded</th>
                  <th>Corrected to</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(p.master).map(([k, v]) => (
                  <tr key={k} className="border-t border-slate-100">
                    <td className="font-medium">{k}</td>
                    <td className="text-red-600 line-through">{(detail.master ?? detail.rawRow)?.[k] || "blank"}</td>
                    <td className="font-semibold text-green-700">{v || "blank"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {p.floors && <FloorsTable rows={p.floors} title="Floors (corrected)" />}
        </div>
      )}
      {p.action === "merge" && p.merge && <MergeTable c={p.merge.comparison} plan={p.merge.plan} readOnly />}
    </div>
  );
}

function ProposalForm({
  batchId,
  item,
  detail,
  onDone,
}: {
  batchId: number;
  item: HeldItem;
  detail: HeldDetail;
  onDone: (m: string) => void;
}) {
  const prev = detail.proposal;
  const [action, setAction] = useState<ResolutionAction>(
    prev?.action ?? (item.canMerge ? "merge" : item.canImport ? "correct_import" : "drop"),
  );
  const base = detail.master ?? {};
  const [fields, setFields] = useState<Record<string, string>>({ ...base, ...(prev?.master ?? {}) });
  const [floors, setFloors] = useState<Record<string, string>[]>(prev?.floors ?? detail.floors);
  const [floorsEdited, setFloorsEdited] = useState(!!prev?.floors);
  const [plan, setPlan] = useState<MergePlan>(
    prev?.merge?.plan ?? {
      fields: Object.fromEntries(
        (detail.merge?.fields ?? []).filter((f) => f.status === "upload_only").map((f) => [f.field, "uploaded" as const]),
      ),
      floors: "keep_live",
      addReceipts: (detail.merge?.receipts ?? []).filter((r) => r.status === "new").map((r) => r.key),
      addNotices: (detail.merge?.notices ?? []).filter((r) => r.status === "new").map((r) => r.key),
      addStages: [],
      appendHistory: (detail.merge?.history.uploaded ?? 0) > 0,
    },
  );
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const issueFields = useMemo(() => {
    const keys = new Set<string>();
    const map: [RegExp, string][] = [
      [/owner name/i, "OwnerName"],
      [/address/i, "Address"],
      [/assessment year/i, "AssessmentYear"],
      [/road type/i, "RoadType"],
      [/already exists/i, "HoldingNo"],
      [/holdingno|holding no/i, "HoldingNo"],
    ];
    for (const i of detail.issues) for (const [re, k] of map) if (re.test(i.message)) keys.add(k);
    if (item.category === "not_staged") keys.add("HoldingNo");
    return keys;
  }, [detail.issues, item.category]);

  const options: ResolutionAction[] = [
    ...(item.canMerge ? (["merge"] as const) : []),
    ...(item.canImport ? (["correct_import", "import_as_is"] as const) : []),
    "drop",
  ];
  const unresolved =
    action === "merge" && detail.merge ? detail.merge.fields.filter((f) => f.status === "differ" && !plan.fields[f.field]).length : 0;

  async function submit() {
    setErr(null);
    if (remarks.trim().length < 5) return setErr("Explain the resolution in the remarks.");
    if (unresolved) return setErr(`Choose the value to keep for the ${unresolved} field(s) where the two data differ.`);
    const masterChanges =
      action === "correct_import" ? Object.fromEntries(Object.entries(fields).filter(([k, v]) => (base[k] ?? "") !== v)) : null;
    setBusy(true);
    try {
      await proposeResolution(batchId, item.ref, {
        action,
        masterChanges,
        floors: action === "correct_import" && floorsEdited ? floors : null,
        mergePlan: action === "merge" ? plan : null,
        remarks: remarks.trim(),
      });
      onDone("Sent to the City Manager.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-300 p-3">
      <h4 className="text-sm font-semibold text-slate-900">{prev ? "Correct and send again" : "Propose a resolution"}</h4>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o}
            onClick={() => setAction(o)}
            className={`inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-semibold ${action === o ? "border-nnm-blue bg-blue-50 text-nnm-blue" : "border-slate-300 text-slate-700"}`}
          >
            {o === "merge" && <GitMerge className="h-3.5 w-3.5" />}
            {o === "drop" && <Trash2 className="h-3.5 w-3.5" />}
            {ACTION_LABEL[o]}
          </button>
        ))}
      </div>

      {action === "correct_import" && (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">Correct the uploaded values. Fields named in the problem are highlighted.</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {Object.keys({ ...base, ...(item.category === "not_staged" ? { HoldingNo: "" } : {}) }).map((k) => (
              <label key={k} className={`text-[11px] ${issueFields.has(k) ? "font-semibold text-red-700" : "text-slate-600"}`}>
                {k}
                <input
                  value={fields[k] ?? ""}
                  onChange={(e) => setFields({ ...fields, [k]: e.target.value })}
                  className={`${inputClass} ${issueFields.has(k) ? "border-red-300" : ""}`}
                />
              </label>
            ))}
          </div>
          <FloorsEditor
            rows={floors}
            onChange={(r) => {
              setFloors(r);
              setFloorsEdited(true);
            }}
          />
        </div>
      )}
      {action === "import_as_is" && (
        <p className="text-xs text-slate-600">The holding is imported with the data as uploaded (only possible when nothing blocks it).</p>
      )}
      {action === "drop" && <p className="text-xs text-slate-600">It will not be imported; the reason in the remarks is kept on record.</p>}
      {action === "merge" && detail.merge && <MergeTable c={detail.merge} plan={plan} onChange={setPlan} />}

      <textarea
        value={remarks}
        onChange={(e) => setRemarks(e.target.value)}
        rows={2}
        placeholder="Remarks - the basis for this resolution (register, survey, documents seen)"
        className={inputClass}
      />
      {err && <p className="text-xs font-medium text-red-700">{err}</p>}
      <button
        onClick={submit}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-md bg-nnm-blue px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
      >
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Send to City Manager
      </button>
    </div>
  );
}

const FLOOR_COLS = ["Floor", "BuildupSqft", "ConstType", "Usage", "Occupancy", "YearBuilt", "ClosingYear"];
function FloorsEditor({ rows, onChange }: { rows: Record<string, string>[]; onChange: (r: Record<string, string>[]) => void }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold text-slate-600">Floors</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-slate-500">
              {FLOOR_COLS.map((c) => (
                <th key={c} className="pr-1">
                  {c}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {FLOOR_COLS.map((c) => (
                  <td key={c} className="pr-1">
                    <input
                      value={r[c] ?? ""}
                      onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, [c]: e.target.value } : x)))}
                      className={inputClass}
                    />
                  </td>
                ))}
                <td>
                  <button
                    onClick={() => onChange(rows.filter((_, j) => j !== i))}
                    className="text-slate-400 hover:text-red-600"
                    aria-label="Remove floor"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        onClick={() => onChange([...rows, Object.fromEntries(FLOOR_COLS.map((c) => [c, ""]))])}
        className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-nnm-blue"
      >
        <Plus className="h-3.5 w-3.5" /> Add floor
      </button>
    </div>
  );
}

const ROW_STATUS: Record<string, string> = {
  new: "Not in live data",
  same: "Already in live data",
  differ: "Differs from live - live kept",
  other_holding: "Belongs to another holding",
  overlap: "Overlaps a live period - live kept",
  invalid: "Incomplete",
};

/** Field-by-field comparison of the upload with the live holding; editable for the Tax Daroga, read-only up the chain. */
function MergeTable({
  c,
  plan,
  onChange,
  readOnly = false,
}: {
  c: MergeComparison;
  plan: MergePlan;
  onChange?: (p: MergePlan) => void;
  readOnly?: boolean;
}) {
  const [showSame, setShowSame] = useState(false);
  const set = (p: Partial<MergePlan>) => onChange?.({ ...plan, ...p });
  const choose = (field: string, v: "live" | "uploaded") => set({ fields: { ...plan.fields, [field]: v } });
  const shown = c.fields.filter((f) => showSame || f.status === "differ" || f.status === "upload_only");
  const toggle = (list: string[], key: string) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);
  const rowList = (title: string, rows: MergeComparison["receipts"], chosen: string[], key: "addReceipts" | "addNotices" | "addStages") =>
    rows.length > 0 && (
      <div>
        <p className="mb-1 font-semibold text-slate-700">{title}</p>
        {rows.map((r) => (
          <label key={r.key} className="flex items-start gap-2 border-t border-slate-100 py-1">
            <input
              type="checkbox"
              disabled={readOnly || r.status !== "new"}
              checked={chosen.includes(r.key)}
              onChange={() => set({ [key]: toggle(chosen, r.key) } as Partial<MergePlan>)}
              className="mt-0.5"
            />
            <span>
              <b className="font-mono">{r.key}</b> - upload: {r.uploaded}
              {r.live && <span className="text-slate-500"> · live: {r.live}</span>}
              <span
                className={`ml-1 rounded px-1 text-[10px] ${r.status === "new" ? "bg-blue-50 text-blue-700" : r.status === "same" ? "bg-slate-100 text-slate-500" : "bg-red-50 text-red-700"}`}
              >
                {ROW_STATUS[r.status]}
              </span>
              {r.note && <span className="block text-[11px] text-slate-500">{r.note}</span>}
            </span>
          </label>
        ))}
      </div>
    );
  return (
    <div className="space-y-4 text-xs">
      <p className="flex items-center gap-1.5 rounded-md bg-amber-50 p-2 text-amber-900">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        Holding {c.holdingNo} already exists in the live data. {c.disputes} point(s) where the two data differ.{" "}
        {!readOnly && "Choose the value to keep for every one; values not chosen are kept in the audit trail."}
      </p>
      <div>
        <div className="mb-1 flex items-center justify-between">
          <p className="font-semibold text-slate-700">Holding details</p>
          <label className="text-slate-500">
            <input type="checkbox" checked={showSame} onChange={(e) => setShowSame(e.target.checked)} className="mr-1" />
            show matching fields too
          </label>
        </div>
        <table className="w-full">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-1">Field</th>
              <th className="py-1">Live value</th>
              <th className="py-1">Uploaded value</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((f) => {
              const pick = plan.fields[f.field] ?? (f.status === "differ" ? undefined : "live");
              const choosable = f.status === "differ" || f.status === "upload_only";
              const cell = (side: "live" | "uploaded", v: string) => {
                const chosen = pick === side;
                return (
                  <td
                    className={`py-1 pr-2 ${choosable ? (chosen ? "font-semibold text-green-700" : pick ? "text-red-500 line-through" : "") : "text-slate-500"}`}
                  >
                    {choosable && !readOnly ? (
                      <label className="flex cursor-pointer items-center gap-1.5 no-underline">
                        <input
                          type="radio"
                          name={`f-${f.field}`}
                          checked={chosen}
                          onChange={() => choose(f.field, side)}
                          disabled={side === "uploaded" ? !f.uploaded : false}
                        />
                        <span className={chosen ? "" : pick ? "line-through" : ""}>{v || <i className="text-slate-400">blank</i>}</span>
                      </label>
                    ) : (
                      v || <i className="text-slate-400">blank</i>
                    )}
                  </td>
                );
              };
              return (
                <tr
                  key={f.field}
                  className={`border-t border-slate-100 ${f.status === "differ" && !plan.fields[f.field] ? "bg-red-50" : ""}`}
                >
                  <td className="py-1 pr-2 font-medium">
                    {f.label}
                    {f.taxEffect && choosable && (
                      <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-800">affects tax</span>
                    )}
                    {f.status === "differ" && <span className="ml-1 rounded bg-red-100 px-1 text-[10px] text-red-700">differs</span>}
                  </td>
                  {cell("live", f.live)}
                  {cell("uploaded", f.uploaded)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {(c.floors.uploaded.length > 0 || c.floors.live.length > 0) && (
        <div>
          <p className="mb-1 font-semibold text-slate-700">
            Floors {c.floors.same && <span className="font-normal text-slate-500">(same in both)</span>}
          </p>
          {!c.floors.same && c.floors.uploaded.length > 0 && (
            <div className="mb-1 flex gap-3">
              {(["keep_live", "use_uploaded"] as const).map((v) => (
                <label key={v} className="flex items-center gap-1">
                  <input type="radio" name="floors" disabled={readOnly} checked={plan.floors === v} onChange={() => set({ floors: v })} />
                  {v === "keep_live" ? "Keep the live floors" : "Use the uploaded floors (tax history is recalculated)"}
                </label>
              ))}
            </div>
          )}
          <div className="space-y-2">
            <div className={plan.floors === "use_uploaded" ? "opacity-50" : ""}>
              <FloorsTable rows={c.floors.live} title="Live" />
            </div>
            <div className={plan.floors === "keep_live" ? "opacity-50" : ""}>
              <FloorsTable rows={c.floors.uploaded} title="Uploaded" />
            </div>
          </div>
        </div>
      )}
      {rowList("Receipts (tick to add to the holding)", c.receipts, plan.addReceipts, "addReceipts")}
      {rowList("Demand notices (tick to add)", c.notices, plan.addNotices, "addNotices")}
      {rowList("Tax history (tick to add a period not assessed in the live data)", c.stages, plan.addStages, "addStages")}
      {c.history.uploaded > 0 && (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            disabled={readOnly}
            checked={plan.appendHistory}
            onChange={(e) => set({ appendHistory: e.target.checked })}
          />
          Add the upload&apos;s {c.history.uploaded} change-history entr(ies) after the holding&apos;s {c.history.live} live entries, so its
          past stays traceable
        </label>
      )}
      {readOnly && (
        <p className="flex items-center gap-1 text-green-700">
          <CheckCircle2 className="h-3.5 w-3.5" /> Green = value to be kept; struck through = value rejected (kept in the audit trail).
        </p>
      )}
    </div>
  );
}
