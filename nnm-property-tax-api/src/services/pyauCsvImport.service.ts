import { parse } from "csv-parse/sync";
import { attendanceWardRepository } from "../repositories/attendanceWard.repository";
import { pyauRepository } from "../repositories/pyau.repository";

export interface PyauImportResult {
  created: number;
  /** Rows matching a pyau already in the registry (same ward, same address) - not added again. */
  alreadyInRegistry: number;
  errors: { row: number; message: string }[];
}

type Col =
  | "ward"
  | "address"
  | "tank"
  | "status"
  | "notWorking"
  | "structure"
  | "tankStand"
  | "taps"
  | "standposts"
  | "houses"
  | "scheme"
  | "pump"
  | "boring"
  | "casing"
  | "installed"
  | "builderName"
  | "builderContact"
  | "remarks"
  | "lat"
  | "lng";

/**
 * Which field a column header is. Headers are long mixed Hindi/English text, so they are matched by key words, in an
 * order that keeps look-alikes apart ("Tank Stand ..." before "tank", "houses ... just stand" before "stand").
 * Unknown columns (e.g. the ward-level "installed count" or "without stand" counts) are ignored.
 */
function columnFor(header: string): Col | null {
  const h = header.toLowerCase().replace(/\s+/g, " ").trim();
  if (!h) return null;
  if (h.includes("latitude")) return "lat";
  if (h.includes("longitude")) return "lng";
  if (h.includes("builder") && /contact|phone|mobile/.test(h)) return "builderContact";
  if (h.includes("builder")) return "builderName";
  if (h.includes("scheme")) return "scheme";
  if (h.includes("pump")) return "pump";
  if (h.includes("boring") || h.includes("depth")) return "boring";
  if (h.includes("casing")) return "casing";
  if (h.includes("install") && h.includes("date")) return "installed";
  if (h.includes("houses") || h.includes("घरों") || h.includes("घर ")) return "houses";
  if (h.includes("without stand") || h.includes("बिना")) return null;
  if (h.includes("standpost") || h.includes("stand post")) return "standposts";
  if (/\btaps?\b/.test(h)) return "taps";
  if (h.includes("type of stand")) return "structure";
  if (h.includes("tank stand") || (h.includes("stand") && h.includes("concrete"))) return "tankStand";
  if (h.includes("functionality") || h.includes("बंद")) return "notWorking";
  if (h.includes("status") || h.includes("स्थिति") || h.includes("चालू")) return "status";
  if (h.includes("tank") || h.includes("टंकी")) return "tank";
  if (h.startsWith("remarks") || h.includes("remark")) return "remarks";
  if (h.includes("address") || h.includes("location")) return "address";
  if (h.includes("ward")) return "ward";
  return null;
}

/** The original 20-column field-survey layout, read by position - used only when the header row is not recognised. */
const LEGACY_POSITIONS: Record<Col, number> = {
  ward: 0,
  address: 2,
  tank: 3,
  status: 4,
  notWorking: 5,
  structure: 6,
  tankStand: 7,
  houses: 9,
  scheme: 10,
  pump: 11,
  boring: 12,
  casing: 13,
  installed: 14,
  builderName: 15,
  builderContact: 16,
  remarks: 17,
  lat: 18,
  lng: 19,
  taps: -1,
  standposts: -1,
};

const intOrNull = (v: string) => (/^\d+$/.test(v) ? parseInt(v, 10) : null);
const numOrNull = (v: string) => (/^-?\d+(\.\d+)?$/.test(v) ? parseFloat(v) : null);
const addressKey = (wardId: number, a: string | null) => `${wardId}|${(a ?? "").toLowerCase().replace(/\s+/g, " ").trim()}`;

/**
 * Imports the submersible / pyau field-inventory CSV. Columns are found by their header names (any order), so both
 * the original survey sheet (10 columns, Hindi headers) and the later layout ("Ward No, Address/Location of Water
 * Kiosk, Has water tank, Pyau status (Working), Remarks on functionality, Type of stand, Number of water taps,
 * Number of water standposts, How many houses ..., Scheme Name, Pump Details, Boring Depth, Casing Details,
 * Installed Date, Builder Name, Builder Contact, Remarks, Latitude, Longitude") are read correctly.
 *
 * - Ward: "Ward 1", "1", "Ward No. 1" all mean ward 1 and match an existing ward named either "1" or "Ward 1"; a
 *   ward not yet in the system is created (this import is the initial ward setup for this module).
 * - Serial number: auto-generated per ward as "W{ward}-{seq}".
 * - A row with neither ward nor address (e.g. a totals row at the bottom) is skipped silently.
 * - A row matching a pyau already in the registry (same ward, same address) is not added again, so the same file can
 *   be uploaded twice without creating duplicates.
 */
export async function importPyauCsv(csvContent: string): Promise<PyauImportResult> {
  const all: string[][] = parse(csvContent.replace(/^\uFEFF/, ""), { columns: false, skip_empty_lines: true, relax_column_count: true });
  const header = all[0] ?? [];
  const records = all.slice(1);

  const pos = new Map<Col, number>();
  header.forEach((h, i) => {
    const c = columnFor(h);
    if (c && !pos.has(c)) pos.set(c, i);
  });
  const byHeader = pos.has("ward") && pos.has("address");
  // In the original sheet the second status column ("(प्याऊ की स्थिति (बंद )") being filled MEANS not working; in the
  // later layout "Remarks on functionality" is just a remark.
  const notWorkingMeansClosed = byHeader ? (header[pos.get("notWorking") ?? -1]?.includes("बंद") ?? false) : true;
  const cell = (row: string[], c: Col): string => {
    const i = byHeader ? (pos.get(c) ?? -1) : LEGACY_POSITIONS[c];
    return i >= 0 ? (row[i] ?? "").trim() : "";
  };

  const wards = await attendanceWardRepository.listAll();
  const wardByExact = new Map(wards.map((w) => [w.ward_name.trim().toLowerCase(), w]));
  const wardNum = (label: string) => label.match(/\d+/)?.[0]?.replace(/^0+(?=\d)/, "") ?? null;
  const wardByNum = new Map<string, (typeof wards)[number]>();
  for (const w of wards) {
    const n = /^(ward\s*(no\.?)?\s*)?\d+$/i.test(w.ward_name.trim()) ? wardNum(w.ward_name) : null;
    if (n && !wardByNum.has(n)) wardByNum.set(n, w);
  }
  // New wards follow the naming already in use ("1" or "Ward 1").
  const plainNumberNames = wards.some((w) => /^\d+$/.test(w.ward_name.trim()));

  const existing = new Map<string, number>();
  for (const p of await pyauRepository.listAll()) {
    const k = addressKey(p.ward_id, p.location_address);
    existing.set(k, (existing.get(k) ?? 0) + 1);
  }

  const nextSeqByWard = new Map<number, number>();
  const result: PyauImportResult = { created: 0, alreadyInRegistry: 0, errors: [] };

  for (let i = 0; i < records.length; i++) {
    const row = records[i]!;
    const rowNum = i + 2;
    try {
      const wardLabel = cell(row, "ward");
      const locationAddress = cell(row, "address") || null;
      if (!wardLabel && !locationAddress) continue; // blank or totals row
      if (!wardLabel) {
        result.errors.push({ row: rowNum, message: "Missing Ward No" });
        continue;
      }
      const num = wardNum(wardLabel);
      let ward = wardByExact.get(wardLabel.toLowerCase()) ?? (num ? wardByNum.get(num) : undefined);
      if (!ward) {
        ward = await attendanceWardRepository.create(num ? (plainNumberNames ? num : `Ward ${num}`) : wardLabel);
        wardByExact.set(ward.ward_name.trim().toLowerCase(), ward);
        if (num) wardByNum.set(num, ward);
      }

      const key = addressKey(ward.id, locationAddress);
      const already = existing.get(key) ?? 0;
      if (already > 0) {
        existing.set(key, already - 1);
        result.alreadyInRegistry++;
        continue;
      }

      if (!nextSeqByWard.has(ward.id)) nextSeqByWard.set(ward.id, (await pyauRepository.maxSerialSequenceForWard(ward.id)) + 1);
      const seq = nextSeqByWard.get(ward.id)!;
      nextSeqByWard.set(ward.id, seq + 1);
      const serialNumber = `W${num ?? wardLabel}-${String(seq).padStart(2, "0")}`;

      // Has water tank: a count (0/1/2/3); text such as "0(Ground)" or "Only Submersible" is kept as a remark.
      const tankRaw = cell(row, "tank");
      const overheadTankCount = intOrNull(tankRaw) ?? (tankRaw.match(/^(\d+)/) ? parseInt(tankRaw, 10) : 0);
      const tankRemark = tankRaw && intOrNull(tankRaw) === null ? `Water tank: "${tankRaw}"` : null;

      const statusRaw = cell(row, "status").toLowerCase();
      const notWorkingRaw = cell(row, "notWorking");
      const notWorkingText = notWorkingRaw && !/^\d+$/.test(notWorkingRaw) ? notWorkingRaw : null;
      const functionalStatus: "functional" | "non_functional" =
        /not\s*working|non[-\s]*functional|बंद/.test(statusRaw) || (notWorkingMeansClosed && !!notWorkingRaw)
          ? "non_functional"
          : "functional";

      const structureRaw = cell(row, "structure").toLowerCase();
      const structureType: "pcc_structure" | "iron_stand" | "nothing" | null = structureRaw.includes("pcc")
        ? "pcc_structure"
        : structureRaw.includes("iron")
          ? "iron_stand"
          : structureRaw === "nothing" || structureRaw === "none"
            ? "nothing"
            : null;

      const installedRaw = cell(row, "installed");
      const remarks = [tankRemark, notWorkingText, cell(row, "remarks") || null].filter(Boolean).join(" | ") || null;

      await pyauRepository.create({
        wardId: ward.id,
        serialNumber,
        locationAddress,
        latitude: numOrNull(cell(row, "lat")),
        longitude: numOrNull(cell(row, "lng")),
        schemeName: cell(row, "scheme") || null,
        overheadTankCount,
        housesServed: intOrNull(cell(row, "houses")),
        waterTapCount: intOrNull(cell(row, "taps")),
        standpostCount: intOrNull(cell(row, "standposts")),
        structureType,
        tankStandType: cell(row, "tankStand") || null,
        pumpDetails: cell(row, "pump") || null,
        boringDepthFeet: numOrNull(cell(row, "boring")),
        casingDetails: cell(row, "casing") || null,
        installedDate: /^\d{4}-\d{2}-\d{2}$/.test(installedRaw) ? installedRaw : null,
        builderName: cell(row, "builderName") || null,
        builderContact: cell(row, "builderContact") || null,
        remarks,
        initialFunctionalStatus: functionalStatus,
      });
      result.created++;
    } catch (err) {
      result.errors.push({ row: rowNum, message: err instanceof Error ? err.message : String(err) });
    }
  }

  return result;
}
