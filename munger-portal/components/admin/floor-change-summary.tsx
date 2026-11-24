import { AuthPhoto } from "@/components/admin/field-verification-photos";
import { snapKey } from "@/components/floor-change-box";
import type { FloorSnapshot } from "@/components/operator/floor-row";

interface Spec {
  kind?: string;
  effectiveYear?: string | null;
}
interface ProposedFloor {
  floorLabel?: string;
  buildupSqft?: number | string;
  constType?: string;
  usageType?: string;
  occupancy?: string;
  source?: FloorSnapshot | null;
  change?: Spec | null;
}
interface SavedFloorChange extends Spec {
  mode?: string;
  reason?: string;
  removed?: ({ floor: FloorSnapshot } & Spec)[];
}

const describe = (f: { usageType?: string; constType?: string; buildupSqft?: number | string; occupancy?: string }) =>
  `${f.usageType || "-"}, ${f.constType ?? ""}, ${Number(f.buildupSqft) || 0} sqft${f.occupancy === "rented" ? ", rented" : ""}`;
const how = (s: Spec | null | undefined, from: string, correction: string) =>
  s?.kind === "from_year" ? `${from} ${s.effectiveYear}` : s?.kind === "correction" ? correction : "not stated";

/** For approvers: floor by floor, how the requested change applies; the reason; the premises photo. */
export function FloorChangeSummary({
  floorChange,
  floors,
  premisesPhotoPath,
  useChange,
}: {
  floorChange?: SavedFloorChange | null;
  floors?: ProposedFloor[];
  premisesPhotoPath?: string | null;
  useChange?: boolean;
}) {
  if (!floorChange && !premisesPhotoPath && !useChange) return null;
  const lines: { title: string; detail: string; how: string }[] = [];
  if (floorChange?.mode === "per_floor") {
    const groups = new Map<string, { source: FloorSnapshot; rows: ProposedFloor[] }>();
    for (const f of floors ?? []) {
      if (f.source) {
        const k = snapKey(f.source);
        groups.set(k, { source: f.source, rows: [...(groups.get(k)?.rows ?? []), f] });
      } else if (f.change) {
        lines.push({
          title: `${f.floorLabel} (added)`,
          detail: describe(f),
          how: how(f.change, "built / started from", "correction - it always existed"),
        });
      }
    }
    for (const { source, rows } of groups.values()) {
      const changed = rows.length > 1 || rows.some((r) => r.change);
      if (!changed) continue;
      lines.push({
        title: source.floorLabel,
        detail: `${describe(source)} → ${rows.map(describe).join(" + ")}${rows.length > 1 ? ` (split into ${rows.length} parts)` : ""}`,
        how: how(rows[0]?.change, "changed from", "correction - it was always like this"),
      });
    }
    for (const r of floorChange.removed ?? []) {
      lines.push({
        title: `${r.floor.floorLabel} (removed)`,
        detail: describe(r.floor),
        how: how(r, "no longer exists from", "correction - it never existed"),
      });
    }
  }
  return (
    <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 text-sm text-slate-800">
      <p className="font-semibold text-amber-900">
        {useChange ? "Change of use / back-dated floor change - Tax Daroga → City Manager → Deputy Commissioner" : "Floor change"}
      </p>
      {lines.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {lines.map((l, i) => (
            <li key={i} className="rounded-md border border-amber-200 bg-white px-3 py-2">
              <b>{l.title}</b>: {l.detail}
              <span className="block text-xs font-semibold text-amber-900">{l.how}</span>
            </li>
          ))}
        </ul>
      )}
      {floorChange?.kind === "from_year" && (
        <p className="mt-1">
          <b>Changed from {floorChange.effectiveYear}</b> - years before it keep the old floor details.
        </p>
      )}
      {floorChange?.kind === "correction" && (
        <p className="mt-1">
          <b>Correction of a mistake</b> - the new details apply to every year.
        </p>
      )}
      {floorChange?.reason && (
        <p className="mt-2">
          <b>Reason:</b> {floorChange.reason}
        </p>
      )}
      {premisesPhotoPath && (
        <div className="mt-2">
          <AuthPhoto path={premisesPhotoPath} label="Photo of the premises" large />
        </div>
      )}
    </div>
  );
}
