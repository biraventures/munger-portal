"use client";

import { snapshotOfRow, type FloorFormState, type FloorSnapshot } from "@/components/operator/floor-row";

/**
 * Floor-by-floor statement of a change to an existing holding's floors. Every floor row that differs from the
 * recorded floor it comes from says how ITS change applies - "changed from year ___" (earlier years keep the old
 * details - the past is not rewritten) or "correction" (it was always so); a recorded floor that is gone says from
 * when it no longer exists (or that it never existed); a new row is either a new floor (built from year ___) or part
 * of a recorded floor (a split - e.g. part of the ground floor became a shop). One reason for the whole edit.
 * A change of use, or anything back-dated / corrected, goes Tax Daroga -> City Manager -> Deputy Commissioner and needs
 * a photo of the premises. The server enforces the same rules (utils/floorTimeline.ts planFloorChanges).
 */

type Kind = "" | "from_year" | "correction";

export interface FloorChangeState {
  reason: string;
  /** Recorded floors that are gone, by snapshot key. */
  removed: Record<string, { floor: FloorSnapshot; kind: Kind; year: string }>;
}

export const blankFloorChange = (): FloorChangeState => ({ reason: "", removed: {} });

const n = (v: unknown) =>
  String(v ?? "")
    .trim()
    .toLowerCase();
const yearStart = (v: unknown) => {
  const m = /^(\d{4})/.exec(String(v ?? "").trim());
  return m ? Number(m[1]) : null;
};
export const snapKey = (f: FloorSnapshot) =>
  [
    n(f.floorLabel),
    Number(f.buildupSqft) || 0,
    n(f.constType),
    n(f.usageType),
    n(f.occupancy) || "self",
    yearStart(f.yearBuilt) ?? "",
    yearStart(f.closingYear) ?? "",
  ].join("|");
const rowKey = (f: FloorFormState) => snapKey(snapshotOfRow(f));
const describe = (f: FloorSnapshot | FloorFormState) =>
  `${f.usageType || "-"}, ${f.constType}, ${Number(f.buildupSqft) || 0} sqft${n(f.occupancy) === "rented" ? ", rented" : ""}`;

export function currentFyStart(): number {
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
  return ist.getUTCMonth() >= 3 ? ist.getUTCFullYear() : ist.getUTCFullYear() - 1;
}

/** Recorded floors (when loaded) get their snapshot as `source`, so every later row knows where it came from. */
export function withSources(rows: FloorFormState[]): FloorFormState[] {
  return rows.map((r) => (r.source ? r : { ...r, source: snapshotOfRow(r) }));
}

interface Plan {
  changed: { original: FloorSnapshot; rows: FloorFormState[] }[];
  removed: FloorSnapshot[];
  added: FloorFormState[];
}

export function planOf(original: FloorFormState[], current: FloorFormState[]): Plan {
  const originals = original.map((o) => o.source ?? snapshotOfRow(o));
  const byKey = new Map<string, FloorFormState[]>();
  const added: FloorFormState[] = [];
  for (const r of current) {
    if (r.source) byKey.set(snapKey(r.source), [...(byKey.get(snapKey(r.source)) ?? []), r]);
    else added.push(r);
  }
  const plan: Plan = { changed: [], removed: [], added };
  for (const o of originals) {
    const k = snapKey(o);
    const rows = byKey.get(k);
    if (!rows?.length) {
      plan.removed.push(o);
      continue;
    }
    byKey.delete(k);
    if (!(rows.length === 1 && rowKey(rows[0]!) === k)) plan.changed.push({ original: o, rows });
  }
  for (const rows of byKey.values()) added.push(...rows); // came from something no longer recorded
  return plan;
}

export function floorsChanged(original: FloorFormState[], current: FloorFormState[]): boolean {
  const p = planOf(original, current);
  return p.changed.length + p.removed.length + p.added.length > 0;
}

const backDated = (kind: Kind | undefined, year: string | undefined) =>
  kind === "correction" || (kind === "from_year" && (yearStart(year) ?? currentFyStart()) < currentFyStart());

/** Whether this goes Tax Daroga -> City Manager -> DMC (and so needs a premises photo). */
export function isUseChange(original: FloorFormState[], current: FloorFormState[], fc: FloorChangeState): boolean {
  const p = planOf(original, current);
  if (p.changed.some((c) => c.rows.some((r) => n(r.usageType) !== n(c.original.usageType) || backDated(r.changeKind, r.changeYear))))
    return true;
  if (p.added.some((r) => backDated(r.changeKind, r.changeYear))) return true;
  return p.removed.some((o) => {
    const s = fc.removed[snapKey(o)];
    return backDated(s?.kind, s?.year);
  });
}

/** A problem with the statements, or null when they are complete. */
export function floorChangeProblem(original: FloorFormState[], current: FloorFormState[], fc: FloorChangeState): string | null {
  const p = planOf(original, current);
  if (p.changed.length + p.removed.length + p.added.length === 0) return null;
  const need = (kind: Kind | undefined, year: string | undefined, what: string) =>
    !kind
      ? `${what}: choose whether it changed from a particular year or is a correction.`
      : kind === "from_year" && !year
        ? `${what}: select the year.`
        : null;
  for (const c of p.changed) {
    const first = c.rows[0]!;
    const e = need(first.changeKind, first.changeYear, c.original.floorLabel);
    if (e) return e;
  }
  for (const r of p.added) {
    const e = need(r.changeKind, r.changeYear, `${r.floorLabel || "New floor"} (added)`);
    if (e) return e;
  }
  for (const o of p.removed) {
    const s = fc.removed[snapKey(o)];
    const e = need(s?.kind, s?.year, `${o.floorLabel} (removed)`);
    if (e) return e;
  }
  if (!fc.reason.trim()) return "Give the reason for the floor change.";
  return null;
}

/** The per-row part of the save payload. */
export function floorRowExtras(f: FloorFormState) {
  return {
    source: f.source ?? null,
    change: f.changeKind ? { kind: f.changeKind, effectiveYear: f.changeKind === "from_year" ? f.changeYear || null : null } : null,
  };
}

/** The edit-level part of the save payload. */
export function floorChangePayload(fc: FloorChangeState) {
  return {
    mode: "per_floor" as const,
    reason: fc.reason.trim(),
    removed: Object.values(fc.removed)
      .filter((r) => r.kind)
      .map((r) => ({
        floor: r.floor,
        kind: r.kind as "from_year" | "correction",
        effectiveYear: r.kind === "from_year" ? r.year || null : null,
      })),
  };
}

/** Restores the statements saved on a request (resubmission / review). */
export function floorChangeFromSaved(saved: unknown): FloorChangeState {
  const fc = (saved ?? {}) as { reason?: string; removed?: { floor: FloorSnapshot; kind: Kind; effectiveYear?: string | null }[] };
  const removed: FloorChangeState["removed"] = {};
  for (const r of fc.removed ?? []) removed[snapKey(r.floor)] = { floor: r.floor, kind: r.kind, year: String(r.effectiveYear ?? "") };
  return { reason: String(fc.reason ?? ""), removed };
}

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";

function SpecPicker({
  kind,
  year,
  years,
  onChange,
  fromLabel,
  correctionLabel,
}: {
  kind: Kind | undefined;
  year: string | undefined;
  years: string[];
  onChange: (kind: Kind, year: string) => void;
  fromLabel: string;
  correctionLabel: string;
}) {
  return (
    <div className="mt-2 flex flex-col gap-2 text-sm sm:flex-row sm:flex-wrap sm:items-center">
      <label className="flex items-center gap-2">
        <input type="radio" checked={kind === "from_year"} onChange={() => onChange("from_year", year ?? "")} />
        {fromLabel}
      </label>
      {kind === "from_year" && (
        <select value={year ?? ""} onChange={(e) => onChange("from_year", e.target.value)} className={`${inputClass} sm:w-44`}>
          <option value="">Select year…</option>
          {years.map((y, i) => (
            <option key={y} value={y}>
              {y}
              {i === 0 ? " (this year)" : ""}
            </option>
          ))}
        </select>
      )}
      <label className="flex items-center gap-2">
        <input type="radio" checked={kind === "correction"} onChange={() => onChange("correction", "")} />
        {correctionLabel}
      </label>
    </div>
  );
}

export function FloorChangeBox({
  original,
  current,
  onFloorsChange,
  creationYear,
  value,
  onChange,
  photo,
  onPhoto,
  photoNote,
}: {
  /** The rows as loaded (each with its `source`). */
  original: FloorFormState[];
  current: FloorFormState[];
  onFloorsChange: (rows: FloorFormState[]) => void;
  creationYear: string | null | undefined;
  value: FloorChangeState;
  onChange: (v: FloorChangeState) => void;
  /** When given, a premises-photo picker is shown (operator / resurvey). Otherwise `photoNote` says which photo serves. */
  photo?: File | null;
  onPhoto?: (f: File | null) => void;
  photoNote?: string;
}) {
  const plan = planOf(original, current);
  if (plan.changed.length + plan.removed.length + plan.added.length === 0) return null;
  const now = currentFyStart();
  const created = yearStart(creationYear) ?? now - 30;
  const years: string[] = [];
  for (let y = now; y > created; y--) years.push(`${y}-${y + 1}`);
  const originals = original.map((o) => o.source ?? snapshotOfRow(o));
  const setRows = (rows: FloorFormState[], patch: Partial<FloorFormState>) =>
    onFloorsChange(current.map((r) => (rows.includes(r) ? { ...r, ...patch } : r)));
  const useChange = isUseChange(original, current, value);
  const card = "rounded-lg border border-amber-200 bg-white p-3";

  return (
    <section className="space-y-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
      <div>
        <h3 className="text-sm font-semibold text-amber-900">Floor changes - say for each floor how it applies</h3>
        <p className="mt-0.5 text-xs text-amber-800">
          Years already paid are never changed. &quot;Changed from a year&quot; keeps the old details for the years before it;
          &quot;Correction&quot; recalculates every unpaid year.
        </p>
      </div>

      {plan.changed.map((c) => {
        const first = c.rows[0]!;
        return (
          <div key={snapKey(c.original)} className={card}>
            <p className="text-sm font-semibold text-slate-900">{c.original.floorLabel}</p>
            <p className="text-xs text-slate-600">
              Before: {describe(c.original)} <span className="text-slate-400">→</span> Now: {c.rows.map((r) => describe(r)).join(" + ")}
              {c.rows.length > 1 && <span className="ml-1 rounded bg-slate-100 px-1.5 text-[11px]">split into {c.rows.length} parts</span>}
            </p>
            <SpecPicker
              kind={first.changeKind}
              year={first.changeYear}
              years={years}
              onChange={(kind, year) => setRows(c.rows, { changeKind: kind, changeYear: year })}
              fromLabel="Changed from"
              correctionLabel="Correction - it was always like this"
            />
          </div>
        );
      })}

      {plan.added.map((r) => {
        const linkable = originals;
        return (
          <div key={r.key} className={card}>
            <p className="text-sm font-semibold text-slate-900">
              {r.floorLabel || "New row"} <span className="font-normal text-slate-500">- {describe(r)}</span>
            </p>
            <label className="mt-2 block text-xs text-slate-600">
              This row is
              <select
                value=""
                onChange={(e) => {
                  const o = linkable[Number(e.target.value)];
                  if (o) setRows([r], { source: o });
                }}
                className={`${inputClass} mt-1`}
              >
                <option value="">a new floor (not part of a recorded floor)</option>
                {linkable.map((o, i) => (
                  <option key={snapKey(o)} value={i}>
                    part of the recorded {o.floorLabel} ({describe(o)}) - split
                  </option>
                ))}
              </select>
            </label>
            <SpecPicker
              kind={r.changeKind}
              year={r.changeYear}
              years={years}
              onChange={(kind, year) => setRows([r], { changeKind: kind, changeYear: year })}
              fromLabel="Built / started from"
              correctionLabel="Correction - it always existed"
            />
          </div>
        );
      })}

      {plan.removed.map((o) => {
        const k = snapKey(o);
        const s = value.removed[k];
        return (
          <div key={k} className={card}>
            <p className="text-sm font-semibold text-slate-900">
              {o.floorLabel} <span className="font-normal text-slate-500">- {describe(o)} - removed</span>
            </p>
            <SpecPicker
              kind={s?.kind}
              year={s?.year}
              years={years}
              onChange={(kind, year) => onChange({ ...value, removed: { ...value.removed, [k]: { floor: o, kind, year } } })}
              fromLabel="No longer exists from"
              correctionLabel="Correction - it never existed"
            />
          </div>
        );
      })}

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">Reason (for the whole change)</span>
        <input
          value={value.reason}
          onChange={(e) => onChange({ ...value, reason: e.target.value })}
          placeholder="e.g. Ground floor hotel closed, now a residence"
          className={inputClass}
        />
      </label>

      {useChange && (
        <div className="rounded-md border border-amber-200 bg-white p-3 text-xs text-slate-700">
          <p className="font-semibold text-amber-900">
            Change of use / back-dated change: approved by the Tax Daroga, the City Manager and the Deputy Commissioner.
          </p>
          {onPhoto ? (
            <label className="mt-2 block">
              <span className="mb-1 block font-medium text-slate-600">Photo of the premises (required)</span>
              <input
                type="file"
                accept="image/jpeg,image/png"
                capture="environment"
                onChange={(e) => onPhoto(e.target.files?.[0] ?? null)}
                className="block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-nnm-blue file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white"
              />
              {photo && <span className="mt-1 block text-green-700">Attached: {photo.name}</span>}
            </label>
          ) : (
            photoNote && <p className="mt-1">{photoNote}</p>
          )}
        </div>
      )}
    </section>
  );
}
