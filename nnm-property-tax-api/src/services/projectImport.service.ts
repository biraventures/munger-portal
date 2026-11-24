import ExcelJS from "exceljs";
import { pool } from "../config/db";
import type { AttendanceTokenPayload } from "../types/attendance.types";
import {
  PROJECT_CATEGORIES,
  PROJECT_CATEGORY_KEYS,
  PROJECT_STAGES,
  PROJECT_STAGE_LABELS,
  type Discipline,
  type ProjectCategory,
  type ProjectStage,
} from "../types/project.types";
import { listProjects, projectDb, type ProjectFilter, type ProjectInput } from "./project.service";
import {
  REPORT_COLUMNS,
  STAGE_RANK,
  costFromName,
  guessCategory,
  nameWithoutCost,
  normHeading,
  schemeFromName,
  splitLetter,
  stageFromFacts,
  wardFromName,
  type ReportColumn,
} from "./projectReportFormat";

/**
 * Bulk entry of schemes / projects (Commissioner, Yojana Prabhari) in the department's "3 Years Report" format -
 * an Excel (.xlsx) or CSV file. Columns are found by their heading, so the report's own sheet uploads as it is; the
 * older portal template still works. The name cell's estimate cost, ward number and scheme are read from the text
 * when there is no column for them; the type of work is guessed from the name (it can be corrected later); the stage
 * is worked out from the dates and progress unless a Stage column says otherwise.
 *
 * Re-uploading updates: a row matching a project already entered (by Project Code, else by name + financial year)
 * fills in the cells that have a value - blank / "-" cells never erase anything - and the stage only moves forward.
 * Each row stands alone: a bad row is reported and the rest go in. Cells that cannot be read (a mistyped date) are
 * left blank and listed as warnings.
 */

type Grid = string[][];

// ---------------------------------------------------------------------------------------------------------------------
// Reading the file into a grid of text
// ---------------------------------------------------------------------------------------------------------------------

/** RFC 4180 CSV: quoted cells may hold commas, quotes ("") and line breaks. */
function parseCsv(text: string): Grid {
  const rows: Grid = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const pad = (n: number) => String(n).padStart(2, "0");
/** An Excel cell as text; dates as YYYY-MM-DD. */
function excelText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("result" in v) return excelText(v.result as ExcelJS.CellValue);
    if ("text" in v) return String(v.text);
    if ("error" in v) return "";
  }
  return String(v);
}

async function readGrid(buffer: Buffer): Promise<Grid> {
  const isXlsx = buffer[0] === 0x50 && buffer[1] === 0x4b; // "PK" - a zip
  if (!isXlsx) {
    let text: string;
    if (buffer[0] === 0xff && buffer[1] === 0xfe) text = buffer.subarray(2).toString("utf16le");
    else text = buffer.toString("utf8").replace(/^\uFEFF/, "");
    if (!text.includes(",") && text.includes("\t")) return text.split(/\r?\n/).map((l) => l.split("\t")); // tab-separated "Unicode text"
    return parseCsv(text);
  }
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new Error("Could not read the file - upload the Excel (.xlsx) or CSV sheet.");
  }
  const ws = wb.worksheets.find((w) => /project|scheme|report|योजना/i.test(w.name)) ?? wb.worksheets[0];
  if (!ws) throw new Error("The Excel file has no sheet.");
  const grid: Grid = [];
  ws.eachRow({ includeEmpty: true }, (row, r) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, c) => {
      cells[c - 1] = excelText(cell.value);
    });
    grid[r - 1] = Array.from(cells, (x) => x ?? "");
  });
  return Array.from(grid, (r) => r ?? []);
}

// ---------------------------------------------------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------------------------------------------------

const blank = (t: string) => {
  const v = t.trim();
  return v === "" || /^[-–—]+$/.test(v) || /^n\.?a\.?$/i.test(v) || v === "0000-00-00";
};

/** dd.mm.yyyy / dd-mm-yyyy / dd/mm/yyyy / yyyy-mm-dd; a typo'd year like 20250 is read as 2025 (with a warning). */
function parseDate(t: string): { value: string | null; warning?: string } {
  const v = t.trim();
  if (blank(v)) return { value: null };
  const ymd = (y: number, m: number, d: number) => {
    const dt = new Date(Date.UTC(y, m - 1, d));
    return y >= 1990 && y <= 2100 && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : null;
  };
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const r = ymd(+m[1]!, +m[2]!, +m[3]!);
    return r ? { value: r } : { value: null, warning: `"${v}" is not a date` };
  }
  m = v.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(\d?)$/);
  if (m) {
    const r = ymd(+m[3]!, +m[2]!, +m[1]!);
    if (!r) return { value: null, warning: `"${v}" is not a date` };
    return m[4] ? { value: r, warning: `"${v}" read as ${m[1]}.${m[2]}.${m[3]} - please check` } : { value: r };
  }
  return { value: null, warning: `"${v}" is not a date (use DD.MM.YYYY)` };
}

function parseAmount(t: string): { value: number | null; warning?: string } {
  if (blank(t)) return { value: null };
  const n = Number(t.replace(/[,₹\s]|rs\.?|\/-|रू0|रु0/gi, ""));
  return Number.isFinite(n) && n >= 0 ? { value: n } : { value: null, warning: `"${t.trim()}" is not an amount` };
}

function parsePct(t: string): { value: number | null; warning?: string } {
  if (blank(t)) return { value: null };
  const n = Number(t.replace(/[%\s]/g, ""));
  return Number.isFinite(n) && n >= 0 && n <= 100 ? { value: n } : { value: null, warning: `"${t.trim()}" is not a percentage (0-100)` };
}

function matchCategory(v: string): ProjectCategory | null {
  const n = normHeading(v);
  for (const k of PROJECT_CATEGORY_KEYS)
    if (normHeading(k.replace(/_/g, " ")) === n || normHeading(PROJECT_CATEGORIES[k].label) === n) return k;
  const g = guessCategory(v);
  return g.category === "other_civil" && !/other|civil/i.test(v) ? null : g.category;
}

function matchStage(v: string): ProjectStage | null {
  const n = normHeading(v);
  for (const s of PROJECT_STAGES) if (normHeading(s.replace(/_/g, " ")) === n || normHeading(PROJECT_STAGE_LABELS[s]) === n) return s;
  if (/cancel|drop|रद्द/.test(n)) return "cancelled";
  if (/^past/.test(n)) return "past_completed";
  if (/payment/.test(n)) return "payment_done";
  if (/^complete/.test(n)) return "completed";
  if (/progress|ongoing|started/.test(n)) return "in_progress";
  if (/work ?order|award/.test(n)) return "work_order_issued";
  if (/final/.test(n)) return "tender_finalised";
  if (/tender/.test(n)) return "tendered";
  if (/approv|sanction/.test(n)) return "approved";
  return null;
}

function matchDiscipline(v: string): Discipline | null {
  const n = normHeading(v);
  if (/both|civil.*mech|mech.*civil|दोनों/.test(n)) return "both";
  if (/mech|यांत्रिक/.test(n)) return "mechanical";
  if (/civil|सिविल/.test(n)) return "civil";
  return null;
}

/** Name for matching: letters and digits only. */
const nameKey = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase();

// ---------------------------------------------------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------------------------------------------------

export interface ProjectImportResult {
  created: number;
  updated: number;
  unchanged: number;
  errors: { row: number; message: string }[];
  warnings: { row: number; message: string }[];
  /** The columns that were recognised (headings as in the file). */
  columnsFound: number;
}

/** Fields of ProjectInput a sheet can fill (everything but the specials handled by hand). */
type Out = Partial<ProjectInput> & Record<string, unknown>;

function findHeader(grid: Grid): { row: number; cols: Map<string, number> } {
  let best = { row: -1, cols: new Map<string, number>() };
  const lookup = new Map<string, ReportColumn>();
  for (const c of REPORT_COLUMNS) for (const h of [c.heading, ...c.aliases]) if (!lookup.has(normHeading(h))) lookup.set(normHeading(h), c);
  for (let r = 0; r < Math.min(10, grid.length); r++) {
    const cols = new Map<string, number>();
    (grid[r] ?? []).forEach((cell, c) => {
      const def = lookup.get(normHeading(cell));
      if (def && !cols.has(def.field)) cols.set(def.field, c);
    });
    if ((cols.has("nameAndCost") || cols.has("name")) && cols.size > best.cols.size) best = { row: r, cols };
  }
  if (best.row < 0)
    throw new Error('No "Name of Work & Estimate Cost" column found - use the headings of the 3 Years Report (download the template).');
  return best;
}

export async function importProjects(user: AttendanceTokenPayload, buffer: Buffer): Promise<ProjectImportResult> {
  const grid = await readGrid(buffer);
  const { row: headerRow, cols } = findHeader(grid);

  const { rows: wards } = await pool.query<{ id: string; ward_name: string }>(`SELECT id, ward_name FROM attendance_wards`);
  const wardNum = (label: string) => label.match(/\d+/)?.[0]?.replace(/^0+(?=\d)/, "") ?? null;
  const wardByExact = new Map(wards.map((w) => [w.ward_name.trim().toLowerCase(), Number(w.id)]));
  const wardByNum = new Map<string, number>();
  for (const w of wards) {
    const n = /^(ward\s*(no\.?)?\s*)?\d+$/i.test(w.ward_name.trim()) ? wardNum(w.ward_name) : null;
    if (n && !wardByNum.has(n)) wardByNum.set(n, Number(w.id));
  }

  const { rows: existingRows } = await pool.query<{
    id: string;
    project_code: string;
    ward_id: string | null;
    name: string;
    financial_year: string | null;
  }>(`SELECT id, project_code, ward_id, name, financial_year FROM projects`);
  const byCode = new Map(existingRows.map((p) => [p.project_code.trim().toLowerCase(), Number(p.id)]));
  const byNameFy = new Map(existingRows.map((p) => [`${nameKey(p.name)}|${p.financial_year ?? ""}`, Number(p.id)]));

  const result: ProjectImportResult = { created: 0, updated: 0, unchanged: 0, errors: [], warnings: [], columnsFound: cols.size };
  for (let r = headerRow + 1; r < grid.length; r++) {
    const line = r + 1; // as the sheet numbers rows
    const cells = grid[r] ?? [];
    const txt = (f: string) => (cols.has(f) ? (cells[cols.get(f)!] ?? "").trim() : "");
    const rawName = txt("nameAndCost") || txt("name");
    if (cells.every((c) => blank(c ?? ""))) continue;
    if (!rawName || /^(grand\s+)?total|^कुल/i.test(rawName)) continue; // e.g. a totals row
    const warn = (m: string) => result.warnings.push({ row: line, message: m });
    try {
      const out: Out = {};
      const problems: string[] = [];
      for (const c of REPORT_COLUMNS) {
        if (c.kind === "special") continue;
        const t = txt(c.field);
        if (blank(t)) continue;
        const label = c.heading.replace(/\s+/g, " ");
        if (c.kind === "text") out[c.field] = t.replace(/\s*\n\s*/g, " ");
        else if (c.kind === "date") {
          const d = parseDate(t);
          if (d.value) out[c.field] = d.value;
          if (d.warning) warn(`${label}: ${d.warning}`);
        } else if (c.kind === "number") {
          const a = parseAmount(t);
          if (a.value !== null) out[c.field] = a.value;
          if (a.warning) warn(`${label}: ${a.warning}`);
        } else {
          const p = parsePct(t);
          if (p.value !== null) out[c.field] = p.value;
          if (p.warning) warn(`${label}: ${p.warning}`);
        }
      }

      // Name and estimate cost.
      const name = (cols.has("nameAndCost") ? nameWithoutCost(rawName) : rawName.replace(/\s+/g, " ")) || rawName;
      out.name = name;
      if (typeof out.financialYear === "string") {
        const fy = out.financialYear.replace(/\s+/g, "");
        if (fy.length > 9) {
          warn(`Financial Year "${out.financialYear}" is too long - write it like 2025-26`);
          delete out.financialYear;
        } else out.financialYear = fy;
      }
      if (cols.has("nameAndCost")) out.nameAsEntered = rawName;
      if (out.estimatedCost === undefined) {
        const cost = costFromName(rawName);
        if (cost !== null) out.estimatedCost = cost;
      }
      if (out.schemeName === undefined) {
        const sch = schemeFromName(rawName);
        if (sch) out.schemeName = sch;
      }

      // Ward: the column, else "वार्ड नं0- 21" in the name, else city-wide.
      const wardText = txt("wardId");
      const wardFrom = !blank(wardText) ? wardText : wardFromName(rawName);
      if (wardFrom) {
        const w = wardByExact.get(wardFrom.toLowerCase()) ?? wardByNum.get(wardNum(wardFrom) ?? "");
        if (w) out.wardId = w;
        else problems.push(`ward "${wardFrom}" not found`);
      }

      // A.A letter "2870,\n28.11.2023".
      const aa = txt("aaLetter");
      if (!blank(aa)) {
        const { no, date } = splitLetter(aa);
        if (no) out.approvalNo = no;
        if (date) {
          const d = parseDate(date);
          if (d.value) out.approvalDate = d.value;
          if (d.warning) warn(`A.A date: ${d.warning}`);
        }
      }

      const catText = txt("category");
      if (!blank(catText)) {
        const c = matchCategory(catText);
        if (c) out.category = c;
        else problems.push(`type of work "${catText}" not recognised`);
      }
      const discText = txt("discipline");
      if (!blank(discText)) {
        const d = matchDiscipline(discText);
        if (d) out.discipline = d;
        else problems.push(`"${discText}" should be Civil, Mechanical or Both`);
      }
      const stageText = txt("stage");
      let explicitStage: ProjectStage | null = null;
      if (!blank(stageText)) {
        explicitStage = matchStage(stageText);
        if (!explicitStage) problems.push(`stage "${stageText}" not recognised`);
      }
      if (problems.length) throw new Error(problems.join("; "));

      const code = (out.projectCode as string | undefined)?.toLowerCase();
      const existingId = (code ? byCode.get(code) : undefined) ?? byNameFy.get(`${nameKey(name)}|${out.financialYear ?? ""}`);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        if (existingId) {
          const cur = (await client.query(`SELECT * FROM projects WHERE id = $1`, [existingId])).rows[0] as Record<string, unknown>;
          if (out.category && !out.discipline) out.discipline = PROJECT_CATEGORIES[out.category].discipline;
          // Keep the as-entered text only when it says something the name and cost do not (e.g. our own download).
          if (
            cur.name_as_entered === null &&
            out.name === cur.name &&
            (out.estimatedCost ?? null) === (cur.estimated_cost === null ? null : Number(cur.estimated_cost))
          )
            delete out.nameAsEntered;
          // Stage: as given, else from the dates now known - forward only (cancelled only before the work is awarded).
          const merged = { ...factsOf(cur), ...out };
          const curStage = cur.stage as ProjectStage;
          const derived = explicitStage ?? stageFromFacts(merged);
          if (explicitStage) out.stage = explicitStage;
          else if (
            derived === "cancelled"
              ? STAGE_RANK[curStage] < STAGE_RANK.work_order_issued && curStage !== "cancelled"
              : STAGE_RANK[derived] > STAGE_RANK[curStage]
          )
            out.stage = derived;
          const changes = await projectDb.patchProject(client, existingId, out);
          if (Object.keys(changes).length) {
            await projectDb.audit(client, user, changes.stage ? "stage_changed" : "project_edited", existingId, {
              ...changes,
              viaExcel: true,
            });
            result.updated++;
          } else result.unchanged++;
        } else {
          const guessed = guessCategory(rawName);
          const input = {
            ...out,
            name,
            wardId: out.wardId ?? null,
            category: out.category ?? guessed.category,
            discipline: out.discipline ?? (out.category ? null : guessed.discipline),
            stage: explicitStage,
          } as ProjectInput;
          const id = await projectDb.insertProject(client, user, input);
          const saved = (
            await client.query<{ project_code: string; stage: string }>(`SELECT project_code, stage FROM projects WHERE id = $1`, [id])
          ).rows[0]!;
          await projectDb.audit(client, user, "project_added", id, { name, stage: saved.stage, viaExcel: true });
          byCode.set(saved.project_code.toLowerCase(), id);
          byNameFy.set(`${nameKey(name)}|${input.financialYear ?? ""}`, id);
          result.created++;
        }
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    } catch (e) {
      result.errors.push({ row: line, message: e instanceof Error ? e.message : String(e) });
    }
  }
  if (result.created + result.updated + result.unchanged + result.errors.length > 0) {
    await projectDb.audit(pool, user, "bulk_import", null, {
      created: result.created,
      updated: result.updated,
      unchanged: result.unchanged,
      errors: result.errors.length,
      warnings: result.warnings.length,
    });
  }
  return result;
}

const iso = (v: unknown) =>
  v instanceof Date ? `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}` : v === null || v === undefined ? null : String(v);
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
/** The stage-relevant facts of a stored project row. */
function factsOf(r: Record<string, unknown>) {
  return {
    tenderDate: iso(r.tender_date),
    techBidDisposalDate: iso(r.tech_bid_disposal_date),
    finBidOpeningDate: iso(r.fin_bid_opening_date),
    workAwardedDate: iso(r.work_awarded_date),
    agreementDate: iso(r.agreement_date),
    workOrderDate: iso(r.work_order_date),
    actualStartDate: iso(r.actual_start_date),
    actualCompletionDate: iso(r.actual_completion_date),
    physicalProgressPct: num(r.physical_progress_pct),
    financialProgressPct: num(r.financial_progress_pct),
    paymentDate: iso(r.payment_date),
    remarks: (r.remarks as string | null) ?? null,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Template and download in the same format
// ---------------------------------------------------------------------------------------------------------------------

const TEMPLATE_COLUMNS = REPORT_COLUMNS.filter((c) => c.field !== "name");
const REPORT_COUNT = TEMPLATE_COLUMNS.findIndex((c) => c.field === "projectCode"); // the report's own columns come first

function styleHeader(ws: ExcelJS.Worksheet) {
  ws.columns = TEMPLATE_COLUMNS.map((c, i) => ({
    header: c.heading,
    key: c.field,
    width: c.field === "nameAndCost" ? 60 : i < REPORT_COUNT ? 16 : 20,
  }));
  const h = ws.getRow(1);
  h.height = 90;
  h.eachCell((cell, n) => {
    cell.font = { bold: true };
    cell.alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: n <= REPORT_COUNT ? "FFDDEBF7" : "FFF2F2F2" } };
    cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
  });
  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 2 }];
}

/** The blank sheet: the 3 Years Report columns (blue) then the optional portal columns (grey), with instructions. */
export async function projectTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  styleHeader(wb.addWorksheet("Projects"));
  const help = wb.addWorksheet("Instructions");
  help.columns = [{ width: 110 }];
  const lines = [
    "How to fill this sheet",
    "",
    "One row per scheme / work, in the 3 Years Report format. Blue columns are the report's own; grey ones are optional.",
    'Name of Work & Estimate Cost: the name as usual, ending "... की प्राक्कलित राशि मो0- 57,68,000/- रू0" - the amount is read from it.',
    'Ward Number: the number only. Leave blank for a city-wide work (or write the ward in the name as "वार्ड नं0- 21").',
    "Dates: DD.MM.YYYY (e.g. 25.11.2023). Use - (dash) where a step does not apply or has not happened yet.",
    'A.A Letter No. & Date: "2870, 28.11.2023" (letter number, then the date).',
    "Progress columns: a number from 0 to 100.",
    "The stage (approved, tendered, work order given, in progress, completed, payment done) is worked out from the dates and progress.",
    'Remarks with "रद्द" mark a tender / scheme cancelled (unless the work was already awarded).',
    "Type of work is guessed from the name (नाला, पी0सी0सी0 रोड, सबमर्सिबल / प्याऊ ...) - fill the grey column, or correct it in the portal.",
    "",
    "Uploading the same sheet again later updates the works already entered (matched by name + financial year, or Project Code):",
    "filled cells are taken, blank / dash cells never erase anything, and the stage only moves forward.",
    "",
    "Type of work (for the optional column):",
    ...PROJECT_CATEGORY_KEYS.map(
      (k) => `   ${PROJECT_CATEGORIES[k].label} (${PROJECT_CATEGORIES[k].discipline === "civil" ? "Civil" : "Mechanical"})`,
    ),
  ];
  for (const l of lines) help.addRow([l]);
  help.getRow(1).font = { bold: true, size: 13 };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const dmy = (v: unknown) => {
  const s = iso(v);
  const m = s?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "-";
};
const dash = (v: unknown) => (v === null || v === undefined || v === "" ? "-" : String(v));
const rupeeText = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

/** The projects (same filter as the list) in the 3 Years Report format - the same columns as the upload. */
export async function exportProjectsReport(user: AttendanceTokenPayload, f: ProjectFilter): Promise<Buffer> {
  const rows = (await listProjects(user, f)) as Record<string, unknown>[];
  rows.sort((a, b) => Number(a.id) - Number(b.id));
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Projects");
  styleHeader(ws);
  rows.forEach((p, i) => {
    const cost = num(p.estimated_cost);
    const nameCell =
      (p.name_as_entered as string | null) ?? `${String(p.name)}${cost ? ` की प्राक्कलित राशि मो0- ${rupeeText(cost)}/- रू0` : ""}`;
    const wardNo = p.ward_id ? (String(p.ward_name).match(/\d+/)?.[0] ?? String(p.ward_name)) : "";
    const v: Record<string, unknown> = {
      srNo: i + 1,
      nameAndCost: nameCell,
      wardId: wardNo,
      financialYear: dash(p.financial_year),
      aaLetter: p.approval_no || p.approval_date ? `${p.approval_no ?? ""},\n${p.approval_date ? dmy(p.approval_date) : ""}` : "-",
      bidderClaim: dash(p.bidder_claim),
      componentProgressPct: dash(num(p.component_progress_pct)),
      physicalProgressPct: dash(num(p.physical_progress_pct)),
      financialProgressPct: dash(num(p.financial_progress_pct)),
      eotReason: dash(p.eot_reason),
      remarks: (p.remarks as string | null) ?? "",
      projectCode: p.project_code,
      category: PROJECT_CATEGORIES[p.category as ProjectCategory]?.label ?? p.category,
      discipline: p.discipline === "both" ? "Both" : p.discipline === "mechanical" ? "Mechanical" : "Civil",
      schemeName: p.scheme_name ?? "",
      estimatedCost: cost ?? "",
      agencyName: p.agency_name ?? "",
      workOrderNo: p.work_order_no ?? "",
      workOrderAmount: num(p.work_order_amount) ?? "",
      paymentAmount: num(p.payment_amount) ?? "",
      locationText: p.location_text ?? "",
      stage: PROJECT_STAGE_LABELS[p.stage as ProjectStage] ?? p.stage,
    };
    const DATE_FIELDS: Record<string, string> = {
      taSentDate: "ta_sent_date",
      taDate: "ta_date",
      tsSentDate: "ts_sent_date",
      tsDate: "ts_date",
      boqApprovalDate: "boq_approval_date",
      tenderDate: "tender_date",
      techBidOpeningDate: "tech_bid_opening_date",
      csToEeDate: "cs_to_ee_date",
      csToSeDate: "cs_to_se_date",
      csToCeDate: "cs_to_ce_date",
      csToEicDate: "cs_to_eic_date",
      techBidDisposalDate: "tech_bid_disposal_date",
      claimDisposalDate: "claim_disposal_date",
      finBidOpeningDate: "fin_bid_opening_date",
      finBidToEeDate: "fin_bid_to_ee_date",
      finBidToSeDate: "fin_bid_to_se_date",
      finBidToCeDate: "fin_bid_to_ce_date",
      finBidToEicDate: "fin_bid_to_eic_date",
      workAwardedDate: "work_awarded_date",
      agreementDate: "agreement_date",
      targetCompletionDate: "target_completion_date",
      actualCompletionDate: "actual_completion_date",
      eotDate: "eot_date",
      actualStartDate: "actual_start_date",
      paymentDate: "payment_date",
    };
    for (const [k, c] of Object.entries(DATE_FIELDS)) v[k] = p[c] ? dmy(p[c]) : k === "actualStartDate" || k === "paymentDate" ? "" : "-";
    const row = ws.addRow(v);
    row.alignment = { wrapText: true, vertical: "top" };
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
