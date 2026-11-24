import type { FloorRow } from "../types/property.types";
import type { FloorInput } from "../types/propertySave.types";
import { parseYearStartOrNull } from "./assessmentYear";

/**
 * Floors as a timeline. A floor's use, construction or area changing from a given year is recorded as two rows with
 * the same floor label - the old one closed at the year before (closing year), the new one starting that year (year
 * built) - so every past year keeps the use it actually had. See applyFloorChangeFromYear.
 */

const fy = (y: number) => `${y}-${y + 1}`;
const yr = (v: unknown) => parseYearStartOrNull(v === null || v === undefined ? null : String(v));
const norm = (v: unknown) =>
  String(v ?? "")
    .trim()
    .toLowerCase();

/** What a floor row is, ignoring its years. */
function shape(label: unknown, sqft: unknown, constType: unknown, usage: unknown, occupancy: unknown): string {
  return [norm(label), Number(sqft) || 0, norm(constType), norm(usage), norm(occupancy) || "self"].join("|");
}
const rowShape = (f: FloorRow) => shape(f.floor_label, f.buildup_sqft, f.const_type, f.usage_type, f.occupancy);
const inputShape = (f: FloorInput) => shape(f.floorLabel, f.buildupSqft, f.constType, f.usageType, f.occupancy);
const rowKey = (f: FloorRow) => `${rowShape(f)}|${yr(f.year_built) ?? ""}|${yr(f.closing_year) ?? ""}`;
const inputKey = (f: FloorInput) => `${inputShape(f)}|${yr(f.yearBuilt) ?? ""}|${yr(f.closingYear) ?? ""}`;

/** Whether the proposed floors differ in any way from the stored ones (same multiset = no change). */
export function floorsDiffer(existing: FloorRow[], proposed: FloorInput[]): boolean {
  if (existing.length !== proposed.length) return true;
  const a = existing.map(rowKey).sort();
  const b = proposed.map(inputKey).sort();
  return a.some((k, i) => k !== b[i]);
}

/** A floor (by label) present before and after whose use type is different. */
export function floorUseChanged(existing: FloorRow[], proposed: FloorInput[]): boolean {
  const open = (f: FloorRow) => yr(f.closing_year) === null;
  const before = new Map<string, string[]>();
  for (const f of existing.filter(open)) before.set(norm(f.floor_label), [...(before.get(norm(f.floor_label)) ?? []), norm(f.usage_type)]);
  const after = new Map<string, string[]>();
  for (const f of proposed.filter((p) => yr(p.closingYear) === null))
    after.set(norm(f.floorLabel), [...(after.get(norm(f.floorLabel)) ?? []), norm(f.usageType)]);
  for (const [label, uses] of before) {
    const now = after.get(label);
    if (now && [...uses].sort().join(",") !== [...now].sort().join(",")) return true;
  }
  return false;
}

/**
 * "Changed from year Y": floors identical before and after stay exactly as they are (with their own years); every
 * stored floor that is no longer in the proposal is closed at Y-1 (or dropped if it only started in Y or later);
 * every proposed floor that is new or different starts in Y (or later, if its own year built is later). So years
 * before Y are priced on the old floors, Y onward on the new ones.
 */
export function applyFloorChangeFromYear(existing: FloorRow[], proposed: FloorInput[], fromYear: number): FloorInput[] {
  const unmatched = [...existing];
  const kept: FloorInput[] = [];
  const started: FloorInput[] = [];
  for (const p of proposed) {
    const i = unmatched.findIndex(
      (e) => rowShape(e) === inputShape(p) && (yr(e.closing_year) === null || yr(e.closing_year) === yr(p.closingYear)),
    );
    if (i >= 0) {
      const e = unmatched.splice(i, 1)[0]!;
      kept.push({ ...p, yearBuilt: e.year_built ?? null, closingYear: e.closing_year ?? null });
    } else {
      const own = yr(p.yearBuilt);
      started.push({ ...p, yearBuilt: fy(own !== null && own > fromYear ? own : fromYear) });
    }
  }
  const closed: FloorInput[] = [];
  for (const e of unmatched) {
    const built = yr(e.year_built);
    const closing = yr(e.closing_year);
    if (built !== null && built >= fromYear) continue; // did not exist before the change
    const end = closing !== null && closing < fromYear - 1 ? closing : fromYear - 1;
    closed.push({
      floorLabel: e.floor_label,
      buildupSqft: Number(e.buildup_sqft) || 0,
      constType: e.const_type as FloorInput["constType"],
      usageType: e.usage_type,
      occupancy: (norm(e.occupancy) || "self") as FloorInput["occupancy"],
      yearBuilt: e.year_built ?? null,
      closingYear: fy(end),
    });
  }
  return [...kept, ...closed, ...started];
}

// ---------------------------------------------------------------------------------------------------------------------
// Per-floor changes
// ---------------------------------------------------------------------------------------------------------------------
//
// Each proposed floor row carries `source` - a snapshot of the recorded floor it comes from (several rows with the same
// source = that floor was split, e.g. part of it became a shop) - and `change`: how ITS change applies ("from year Y"
// or "correction"). A recorded floor no proposed row comes from has been removed; how is given in floorChange.removed.
// Matching is by the snapshot (not by row id), because floor rows get new ids on every save.

export interface FloorSnapshot {
  floorLabel: string;
  buildupSqft: number | string;
  constType: string;
  usageType: string;
  occupancy: string;
  yearBuilt?: string | null;
  closingYear?: string | null;
}
export interface FloorChangeSpec {
  kind: "from_year" | "correction";
  effectiveYear?: string | null;
}

const snapKey = (f: FloorSnapshot) =>
  `${shape(f.floorLabel, f.buildupSqft, f.constType, f.usageType, f.occupancy)}|${yr(f.yearBuilt) ?? ""}|${yr(f.closingYear) ?? ""}`;
const snapOfRow = (f: FloorRow): FloorSnapshot => ({
  floorLabel: f.floor_label,
  buildupSqft: f.buildup_sqft,
  constType: f.const_type,
  usageType: f.usage_type,
  occupancy: f.occupancy,
  yearBuilt: f.year_built,
  closingYear: f.closing_year,
});

export interface FloorPlan {
  /** Recorded floors kept exactly as they are. */
  unchanged: { stored: FloorRow; row: FloorInput }[];
  /** Recorded floors replaced by one or more rows (changed or split). */
  changed: { stored: FloorRow; rows: FloorInput[]; spec: FloorChangeSpec | null; mixedSpecs: boolean }[];
  /** Recorded floors no row comes from. */
  removed: { stored: FloorRow; spec: FloorChangeSpec | null }[];
  /** Rows that come from no recorded floor (a floor added). */
  added: { row: FloorInput; spec: FloorChangeSpec | null }[];
}

export function planFloorChanges(
  stored: FloorRow[],
  proposed: FloorInput[],
  removedSpecs: { floor: FloorSnapshot; spec: FloorChangeSpec }[] = [],
): FloorPlan {
  const plan: FloorPlan = { unchanged: [], changed: [], removed: [], added: [] };
  const groups = new Map<string, FloorInput[]>();
  const noSource: FloorInput[] = [];
  for (const p of proposed) {
    if (p.source) groups.set(snapKey(p.source), [...(groups.get(snapKey(p.source)) ?? []), p]);
    else noSource.push(p);
  }
  const removedLeft = [...removedSpecs];
  for (const s of stored) {
    const k = snapKey(snapOfRow(s));
    const rows = groups.get(k);
    if (rows?.length) {
      groups.delete(k); // one recorded floor per snapshot (identical recorded rows: the first takes the rows)
      if (rows.length === 1 && inputKey(rows[0]!) === rowKey(s)) {
        plan.unchanged.push({ stored: s, row: rows[0]! });
      } else {
        const specs = rows.map((r) => r.change ?? null);
        const spec = specs.find((x) => x) ?? null;
        const mixedSpecs = specs.some((x) => !x || x.kind !== spec?.kind || (x.effectiveYear ?? null) !== (spec?.effectiveYear ?? null));
        plan.changed.push({ stored: s, rows, spec, mixedSpecs: !!spec && mixedSpecs });
      }
      continue;
    }
    const ri = removedLeft.findIndex((r) => snapKey(r.floor) === k);
    plan.removed.push({ stored: s, spec: ri >= 0 ? removedLeft.splice(ri, 1)[0]!.spec : null });
  }
  // Rows whose source no longer matches anything recorded are treated as added floors.
  for (const rows of groups.values()) noSource.push(...rows);
  for (const row of noSource) plan.added.push({ row, spec: row.change ?? null });
  return plan;
}

/** Whether this plan changes a floor's use, or reaches into past years (a correction, or a year before this one). */
export function planIsUseChange(plan: FloorPlan, currentYear: number): boolean {
  const backDated = (s: FloorChangeSpec | null) => !!s && (s.kind === "correction" || (yr(s.effectiveYear) ?? currentYear) < currentYear);
  if (plan.changed.some((c) => backDated(c.spec) || c.rows.some((r) => norm(r.usageType) !== norm(c.stored.usage_type)))) return true;
  return plan.removed.some((r) => backDated(r.spec)) || plan.added.some((a) => backDated(a.spec));
}

const strip = (f: FloorInput): FloorInput => {
  const { source: _s, change: _c, ...rest } = f;
  return rest;
};
const asInput = (s: FloorRow, closingYear: string | null): FloorInput => ({
  floorLabel: s.floor_label,
  buildupSqft: Number(s.buildup_sqft) || 0,
  constType: s.const_type as FloorInput["constType"],
  usageType: s.usage_type,
  occupancy: (norm(s.occupancy) || "self") as FloorInput["occupancy"],
  yearBuilt: s.year_built ?? null,
  closingYear,
});
/** Close a recorded floor at the year before `from` (keeping an earlier closing); null = it did not exist before. */
function closeBefore(s: FloorRow, from: number): FloorInput | null {
  const built = yr(s.year_built);
  if (built !== null && built >= from) return null;
  const closing = yr(s.closing_year);
  return asInput(s, fy(closing !== null && closing < from - 1 ? closing : from - 1));
}
const startFrom = (r: FloorInput, from: number): FloorInput => {
  const own = yr(r.yearBuilt);
  return { ...strip(r), yearBuilt: fy(own !== null && own > from ? own : from) };
};

/** The floors to save for a validated plan: the past kept for "from year" changes, replaced for corrections. */
export function applyFloorPlan(plan: FloorPlan): FloorInput[] {
  const out: FloorInput[] = plan.unchanged.map(({ stored, row }) => ({
    ...strip(row),
    yearBuilt: stored.year_built ?? null,
    closingYear: stored.closing_year ?? null,
  }));
  for (const c of plan.changed) {
    const from = c.spec?.kind === "from_year" ? yr(c.spec.effectiveYear) : null;
    if (from === null) {
      // Correction: the rows replace the recorded floor for every year (a blank "year built" keeps the recorded one).
      out.push(...c.rows.map((r) => ({ ...strip(r), yearBuilt: r.yearBuilt || c.stored.year_built || null })));
    } else {
      const old = closeBefore(c.stored, from);
      if (old) out.push(old);
      out.push(...c.rows.map((r) => startFrom(r, from)));
    }
  }
  for (const r of plan.removed) {
    const from = r.spec?.kind === "from_year" ? yr(r.spec.effectiveYear) : null;
    if (from !== null) {
      const old = closeBefore(r.stored, from);
      if (old) out.push(old);
    } // correction: it never existed - dropped
  }
  for (const a of plan.added) {
    const from = a.spec?.kind === "from_year" ? yr(a.spec.effectiveYear) : null;
    out.push(from === null ? strip(a.row) : startFrom(a.row, from));
  }
  return out;
}
