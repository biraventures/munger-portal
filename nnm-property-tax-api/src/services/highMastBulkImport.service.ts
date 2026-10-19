import { parse } from "csv-parse/sync";
import { pool } from "../config/db";
import { attendanceWardRepository } from "../repositories/attendanceWard.repository";
import { installationAgencyRepository } from "../repositories/installationAgency.repository";
import { lightRepository } from "../repositories/light.repository";
import { lightFaultRepository } from "../repositories/lightFault.repository";
import { contractorWardRepository } from "../repositories/contractorWard.repository";
import type { InstallationAgencyRow, LightRow } from "../types/streetlight.types";

export interface HighMastBulkImportResult {
  created: number;
  updated: number;
  errors: { row: number; message: string }[];
  /** Rows imported with something missing (no GPS, unknown status...) - for information, not errors. */
  notes: { row: number; message: string }[];
  /** Agencies that were not on file and were added. */
  newAgencies: string[];
}

/** Reads the first non-empty value across several possible header spellings for the same column (headers are matched case-, space- and dot-insensitively). */
function pick(row: Record<string, string>, candidates: string[]): string {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const c of candidates) {
    const key = Object.keys(row).find((k) => norm(k) === norm(c));
    if (key && row[key]?.trim()) return row[key]!.trim();
  }
  return "";
}

/** "G.S.Construction", "G S Construction" and "g.s. construction" are the same agency. */
const agencyKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
/** Location names compared ignoring case, spaces and punctuation. */
const placeKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9ऀ-ॿ]/g, "");
/** "Ward 38", "Ward No. 38", "38", "W-38", "ward 038" -> 38. */
function wardNumber(label: string): number | null {
  const m = label.match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

type Status = "functional" | "partially_functional" | "non_functional";
function functionalStatus(raw: string): Status | null {
  const s = raw.toLowerCase().replace(/[^a-z]/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return null;
  if (/partial|partly|some/.test(s)) return "partially_functional";
  if (/\b(not|non|no)\b|nonfunctional|notworking|nonworking|dead|faulty|defective|off\b|band/.test(s)) return "non_functional";
  if (/function|working|ok|on\b|chalu|yes/.test(s)) return "functional";
  return null;
}

/** Switch: OK / working / yes -> working; not OK / faulty / no -> not working; auto / automatic -> automatic; joint. */
function switchStatus(raw: string): "working" | "not_working" | "automatic" | "joint" | null {
  const s = raw.toLowerCase().trim();
  if (!s) return null;
  if (/auto/.test(s)) return "automatic";
  if (/joint/.test(s)) return "joint";
  if (/not|non|faulty|defect|damage|bad|no\b|missing|dead/.test(s)) return "not_working";
  if (/ok|work|good|yes|fine|functional/.test(s)) return "working";
  return null;
}

function panelStatus(raw: string): "working" | "not_working" | null {
  const s = switchStatus(raw);
  return s === "working" || s === "automatic" || s === "joint" ? "working" : s;
}

function coordinate(s: string, min: number, max: number): number | null {
  if (!s) return null;
  const n = Number(s.replace(/[^\d.\-]/g, ""));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

/**
 * Imports the High Mast survey sheet: Sl No, Ward, Location name, Installed by Agency name, No of lights,
 * Functional status, Number of functional lamps, Panel, Switch, Maintenance agency, Latitude, Longitude, Remarks.
 *
 * Only the ward is needed - every other column may be blank (GPS can be added later from the High Mast dashboard).
 * Wards are matched by their number ("Ward 38" = ward "38"), agencies by name ignoring case / dots / spaces; an
 * agency not on file is added. Uploading the sheet again updates the towers already imported (matched by ward and
 * location; several towers at the same location are matched in order) instead of adding them twice.
 *
 * A serial number is generated for each new tower ("HM-<ward>-<seq>"). A tower marked not functional gets an open
 * fault, so it shows as not working on the dashboards.
 */
export async function importHighMastBulkCsv(csvContent: string): Promise<HighMastBulkImportResult> {
  const records: Record<string, string>[] = parse(csvContent.replace(/^﻿/, ""), { columns: true, skip_empty_lines: true, relax_column_count: true, trim: true });
  const result: HighMastBulkImportResult = { created: 0, updated: 0, errors: [], notes: [], newAgencies: [] };

  // Wards by number (the lowest id when two wards carry the same number), and by exact name for wards without one.
  const wards = await attendanceWardRepository.listAll();
  const wardByNumber = new Map<number, (typeof wards)[number]>();
  const wardByName = new Map<string, (typeof wards)[number]>();
  for (const w of [...wards].sort((a, b) => Number(a.id) - Number(b.id))) {
    const n = wardNumber(w.ward_name);
    if (n !== null && !wardByNumber.has(n)) wardByNumber.set(n, w);
    wardByName.set(w.ward_name.trim().toLowerCase(), w);
  }

  const agencies = new Map<string, InstallationAgencyRow>();
  for (const a of await installationAgencyRepository.listAll()) agencies.set(agencyKey(a.agency_name), a);
  async function agencyId(name: string): Promise<number | null> {
    const clean = name.replace(/\s+/g, " ").trim();
    if (!clean) return null;
    const key = agencyKey(clean);
    let a = agencies.get(key);
    if (!a) {
      a = await installationAgencyRepository.create(clean);
      agencies.set(key, a);
      result.newAgencies.push(clean);
    }
    return Number(a.id);
  }

  // High Masts already on file, grouped by ward number + location, oldest first - matched to the sheet's rows in order.
  const existing = (await lightRepository.listAll("high_mast")).filter((l) => !l.deleted_at).sort((a, b) => Number(a.id) - Number(b.id));
  const wardNoById = new Map(wards.map((w) => [Number(w.id), wardNumber(w.ward_name)]));
  const groups = new Map<string, LightRow[]>();
  for (const l of existing) {
    const key = `${wardNoById.get(Number(l.ward_id)) ?? `id${l.ward_id}`}|${placeKey(l.locality_name)}`;
    groups.set(key, [...(groups.get(key) ?? []), l]);
  }
  const seenInFile = new Map<string, number>();

  const usedSerials = new Set<string>();
  async function nextSerial(wardLabel: string): Promise<string> {
    const base = `HM-${wardLabel.replace(/\s+/g, "").toUpperCase()}`;
    let n = 1;
    let candidate = `${base}-${String(n).padStart(3, "0")}`;
    while (usedSerials.has(candidate) || (await lightRepository.findBySerialNumber(candidate))) {
      n++;
      candidate = `${base}-${String(n).padStart(3, "0")}`;
    }
    usedSerials.add(candidate);
    return candidate;
  }

  for (let i = 0; i < records.length; i++) {
    const row = records[i]!;
    const rowNum = i + 2;
    try {
      const wardLabel = pick(row, ["Ward", "Ward no", "Ward number"]);
      const locationName = pick(row, ["Location name", "Location", "Locality", "Location Name"]).replace(/\s+/g, " ");
      // A completely empty line (only a serial number) is skipped silently.
      if (!wardLabel && !locationName) continue;
      if (!wardLabel) {
        result.errors.push({ row: rowNum, message: `Ward missing for ${locationName} - not imported (the ward is needed to place the tower)` });
        continue;
      }
      const wn = wardNumber(wardLabel);
      let ward = wn !== null ? wardByNumber.get(wn) : wardByName.get(wardLabel.toLowerCase());
      if (!ward) {
        ward = await attendanceWardRepository.create(wn !== null ? `Ward ${wn}` : wardLabel);
        if (wn !== null) wardByNumber.set(wn, ward);
        wardByName.set(ward.ward_name.toLowerCase(), ward);
        result.notes.push({ row: rowNum, message: `Ward "${ward.ward_name}" was not on file - added` });
      }
      const wardTag = wn !== null ? String(wn) : wardLabel;

      // GPS: optional. Separate columns, or one "lat, long" column.
      let latStr = pick(row, ["Latitude", "Lattitude", "Lat", "GPS Latitude", "GPS Lat"]);
      let lngStr = pick(row, ["Longitude", "Longtitude", "Long", "Lng", "GPS Longitude", "GPS Long"]);
      if (!latStr || !lngStr) {
        const combined = pick(row, ["GPS", "GPS Location", "GPS Coordinates", "Coordinates"]);
        if (combined.includes(",")) {
          const [a, b] = combined.split(",").map((s) => s.trim());
          latStr = latStr || a || "";
          lngStr = lngStr || b || "";
        }
      }
      const latitude = coordinate(latStr, 20, 30);
      const longitude = coordinate(lngStr, 80, 92);
      if ((latStr || lngStr) && (latitude === null || longitude === null)) {
        result.notes.push({ row: rowNum, message: `GPS "${latStr}, ${lngStr}" is not valid - imported without GPS` });
      }
      const hasGps = latitude !== null && longitude !== null;

      const installationAgencyId = await agencyId(pick(row, ["Installed by Agency name", "Installed by", "Installed By Agency", "Installation agency", "Established by"]));
      const maintenanceAgencyId = await agencyId(pick(row, ["Maintenance agency", "Maintenance Agency name", "Maintained by"]));

      const lightsRaw = pick(row, ["No of lights", "No. of lights", "Number of lights", "No of lamps", "Lamps"]);
      const noOfLights = /^\d+$/.test(lightsRaw) ? Number(lightsRaw) : null;
      if (lightsRaw && noOfLights === null) result.notes.push({ row: rowNum, message: `No of lights "${lightsRaw}" is not a number - left blank` });

      const statusRaw = pick(row, ["Functional status", "Status", "Working status"]);
      const status = functionalStatus(statusRaw);
      if (statusRaw && !status) result.notes.push({ row: rowNum, message: `Functional status "${statusRaw}" not understood - left blank` });

      const functionalRaw = pick(row, [
        "Number of functional lamps",
        "No of functional lamps",
        "Functional lamps",
        "Number of functional lights",
        "No of functional lights",
        "Functional lights",
      ]);
      let noOfFunctionalLights: number | null = /^\d+$/.test(functionalRaw) ? Number(functionalRaw) : null;
      if (functionalRaw && noOfFunctionalLights === null) result.notes.push({ row: rowNum, message: `Number of functional lamps "${functionalRaw}" is not a number - left blank` });
      if (noOfFunctionalLights !== null && noOfLights !== null && noOfFunctionalLights > noOfLights) {
        result.notes.push({ row: rowNum, message: `Functional lamps (${noOfFunctionalLights}) more than No of lights (${noOfLights}) - functional lamps left blank` });
        noOfFunctionalLights = null;
      }
      // Not given: all lamps of a functional tower work, none of a non-functional one.
      if (noOfFunctionalLights === null && noOfLights !== null) {
        if (status === "functional") noOfFunctionalLights = noOfLights;
        else if (status === "non_functional") noOfFunctionalLights = 0;
      }

      const switchRaw = pick(row, ["Switch", "Switch status"]);
      const sw = switchStatus(switchRaw);
      if (switchRaw && !sw) result.notes.push({ row: rowNum, message: `Switch "${switchRaw}" not understood - left blank` });
      const panelRaw = pick(row, ["Panel", "Panel status", "Control panel"]);
      const panel = panelStatus(panelRaw);
      if (panelRaw && !panel) result.notes.push({ row: rowNum, message: `Panel "${panelRaw}" not understood - left blank` });

      const remarks = pick(row, ["Remarks", "Remark"]) || null;

      // Already imported? The n-th row for this ward + location updates the n-th tower on file there.
      const key = `${wn ?? `id${ward.id}`}|${placeKey(locationName)}`;
      const nth = seenInFile.get(key) ?? 0;
      seenInFile.set(key, nth + 1);
      const match = groups.get(key)?.[nth];

      let lightId: number;
      if (match) {
        await pool.query(
          `UPDATE lights SET ward_id = $2, locality_name = $3,
                  latitude = COALESCE($4, latitude), longitude = COALESCE($5, longitude),
                  installation_agency_id = COALESCE($6, installation_agency_id), maintenance_agency_id = COALESCE($7, maintenance_agency_id),
                  no_of_lights = COALESCE($8, no_of_lights), no_of_functional_lights = COALESCE($9, no_of_functional_lights),
                  switch_status = COALESCE($10, switch_status), panel_status = COALESCE($11, panel_status),
                  functional_status = COALESCE($12, functional_status), remarks = COALESCE($13, remarks)
            WHERE id = $1`,
          [match.id, ward.id, locationName || match.locality_name, hasGps ? latitude : null, hasGps ? longitude : null, installationAgencyId, maintenanceAgencyId, noOfLights, noOfFunctionalLights, sw, panel, status, remarks],
        );
        lightId = Number(match.id);
        result.updated++;
      } else {
        const light = await lightRepository.create({
          lightType: "high_mast",
          wardId: Number(ward.id),
          localityName: locationName,
          serialNumber: await nextSerial(wardTag),
          latitude: hasGps ? latitude : null,
          longitude: hasGps ? longitude : null,
          installationAgencyId,
          maintenanceAgencyId,
          noOfLights,
          noOfFunctionalLights,
          switchStatus: sw,
          panelStatus: panel,
          functionalStatus: status,
          remarks,
        });
        lightId = Number(light.id);
        result.created++;
      }

      // Not functional: open a fault (unless one is already open) so it shows as not working everywhere.
      if (status === "non_functional") {
        const { rows: open } = await pool.query(`SELECT 1 FROM light_faults WHERE light_id = $1 AND status = 'open' LIMIT 1`, [lightId]);
        if (!open.length) {
          const mapping = await contractorWardRepository.findByWard(Number(ward.id));
          await lightFaultRepository.create({
            lightId,
            reportedGpsLat: null,
            reportedGpsLng: null,
            deadlineAt: new Date(Date.now() + 72 * 3600_000),
            reportedByType: "staff",
            reportedByUserId: null,
            reporterPhone: null,
            reporterNotes: "Imported from High Mast bulk upload as not functional.",
            assignedContractorId: mapping?.contractor_id ?? null,
          });
        }
      }
    } catch (err) {
      result.errors.push({ row: rowNum, message: err instanceof Error ? err.message : String(err) });
    }
  }

  return result;
}
