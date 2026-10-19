"use client";

export interface HoldingFloor {
  floorLabel: string;
  buildupSqft: number;
  usage: string;
}

export const GROUND_FLOOR = "Ground Floor - 0";
export const floorName = (label: string) => label.split(" - ")[0]!;

/**
 * The land goes with the ground floor: when the buyer takes the ground floor (or every floor) the default is the whole
 * plot; when he takes only upper floors the default is 0 (the land stays with the seller). The applicant can change it.
 */
export function defaultArea(selected: string[], floors: HoldingFloor[]): { entire: boolean; part: string } {
  const all = selected.length >= floors.length;
  if (all || selected.includes(GROUND_FLOOR)) return { entire: true, part: "" };
  return { entire: false, part: "0" };
}

/** Floors of the holding being transferred - all ticked by default. */
export function FloorChoice({ floors, selected, onChange }: { floors: HoldingFloor[]; selected: string[]; onChange: (next: string[]) => void }) {
  if (floors.length < 2) return null;
  const toggle = (label: string) => {
    const next = selected.includes(label) ? selected.filter((x) => x !== label) : [...selected, label];
    if (next.length) onChange(floors.map((f) => f.floorLabel).filter((l) => next.includes(l)));
  };
  const some = selected.length < floors.length;
  return (
    <div className="sm:col-span-2">
      <p className="mb-1 text-xs font-medium text-slate-600">Floors being transferred to the buyer</p>
      <div className="flex flex-wrap gap-2">
        {floors.map((f) => (
          <label
            key={f.floorLabel}
            className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${selected.includes(f.floorLabel) ? "border-nnm-blue bg-blue-50 text-slate-900" : "border-slate-300 bg-white text-slate-500"}`}
          >
            <input type="checkbox" checked={selected.includes(f.floorLabel)} onChange={() => toggle(f.floorLabel)} />
            <span>
              <b>{floorName(f.floorLabel)}</b> · {f.buildupSqft.toLocaleString("en-IN")} sq ft
            </span>
          </label>
        ))}
      </div>
      {some ? (
        <p className="mt-2 rounded-md bg-amber-50 p-3 text-xs text-amber-900">
          Only {selected.map(floorName).join(", ")} {selected.length === 1 ? "is" : "are"} being sold: once approved, a new holding with a new MMC number is
          created in the buyer&apos;s name for {selected.length === 1 ? "this floor" : "these floors"}, and the seller&apos;s holding keeps the other floors. The land
          area goes with the ground floor unless you enter a different area below.
        </p>
      ) : (
        <p className="mt-1 text-xs text-slate-500">All floors are ticked: the whole building is transferred. Untick the floors that are not being sold.</p>
      )}
    </div>
  );
}
