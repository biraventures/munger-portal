/**
 * Holdings whose floor details were OVERWRITTEN in the past - a floor's use, construction, area or occupancy changed
 * on a save, before "changed from year" existed, so every unpaid past year was recalculated on the new details (e.g. a
 * hotel turned into a home lowered all its old arrears).
 *
 * Reads the holding history (every saved version) and lists each such change with the before / after values, who
 * saved it and when, and whether the holding still has unpaid past years. Nothing is changed. Where the change was
 * real (not a correction), staff can record it properly from the year it happened: edit the holding, put the old
 * details back as they were, and save the new ones as "It changed from year ___" (Tax Daroga -> City Manager -> DMC).
 *
 * Usage (from the nnm-property-tax-api folder):  npm run report-floor-overwrites
 * Writes floor-overwrites-report.csv in the current folder.
 */
import "dotenv/config";
import fs from "node:fs";
import { pool } from "../src/config/db";
import { propertyRepository } from "../src/repositories/property.repository";
import { effectivePaidTillStart } from "../src/services/paidYearGuard.service";
import { getCurrentAssessmentYearStartNum, parseYearStartOrNull } from "../src/utils/assessmentYear";

interface SnapFloor {
  floorLabel?: string;
  buildupSqft?: number | string;
  constType?: string;
  usageType?: string;
  occupancy?: string;
  yearBuilt?: string | null;
  closingYear?: string | null;
}

const norm = (v: unknown) => String(v ?? "").trim();
const describe = (f: SnapFloor) =>
  `${norm(f.usageType)}, ${norm(f.constType)}, ${Number(f.buildupSqft) || 0} sqft, ${norm(f.occupancy) || "self"}`;

/** Open floors of a version, by label (a label may have several rows - kept as a sorted list). */
function byLabel(floors: SnapFloor[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const f of floors.filter((x) => parseYearStartOrNull(x.closingYear ?? null) === null)) {
    const k = norm(f.floorLabel).toLowerCase();
    m.set(k, [...(m.get(k) ?? []), describe(f)].sort());
  }
  return m;
}

async function main() {
  const current = getCurrentAssessmentYearStartNum();
  const { rows } = await pool.query<{
    holding_no: string;
    version: number;
    ts: Date;
    operator_name: string | null;
    change_basis: string | null;
    change_reference: string | null;
    floors: SnapFloor[] | null;
    floor_change_kind: string | null;
  }>(
    `SELECT holding_no, version, ts, operator_name, change_basis, change_reference,
            snapshot->'floors' AS floors, snapshot->'property'->'floorChange'->>'kind' AS floor_change_kind
       FROM property_history
      WHERE holding_no IN (SELECT holding_no FROM property_history GROUP BY holding_no HAVING COUNT(*) > 1)
      ORDER BY holding_no, version`,
  );

  const out: string[][] = [];
  const holdings = new Set<string>();
  let unpaidHoldings = 0;
  const unpaidCache = new Map<string, boolean>();
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1]!;
    const cur = rows[i]!;
    if (prev.holding_no !== cur.holding_no || !Array.isArray(prev.floors) || !Array.isArray(cur.floors)) continue;
    if (cur.floor_change_kind === "from_year") continue; // recorded properly - the past was kept
    const before = byLabel(prev.floors);
    const after = byLabel(cur.floors);
    // Details still present in the next version (open or closed) were kept - a "from year" change keeps the old
    // floor as a closed row. Only details that vanished were overwritten.
    const stillThere = new Set(cur.floors.map((f) => `${norm(f.floorLabel).toLowerCase()}|${describe(f)}`));
    for (const [label, oldList] of before) {
      const newList = after.get(label);
      if (!newList || oldList.join(" / ") === newList.join(" / ")) continue;
      if (oldList.every((d) => stillThere.has(`${label}|${d}`))) continue;
      if (!unpaidCache.has(cur.holding_no)) {
        const p = await propertyRepository.findByHoldingNo(cur.holding_no);
        const paid = p ? await effectivePaidTillStart(p) : null;
        unpaidCache.set(cur.holding_no, !!p && (paid === null || paid < current - 1));
      }
      const unpaid = unpaidCache.get(cur.holding_no)!;
      if (!holdings.has(cur.holding_no)) {
        holdings.add(cur.holding_no);
        if (unpaid) unpaidHoldings++;
      }
      out.push([
        cur.holding_no,
        new Date(cur.ts).toLocaleDateString("en-IN"),
        cur.operator_name ?? "",
        norm(cur.floors.find((f) => norm(f.floorLabel).toLowerCase() === label)?.floorLabel) || label,
        oldList.join(" / "),
        newList.join(" / "),
        cur.floor_change_kind === "correction" ? "Correction (stated)" : norm(cur.change_basis),
        norm(cur.change_reference),
        unpaid ? "Yes" : "No",
      ]);
    }
  }
  out.sort((a, b) => (a[8] === b[8] ? a[0]!.localeCompare(b[0]!) : a[8] === "Yes" ? -1 : 1));

  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const header = ["Holding", "Saved on", "Saved by", "Floor", "Before", "After", "Change basis", "Reference", "Unpaid past years now"];
  fs.writeFileSync("floor-overwrites-report.csv", [header, ...out].map((l) => l.map(esc).join(",")).join("\n") + "\n");
  console.log(`Floor changes that overwrote the past: ${out.length} (in ${holdings.size} holdings)`);
  console.log(`  holdings that still have unpaid past years (arrears affected): ${unpaidHoldings}`);
  console.log("Details: floor-overwrites-report.csv");
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
