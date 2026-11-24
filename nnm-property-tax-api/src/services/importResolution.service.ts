import { pool } from "../config/db";
import { ApiError } from "../utils/ApiError";
import { normalizeWard } from "../utils/ward";
import { cellNumber } from "./propertyBulkImport.service";
import {
  checkHolding,
  claimBatchLock,
  integrateStagedHoldings,
  releaseBatchLock,
  revive,
  text,
  type PlainRow,
  type StagedIssue,
} from "./propertyImportStaging.service";
import { applyMerge, checkPlan, compareWithLive, planSummary, type Comparison, type MergePlan } from "./importMerge.service";
import { regenerateAutomaticTaxHistoryStages } from "./automaticTaxHistory.service";
import { propertyRepository } from "../repositories/property.repository";
import { propertySaveRepository } from "../repositories/propertySave.repository";
import type { AdminTokenPayload } from "../types/admin.types";

/**
 * Resolving what did not go live from a bulk holding upload:
 *   - kept out      - a staged holding excluded during review;
 *   - blocked       - a staged holding with a blocking issue (cannot be imported as it is);
 *   - failed        - a staged holding the importer refused at integration;
 *   - not staged    - a row of the file that could not even be staged (no / duplicate holding number, or a sheet row
 *                     whose holding has no Master row). Uploads from now on keep the row itself; older ones only the
 *                     message, so those can only be dropped (or re-uploaded).
 * The Tax Daroga proposes a resolution - correct the data and import, import as it is, or drop - with remarks. It goes
 * to the City Manager, then the DMC, then the Municipal Commissioner, whose approval carries it out (the holding is
 * imported through the normal importer, or recorded as dropped). Anyone up the chain can revert it to the Tax Daroga
 * with a comment. Visible to the Tax Daroga, City Manager, DMC and Municipal Commissioner.
 *
 * A holding blocked because the same number already exists live can be MERGED into it instead (importMerge.service):
 * the Tax Daroga settles every dispute between the two data field by field; on approval the chosen values, floors,
 * receipts, notices, tax history and the upload's change history go into the live holding, and the holding history
 * records the before / after, every value taken and every value rejected, and who proposed, recommended and approved.
 */

export const VIEW_ROLES = ["tax_daroga", "city_manager", "deputy_commissioner", "commissioner"] as const;
type Stage = "city_manager" | "deputy_commissioner" | "commissioner" | "tax_daroga" | "done";
type Action = "correct_import" | "import_as_is" | "drop" | "merge";
const NEXT: Record<string, Stage> = { city_manager: "deputy_commissioner", deputy_commissioner: "commissioner" };
export const STAGE_LABEL: Record<Stage, string> = {
  tax_daroga: "Tax Daroga (to correct)",
  city_manager: "City Manager",
  deputy_commissioner: "DMC",
  commissioner: "Municipal Commissioner",
  done: "Done",
};

function assertViewer(u: AdminTokenPayload) {
  if (!(VIEW_ROLES as readonly string[]).includes(u.role)) throw new ApiError(403, "Not allowed.");
}

interface Batch {
  id: number;
  data_source_name: string;
  status: string;
  upload_errors: { sheet: string; row: number; message: string; data?: PlainRow }[];
}
async function batchOf(batchId: number): Promise<Batch> {
  const { rows } = await pool.query<Batch>(
    `SELECT id, data_source_name, status, upload_errors FROM property_import_batches WHERE id = $1`,
    [batchId],
  );
  if (!rows[0]) throw ApiError.notFound("Upload not found.");
  return rows[0];
}

interface CaseRow {
  id: string;
  batch_id: number;
  kind: "staged" | "upload_row";
  staging_id: string | null;
  error_index: number | null;
  holding_no: string | null;
  problem: string;
  action: Action;
  proposed_master: PlainRow | null;
  proposed_floors: PlainRow[] | null;
  proposed_merge: { plan: MergePlan; comparison: Comparison } | null;
  remarks: string;
  stage: Stage;
  status: "open" | "reverted" | "approved" | "failed";
  outcome: string | null;
  events: { stage: string; action: string; by: string; role: string; at: string; comment: string | null }[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

const caseView = (c: CaseRow) => ({
  id: Number(c.id),
  kind: c.kind,
  stagingId: c.staging_id ? Number(c.staging_id) : null,
  errorIndex: c.error_index,
  holdingNo: c.holding_no,
  problem: c.problem,
  action: c.action,
  remarks: c.remarks,
  stage: c.stage,
  stageLabel: STAGE_LABEL[c.stage],
  status: c.status,
  outcome: c.outcome,
  events: c.events,
  createdBy: c.created_by,
  createdAt: c.created_at,
  updatedAt: c.updated_at,
  changedFields: c.proposed_master ? Object.keys(c.proposed_master) : [],
  floorsChanged: !!c.proposed_floors,
  merge: c.proposed_merge
    ? {
        plan: c.proposed_merge.plan,
        comparison: c.proposed_merge.comparison,
        summary: planSummary(c.proposed_merge.comparison, c.proposed_merge.plan),
      }
    : null,
});

/** Who acts on a case now (for highlighting "waiting for you"). */
const myStage = (u: AdminTokenPayload): Stage | null =>
  u.role === "tax_daroga"
    ? "tax_daroga"
    : (["city_manager", "deputy_commissioner", "commissioner"] as string[]).includes(u.role)
      ? (u.role as Stage)
      : null;

function stagedProblem(r: {
  status: string;
  exclude_reason: string | null;
  error: string | null;
  issues: StagedIssue[];
  has_blocker: boolean;
}) {
  if (r.status === "excluded")
    return { category: "kept_out" as const, problem: r.exclude_reason ? `Kept out: ${r.exclude_reason}` : "Kept out during review." };
  if (r.status === "failed") return { category: "failed" as const, problem: r.error || "Failed at integration." };
  return {
    category: "blocked" as const,
    problem: r.issues
      .filter((i) => i.severity === "block")
      .map((i) => i.message)
      .join(" "),
  };
}

/** Everything in an upload that has not gone live, with the latest resolution of each. */
export async function heldItems(u: AdminTokenPayload, batchId: number) {
  assertViewer(u);
  const b = await batchOf(batchId);
  const [{ rows: staged }, { rows: cases }] = await Promise.all([
    pool.query<{
      id: string;
      holding_no: string;
      owner_name: string | null;
      ward: string | null;
      status: string;
      exclude_reason: string | null;
      error: string | null;
      issues: StagedIssue[];
      has_blocker: boolean;
    }>(
      `SELECT id, holding_no, owner_name, ward, status, exclude_reason, error, issues, has_blocker FROM property_import_staging
        WHERE batch_id = $1 AND ((status IN ('excluded', 'failed') OR (status = 'pending' AND has_blocker))
          AND NOT (status = 'excluded' AND exclude_reason LIKE 'Upload discarded by %')
          -- and the ones already resolved this way (imported / merged), so their record stays in view
          OR id IN (SELECT staging_id FROM import_resolution_cases WHERE batch_id = $1 AND staging_id IS NOT NULL))
        ORDER BY holding_no`,
      [batchId],
    ),
    pool.query<CaseRow>(`SELECT * FROM import_resolution_cases WHERE batch_id = $1 ORDER BY id DESC`, [batchId]),
  ]);
  const latestStaged = new Map<string, CaseRow>();
  const latestRow = new Map<number, CaseRow>();
  for (const c of cases) {
    if (c.kind === "staged" && c.staging_id && !latestStaged.has(c.staging_id)) latestStaged.set(c.staging_id, c);
    if (c.kind === "upload_row" && c.error_index !== null && !latestRow.has(c.error_index)) latestRow.set(c.error_index, c);
  }
  const mine = myStage(u);
  // Staged holdings whose number already exists live can be merged into the live holding.
  const { rows: liveRows } = staged.length
    ? await pool.query<{ k: string }>(
        `SELECT REPLACE(holding_no, ' ', '') AS k FROM properties WHERE REPLACE(holding_no, ' ', '') = ANY($1::text[])`,
        [staged.map((r) => r.holding_no.replace(/ /g, ""))],
      )
    : { rows: [] as { k: string }[] };
  const liveSet = new Set(liveRows.map((r) => r.k));
  const items = [
    ...staged.map((r) => {
      const c = latestStaged.get(r.id);
      const p = r.status === "integrated" ? { category: "resolved" as const, problem: c?.problem ?? "Resolved." } : stagedProblem(r);
      // A dropped holding stays "kept out" in the staging table; its approved case marks it resolved.
      return {
        ref: `s${r.id}`,
        kind: "staged" as const,
        stagingId: Number(r.id),
        errorIndex: null,
        category: p.category,
        holdingNo: r.holding_no,
        ownerName: r.owner_name,
        ward: r.ward,
        problem: p.problem,
        canImport: true,
        canMerge: liveSet.has(r.holding_no.replace(/ /g, "")),
        case: c ? caseView(c) : null,
        resolved: c?.status === "approved",
        waitingForMe: !!c && ((c.status === "open" && c.stage === mine) || (c.status === "reverted" && mine === "tax_daroga")),
      };
    }),
    ...b.upload_errors.map((e, i) => {
      const c = latestRow.get(i);
      return {
        ref: `r${i}`,
        kind: "upload_row" as const,
        stagingId: null,
        errorIndex: i,
        category: "not_staged" as const,
        holdingNo: e.data ? text(e.data.HoldingNo) || null : null,
        ownerName: e.data ? text(e.data.OwnerName) || null : null,
        ward: e.data ? text(e.data.Ward) || null : null,
        problem: `${e.sheet} sheet, row ${e.row}: ${e.message}`,
        // Only a Master row with its data kept can be corrected and imported; anything else can be dropped.
        canImport: e.sheet === "Master" && !!e.data,
        canMerge: false,
        case: c ? caseView(c) : null,
        resolved: c?.status === "approved",
        waitingForMe: !!c && ((c.status === "open" && c.stage === mine) || (c.status === "reverted" && mine === "tax_daroga")),
      };
    }),
  ];
  const count = (cat: string) => items.filter((i) => i.category === cat).length;
  return {
    batchStatus: b.status,
    counts: {
      keptOut: count("kept_out"),
      blocked: count("blocked"),
      failed: count("failed"),
      notStaged: count("not_staged"),
      resolved: items.filter((i) => i.resolved).length,
      inProgress: items.filter((i) => i.case && (i.case.status === "open" || i.case.status === "reverted")).length,
      waitingForMe: items.filter((i) => i.waitingForMe).length,
    },
    items,
  };
}

const showRow = (o: PlainRow | null | undefined) => Object.fromEntries(Object.entries(o ?? {}).map(([k, v]) => [k, text(v)]));

/** One held item: its data (as staged / as in the file), its issues, and every resolution made for it. */
export async function itemDetail(u: AdminTokenPayload, batchId: number, ref: string) {
  assertViewer(u);
  const b = await batchOf(batchId);
  let master: PlainRow | null = null;
  let floors: PlainRow[] = [];
  let issues: StagedIssue[] = [];
  let merge: Comparison | null = null;
  let sheet = "Master";
  let caseCond: string;
  let caseParam: unknown;
  if (ref.startsWith("s")) {
    const { rows } = await pool.query(`SELECT * FROM property_import_staging WHERE batch_id = $1 AND id = $2`, [
      batchId,
      Number(ref.slice(1)),
    ]);
    if (!rows[0]) throw ApiError.notFound("Holding not found in this upload.");
    master = rows[0].master;
    floors = rows[0].sheets?.Floors ?? [];
    issues = rows[0].issues;
    if (master && (await liveExists(text(master.HoldingNo)))) merge = await compareWithLive(master, rows[0].sheets ?? {});
    caseCond = "kind = 'staged' AND staging_id = $2";
    caseParam = rows[0].id;
  } else {
    const i = Number(ref.slice(1));
    const e = b.upload_errors[i];
    if (!e) throw ApiError.notFound("Row not found in this upload.");
    sheet = e.sheet;
    master = e.sheet === "Master" ? (e.data ?? null) : null;
    floors = e.sheet === "Floors" && e.data ? [e.data] : [];
    if (e.sheet !== "Master" && e.sheet !== "Floors" && e.data) floors = [];
    caseCond = "kind = 'upload_row' AND error_index = $2";
    caseParam = i;
    if (master) issues = checkHolding(master, 0, false).filter((x) => x.severity === "block");
  }
  const { rows: cases } = await pool.query<CaseRow>(
    `SELECT * FROM import_resolution_cases WHERE batch_id = $1 AND ${caseCond} ORDER BY id DESC`,
    [batchId, caseParam],
  );
  const current = cases.find((c) => c.status === "open" || c.status === "reverted") ?? null;
  return {
    sheet,
    master: master ? showRow(master) : null,
    floors: floors.map((f) => showRow(f)),
    rawRow: ref.startsWith("r") ? showRow(b.upload_errors[Number(ref.slice(1))]?.data) : null,
    issues,
    /** The upload compared with the live holding of the same number (when there is one) - for a merge. */
    merge,
    // The proposal being worked on, with its corrected values.
    proposal: current
      ? {
          ...caseView(current),
          master: current.proposed_master ? showRow(current.proposed_master) : null,
          floors: current.proposed_floors ? current.proposed_floors.map((f) => showRow(f)) : null,
        }
      : null,
    history: cases.map(caseView),
  };
}

export interface ProposalInput {
  ref: string;
  action: Action;
  /** Changed Master fields only (field -> new text). */
  masterChanges?: Record<string, string> | null;
  /** The complete Floors rows, when changed. */
  floors?: Record<string, string>[] | null;
  /** Merge into the live holding: the choice for every dispute and the rows to add. */
  mergePlan?: MergePlan | null;
  remarks: string;
}

async function liveExists(holdingNo: string) {
  const { rows } = await pool.query(`SELECT 1 FROM properties WHERE REPLACE(holding_no, ' ', '') = $1 LIMIT 1`, [
    holdingNo.replace(/ /g, ""),
  ]);
  return !!rows[0];
}

/** Tax Daroga: proposes (or, after a revert, re-proposes) a resolution; it goes to the City Manager. */
export async function propose(u: AdminTokenPayload, batchId: number, input: ProposalInput) {
  if (u.role !== "tax_daroga") throw new ApiError(403, "The Tax Daroga proposes the resolution.");
  const b = await batchOf(batchId);
  if (b.status !== "open") throw ApiError.badRequest("This upload has been discarded.");
  const remarks = input.remarks.trim();
  if (remarks.length < 5) throw ApiError.badRequest("Explain the resolution in the remarks.");

  let kind: "staged" | "upload_row";
  let stagingId: string | null = null;
  let errorIndex: number | null = null;
  let baseMaster: PlainRow | null;
  let baseFloors: PlainRow[];
  let problem: string;
  let holdingNo: string | null;
  if (input.ref.startsWith("s")) {
    kind = "staged";
    const { rows } = await pool.query(`SELECT * FROM property_import_staging WHERE batch_id = $1 AND id = $2`, [
      batchId,
      Number(input.ref.slice(1)),
    ]);
    const r = rows[0];
    if (!r) throw ApiError.notFound("Holding not found in this upload.");
    if (!(r.status === "excluded" || r.status === "failed" || (r.status === "pending" && r.has_blocker)))
      throw ApiError.badRequest("This holding is not held back - nothing to resolve.");
    if (!r.master && input.action !== "drop")
      throw ApiError.badRequest("The data of this holding is no longer kept - it can only be dropped (or uploaded again).");
    stagingId = r.id;
    baseMaster = r.master;
    baseFloors = r.sheets?.Floors ?? [];
    problem = stagedProblem(r).problem;
    holdingNo = r.holding_no;
  } else {
    kind = "upload_row";
    errorIndex = Number(input.ref.slice(1));
    const e = b.upload_errors[errorIndex];
    if (!e) throw ApiError.notFound("Row not found in this upload.");
    const importable = e.sheet === "Master" && !!e.data;
    if (input.action !== "drop" && !importable)
      throw ApiError.badRequest("Only a Master row whose data was kept can be imported. Drop this row, or put it right in a new upload.");
    baseMaster = importable ? (e.data as PlainRow) : null;
    baseFloors = [];
    problem = `${e.sheet} sheet, row ${e.row}: ${e.message}`;
    holdingNo = e.data ? text(e.data.HoldingNo) || null : null;
  }

  let proposedMaster: PlainRow | null = null;
  let proposedFloors: PlainRow[] | null = null;
  let proposedMerge: { plan: MergePlan; comparison: Comparison } | null = null;
  if (input.action === "merge") {
    if (kind !== "staged" || !baseMaster)
      throw ApiError.badRequest("Only a staged holding whose number exists in the live data can be merged.");
    if (!input.mergePlan) throw ApiError.badRequest("Make the merge choices.");
    const { rows: sr } = await pool.query(`SELECT sheets FROM property_import_staging WHERE id = $1`, [stagingId]);
    const comparison = await compareWithLive(baseMaster, sr[0]?.sheets ?? {});
    checkPlan(comparison, input.mergePlan);
    proposedMerge = { plan: input.mergePlan, comparison };
    holdingNo = comparison.holdingNo;
  } else if (input.action === "correct_import") {
    const changes = Object.fromEntries(Object.entries(input.masterChanges ?? {}).map(([k, v]) => [k, String(v ?? "").trim()]));
    if (!Object.keys(changes).length && !input.floors)
      throw ApiError.badRequest("Nothing was corrected - change the data, or choose 'import as it is'.");
    proposedMaster = Object.keys(changes).length ? changes : null;
    proposedFloors = input.floors
      ? input.floors.map((f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, String(v ?? "").trim()])))
      : null;
  }
  if (input.action === "correct_import" || input.action === "import_as_is") {
    // The data that would be imported must clear every blocking check now, so the chain only sees importable data.
    const master = { ...(baseMaster ?? {}), ...(proposedMaster ?? {}) };
    const floors = proposedFloors ?? baseFloors;
    const newNo = text(master.HoldingNo);
    if (!newNo) throw ApiError.badRequest("Enter the holding number.");
    const blockers = checkHolding(master, floors.length, await liveExists(newNo)).filter((x) => x.severity === "block");
    if (blockers.length) throw ApiError.badRequest(`Still cannot be imported: ${blockers.map((x) => x.message).join(" ")}`);
    if (newNo !== holdingNo || kind === "upload_row") {
      const { rows: dup } = await pool.query(
        `SELECT 1 FROM property_import_staging WHERE batch_id = $1 AND holding_no = $2 AND id IS DISTINCT FROM $3`,
        [batchId, newNo, stagingId],
      );
      if (dup[0]) throw ApiError.badRequest(`Holding ${newNo} is already in this upload.`);
    }
    holdingNo = newNo;
  }

  const event = {
    stage: "tax_daroga",
    action: "proposed",
    by: u.displayName,
    role: u.role,
    at: new Date().toISOString(),
    comment: remarks,
  };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: live } = await client.query<CaseRow>(
      `SELECT * FROM import_resolution_cases WHERE batch_id = $1 AND status IN ('open', 'reverted')
          AND ${kind === "staged" ? "kind = 'staged' AND staging_id = $2" : "kind = 'upload_row' AND error_index = $2"} FOR UPDATE`,
      [batchId, kind === "staged" ? stagingId : errorIndex],
    );
    if (live[0]?.status === "open") throw ApiError.badRequest(`A resolution is already with the ${STAGE_LABEL[live[0].stage]}.`);
    let id: string;
    if (live[0]) {
      id = live[0].id;
      await client.query(
        `UPDATE import_resolution_cases SET action = $2, proposed_master = $3, proposed_floors = $4, remarks = $5, holding_no = $6, stage = 'city_manager',
                status = 'open', events = events || $7::jsonb, proposed_merge = $8, updated_at = now() WHERE id = $1`,
        [
          id,
          input.action,
          proposedMaster ? JSON.stringify(proposedMaster) : null,
          proposedFloors ? JSON.stringify(proposedFloors) : null,
          remarks,
          holdingNo,
          JSON.stringify([event]),
          proposedMerge ? JSON.stringify(proposedMerge) : null,
        ],
      );
    } else {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO import_resolution_cases (batch_id, kind, staging_id, error_index, holding_no, problem, action, proposed_master, proposed_floors, remarks, events, created_by, proposed_merge)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
        [
          batchId,
          kind,
          stagingId,
          errorIndex,
          holdingNo,
          problem,
          input.action,
          proposedMaster ? JSON.stringify(proposedMaster) : null,
          proposedFloors ? JSON.stringify(proposedFloors) : null,
          remarks,
          JSON.stringify([event]),
          u.displayName,
          proposedMerge ? JSON.stringify(proposedMerge) : null,
        ],
      );
      id = rows[0]!.id;
    }
    await client.query("COMMIT");
    return { id: Number(id) };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/**
 * City Manager / DMC: forward up the chain or revert to the Tax Daroga. Municipal Commissioner: approve (carries the
 * resolution out) or revert.
 */
export async function decide(u: AdminTokenPayload, caseId: number, decision: "forward" | "approve" | "revert", comment: string | null) {
  assertViewer(u);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<CaseRow>(`SELECT * FROM import_resolution_cases WHERE id = $1 FOR UPDATE`, [caseId]);
    const c = rows[0];
    if (!c) throw ApiError.notFound("Resolution not found.");
    if (c.status !== "open") throw ApiError.badRequest("This resolution is not waiting for a decision.");
    if (c.stage !== u.role) throw new ApiError(403, `This resolution is with the ${STAGE_LABEL[c.stage]}.`);
    const ev = (action: string) =>
      JSON.stringify([
        { stage: c.stage, action, by: u.displayName, role: u.role, at: new Date().toISOString(), comment: comment?.trim() || null },
      ]);
    if (decision === "revert") {
      if (!comment || comment.trim().length < 5) throw ApiError.badRequest("Say what the Tax Daroga has to correct.");
      await client.query(
        `UPDATE import_resolution_cases SET status = 'reverted', stage = 'tax_daroga', events = events || $2::jsonb, updated_at = now() WHERE id = $1`,
        [caseId, ev("reverted")],
      );
      await client.query("COMMIT");
      return { status: "reverted" };
    }
    if (decision === "forward") {
      const next = NEXT[c.stage];
      if (!next) throw ApiError.badRequest("The Municipal Commissioner approves - nothing to forward.");
      await client.query(`UPDATE import_resolution_cases SET stage = $2, events = events || $3::jsonb, updated_at = now() WHERE id = $1`, [
        caseId,
        next,
        ev("recommended"),
      ]);
      await client.query("COMMIT");
      return { status: "forwarded", stage: next };
    }
    if (c.stage !== "commissioner") throw ApiError.badRequest("Final approval is given by the Municipal Commissioner.");
    await client.query("COMMIT");
    return await carryOut(u, c, comment?.trim() || null);
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

async function closeCase(
  c: CaseRow,
  u: AdminTokenPayload,
  status: "approved" | "reverted",
  stage: Stage,
  action: string,
  outcome: string,
  comment: string | null,
) {
  await pool.query(
    `UPDATE import_resolution_cases SET status = $2, stage = $3, outcome = $4, events = events || $5::jsonb, updated_at = now() WHERE id = $1`,
    [
      c.id,
      status,
      stage,
      outcome,
      JSON.stringify([
        { stage: "commissioner", action, by: u.displayName, role: u.role, at: new Date().toISOString(), comment: comment ?? outcome },
      ]),
    ],
  );
}

/** The Municipal Commissioner's approval: drop, or put the (corrected) holding through the importer. */
async function carryOut(u: AdminTokenPayload, c: CaseRow, comment: string | null) {
  const b = await batchOf(c.batch_id);
  if (b.status !== "open") throw ApiError.badRequest("This upload has been discarded.");
  if (c.action === "drop") {
    if (c.kind === "staged")
      await pool.query(
        `UPDATE property_import_staging SET status = 'excluded', exclude_reason = $3 WHERE batch_id = $1 AND id = $2 AND status IN ('pending', 'excluded', 'failed')`,
        [c.batch_id, c.staging_id, `Dropped on resolution no. ${c.id}, approved by ${u.displayName}: ${c.remarks}`.slice(0, 1000)],
      );
    await closeCase(c, u, "approved", "done", "approved", "Dropped - will not be imported.", comment);
    return { status: "approved", outcome: "dropped" };
  }
  if (c.action === "merge") return mergeCarryOut(u, c, b, comment);

  // Import: write the corrected data into the staging row (a new row for a line of the file that was never staged).
  let stagingId = c.staging_id;
  let master: PlainRow;
  let sheets: Record<string, PlainRow[]>;
  if (c.kind === "staged") {
    const { rows } = await pool.query(`SELECT * FROM property_import_staging WHERE id = $1`, [stagingId]);
    if (!rows[0]?.master) throw ApiError.badRequest("The data of this holding is no longer kept.");
    master = { ...rows[0].master, ...(c.proposed_master ?? {}) };
    sheets = { ...(rows[0].sheets ?? {}) };
  } else {
    const e = b.upload_errors[c.error_index!];
    if (!e?.data) throw ApiError.badRequest("The data of this row is not kept.");
    master = { ...e.data, ...(c.proposed_master ?? {}) };
    sheets = {};
  }
  const holdingNo = text(master.HoldingNo);
  master.HoldingNo = holdingNo;
  if (c.proposed_floors) sheets.Floors = c.proposed_floors.map((f) => ({ ...f, HoldingNo: holdingNo }));
  else if (sheets.Floors) sheets.Floors = sheets.Floors.map((f) => ({ ...f, HoldingNo: holdingNo }));
  for (const k of Object.keys(sheets)) if (k !== "Floors") sheets[k] = (sheets[k] ?? []).map((r) => ({ ...r, HoldingNo: holdingNo }));
  const floorsCount = sheets.Floors?.length ?? 0;
  const issues = checkHolding(master, floorsCount, await liveExists(holdingNo));
  const blockers = issues.filter((x) => x.severity === "block");
  if (blockers.length) {
    // The data no longer clears the checks (e.g. the holding has since been created live) - back to the Tax Daroga.
    const msg = `Not imported: ${blockers.map((x) => x.message).join(" ")}`;
    await closeCase(c, u, "reverted", "tax_daroga", "failed", msg, msg);
    return { status: "reverted", outcome: msg };
  }
  if (!(await claimBatchLock(c.batch_id)))
    throw ApiError.badRequest("An integration of this upload is running - approve again once it has finished.");
  try {
    const cols = [
      holdingNo,
      text(master.OwnerName) || null,
      text(master.Ward) ? normalizeWard(text(master.Ward)) : null,
      cellNumber(revive(master.AreaSqft)) ?? 0,
      floorsCount,
      JSON.stringify(issues),
      JSON.stringify(master),
      JSON.stringify(sheets),
      `Resolution no. ${c.id} (${u.displayName})`,
    ];
    if (c.kind === "staged") {
      await pool.query(
        `UPDATE property_import_staging SET holding_no = $1, owner_name = $2, ward = $3, area_sqft = $4, floors_count = $5, issues = $6, has_blocker = FALSE,
                master = $7, sheets = $8, status = 'pending', exclude_reason = NULL, error = NULL, reviewed_by = $9, reviewed_at = now()
          WHERE id = $10`,
        [...cols, stagingId],
      );
    } else {
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO property_import_staging (holding_no, owner_name, ward, area_sqft, floors_count, issues, has_blocker, master, sheets, reviewed_by, reviewed_at, batch_id)
         VALUES ($1,$2,$3,$4,$5,$6,FALSE,$7,$8,$9, now(), $10) RETURNING id`,
        [...cols, c.batch_id],
      );
      stagingId = rows[0]!.id;
      await pool.query(`UPDATE import_resolution_cases SET staging_id = $2 WHERE id = $1`, [c.id, stagingId]);
    }
    const summary = await integrateStagedHoldings(c.batch_id, b.data_source_name, [holdingNo], u.displayName);
    if (summary.integrated === 1) {
      await closeCase(c, u, "approved", "done", "approved", `Imported - holding ${holdingNo} is now live.`, comment);
      return { status: "approved", outcome: "imported", holdingNo };
    }
    const why = summary.errors[holdingNo] ?? "The importer did not accept it.";
    await closeCase(c, u, "reverted", "tax_daroga", "failed", `Import failed: ${why}`, `Import failed: ${why}`);
    return { status: "reverted", outcome: `Import failed: ${why}` };
  } finally {
    await releaseBatchLock(c.batch_id);
  }
}

/** Resolutions waiting for this login, across uploads (dashboard / upload list). */
export async function waitingForMe(u: AdminTokenPayload) {
  const stage = myStage(u);
  if (!stage) return { total: 0, byBatch: {} as Record<number, number> };
  const { rows } = await pool.query<{ batch_id: number; n: number }>(
    stage === "tax_daroga"
      ? `SELECT batch_id, count(*)::int AS n FROM import_resolution_cases WHERE status = 'reverted' GROUP BY 1`
      : `SELECT batch_id, count(*)::int AS n FROM import_resolution_cases WHERE status = 'open' AND stage = $1 GROUP BY 1`,
    stage === "tax_daroga" ? [] : [stage],
  );
  return { total: rows.reduce((s, r) => s + r.n, 0), byBatch: Object.fromEntries(rows.map((r) => [r.batch_id, r.n])) };
}

/** The Municipal Commissioner's approval of a merge: one transaction, then the full record in the holding history. */
async function mergeCarryOut(u: AdminTokenPayload, c: CaseRow, b: Batch, comment: string | null) {
  if (!c.proposed_merge) throw ApiError.badRequest("The merge plan is missing.");
  const { rows: sr } = await pool.query(`SELECT * FROM property_import_staging WHERE id = $1`, [c.staging_id]);
  const st = sr[0];
  if (!st?.master) throw ApiError.badRequest("The uploaded data of this holding is no longer kept.");
  const reference = `Upload no. ${b.id} (${b.data_source_name}), resolution no. ${c.id}`;
  const client = await pool.connect();
  let result: Awaited<ReturnType<typeof applyMerge>>;
  try {
    await client.query("BEGIN");
    result = await applyMerge(
      client,
      st.master,
      st.sheets ?? {},
      c.proposed_merge.plan,
      c.proposed_merge.comparison,
      u.displayName,
      reference,
    );
    const chain = [
      ...c.events,
      { stage: "commissioner", action: "approved", by: u.displayName, role: u.role, at: new Date().toISOString(), comment },
    ];
    await propertySaveRepository.insertHistory(
      result.holdingNo,
      result.nextVersion,
      "Updated",
      "Merged from bulk upload",
      `${reference}: ${result.summary.fieldsTaken.length} field(s) taken from the upload, ${result.summary.valuesRejected.length} value(s) rejected; proposed by ${c.created_by}, approved by ${u.displayName}`,
      u.displayName,
      {
        mergeFromUpload: {
          upload: { batchId: b.id, dataSource: b.data_source_name, stagedHoldingNo: st.holding_no },
          resolutionId: Number(c.id),
          remarks: c.remarks,
          approvalChain: chain,
          ...result.summary,
          comparison: result.comparison,
          before: result.before,
          after: result.after,
          noticesClosed: result.noticesClosed,
        },
      },
      client,
    );
    await client.query(
      `UPDATE property_import_staging SET status = 'integrated', integrated_at = now(), integrated_by = $2, error = $3, has_blocker = FALSE WHERE id = $1`,
      [c.staging_id, u.displayName, `Merged into the live holding ${result.holdingNo} (resolution no. ${c.id}).`],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  if (result.regenerateStages) {
    try {
      const property = await propertyRepository.findByHoldingNo(result.holdingNo);
      const floors = await propertyRepository.findFloorsByHoldingNo(result.holdingNo);
      if (property) await regenerateAutomaticTaxHistoryStages(result.holdingNo, property, floors, u.displayName);
    } catch (e) {
      console.error("Merged, but the automatic tax history could not be recalculated", e);
    }
  }
  const outcome = `Merged into the live holding ${result.holdingNo}: ${result.summary.fieldsTaken.length} field(s) taken from the upload${result.floorsReplaced ? ", floors replaced" : ""}, ${result.summary.receiptsAdded.length} receipt(s), ${result.summary.noticesAdded.length} notice(s), ${result.summary.stagesAdded.length} tax history row(s) and ${result.summary.historyAppended} history entr(ies) added.`;
  await closeCase(c, u, "approved", "done", "approved", outcome, comment);
  return { status: "approved", outcome: "merged", holdingNo: result.holdingNo, detail: outcome };
}
