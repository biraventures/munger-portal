import type { PoolClient } from "pg";
import { pool } from "../config/db";
import { ApiError } from "../utils/ApiError";
import type { AttendanceTokenPayload } from "../types/attendance.types";
import {
  ENCROACHMENT_OFFICER, checkFineInput, checkGps, cleanPhone, nextNumber, requireMedia, signMediaLink,
  type FineInput,
} from "./enforcementCommon.service";

const isOfficer = (a: AttendanceTokenPayload) => ENCROACHMENT_OFFICER.includes(a.role);
/** Field staff see only the cases they registered; the officer and the Commissioner / DMC see all. */
const seesOnlyOwn = (a: AttendanceTokenPayload) => a.role === "encroachment_staff";

async function logEvent(client: PoolClient, caseId: number | string, action: string, detail: string | null, actor: AttendanceTokenPayload) {
  await client.query(`INSERT INTO encroachment_events (case_id, action, detail, actor_name) VALUES ($1,$2,$3,$4)`, [caseId, action, detail, actor.displayName]);
}

interface CaseRow {
  id: string; case_no: string; kind: "temporary" | "permanent"; status: string; created_by: string;
  ward: string | null; encroacher_name: string; encroacher_phone: string; latitude: string; longitude: string;
  removed_at: Date | null;
}

async function lockCase(client: PoolClient, id: number, actor: AttendanceTokenPayload): Promise<CaseRow> {
  const { rows } = await client.query<CaseRow>(`SELECT * FROM encroachment_cases WHERE id = $1 FOR UPDATE`, [id]);
  const c = rows[0];
  if (!c) throw ApiError.notFound("Case not found.");
  if (seesOnlyOwn(actor) && c.created_by !== actor.username) throw new ApiError(403, "This case was registered by someone else.");
  return c;
}

export interface NewCaseInput {
  kind: string; ward?: string | null; locationText: string; description: string;
  latitude: number; longitude: number; encroacherName: string; encroacherPhone: string;
  encroacherAddress?: string | null; photoMediaId?: number | null;
}

export async function createCase(input: NewCaseInput, actor: AttendanceTokenPayload) {
  if (input.kind !== "temporary" && input.kind !== "permanent") throw ApiError.badRequest("Choose temporary or permanent encroachment.");
  const name = (input.encroacherName ?? "").trim();
  if (name.length < 2) throw ApiError.badRequest("Enter the name of the encroacher.");
  const phone = cleanPhone(input.encroacherPhone ?? "");
  const gps = checkGps(input.latitude, input.longitude);
  const location = (input.locationText ?? "").trim();
  const description = (input.description ?? "").trim();
  if (location.length < 3) throw ApiError.badRequest("Describe the location of the encroachment.");
  if (description.length < 3) throw ApiError.badRequest("Describe the encroachment.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const photoId = input.photoMediaId ? await requireMedia(client, input.photoMediaId, "encroachment", ["photo"], ["encroachment_photo"]) : null;
    const caseNo = await nextNumber(client, input.kind === "temporary" ? "ENC-T" : "ENC-P");
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO encroachment_cases (case_no, kind, status, ward, location_text, description, latitude, longitude,
         encroacher_name, encroacher_phone, encroacher_address, photo_media_id, created_by, created_by_name)
       VALUES ($1,$2,'registered',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [caseNo, input.kind, input.ward?.trim() || null, location, description, gps.lat, gps.lng, name, phone,
       input.encroacherAddress?.trim() || null, photoId, actor.username, actor.displayName]);
    await logEvent(client, rows[0]!.id, "registered", `${input.kind === "temporary" ? "Temporary" : "Permanent"} encroachment marked at ${location}`, actor);
    await client.query("COMMIT");
    return { id: rows[0]!.id, caseNo };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export async function listCases(actor: AttendanceTokenPayload, filter: { kind?: string; status?: string; q?: string }) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.kind === "temporary" || filter.kind === "permanent") { params.push(filter.kind); where.push(`c.kind = $${params.length}`); }
  if (filter.status) { params.push(filter.status); where.push(`c.status = $${params.length}`); }
  if (filter.q?.trim()) { params.push(`%${filter.q.trim()}%`); where.push(`(c.case_no ILIKE $${params.length} OR c.encroacher_name ILIKE $${params.length} OR c.encroacher_phone ILIKE $${params.length} OR c.location_text ILIKE $${params.length})`); }
  if (seesOnlyOwn(actor)) { params.push(actor.username); where.push(`c.created_by = $${params.length}`); }
  const { rows } = await pool.query(
    `SELECT c.id, c.case_no, c.kind, c.status, c.ward, c.location_text, c.encroacher_name, c.encroacher_phone, c.created_at,
            (SELECT deadline_at FROM encroachment_notices n WHERE n.case_id = c.id AND n.notice_type = 'temporary_24h' ORDER BY n.id DESC LIMIT 1) AS deadline_at,
            (SELECT status FROM enforcement_fines f WHERE f.encroachment_case_id = c.id) AS fine_status
       FROM encroachment_cases c ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY c.created_at DESC LIMIT 500`, params);
  return rows;
}

export async function getCase(id: number, actor: AttendanceTokenPayload) {
  const { rows } = await pool.query(`SELECT * FROM encroachment_cases WHERE id = $1`, [id]);
  const c = rows[0];
  if (!c) throw ApiError.notFound("Case not found.");
  if (seesOnlyOwn(actor) && c.created_by !== actor.username) throw new ApiError(403, "This case was registered by someone else.");
  const [notices, orders, finalOrder, events, fine] = await Promise.all([
    pool.query(`SELECT * FROM encroachment_notices WHERE case_id = $1 ORDER BY id`, [id]),
    pool.query(`SELECT * FROM encroachment_measurement_orders WHERE case_id = $1 ORDER BY id`, [id]),
    pool.query(`SELECT * FROM encroachment_final_orders WHERE case_id = $1`, [id]),
    pool.query(`SELECT action, detail, actor_name, at FROM encroachment_events WHERE case_id = $1 ORDER BY id`, [id]),
    pool.query(`SELECT * FROM enforcement_fines WHERE encroachment_case_id = $1`, [id]),
  ]);
  // Links for every file attached to this case (short-lived, signed).
  const link = (mid: unknown) => (mid ? signMediaLink(String(mid)).path : null);
  return {
    case: { ...c, photo_link: link(c.photo_media_id), removal_link: link(c.removal_media_id) },
    notices: notices.rows.map((n) => ({ ...n, proof_link: link(n.proof_media_id) })),
    measurementOrders: orders.rows.map((o) => ({ ...o, report_link: link(o.report_media_id) })),
    finalOrder: finalOrder.rows[0] ?? null,
    events: events.rows,
    fine: fine.rows[0] ?? null,
  };
}

/** TEMPORARY: serve the 24-hour notice. Proof is a photo of the notice OR a video of miking in the area. */
export async function serveTemporaryNotice(id: number, input: { proofMode: string; proofMediaId: number; noticeText?: string }, actor: AttendanceTokenPayload) {
  if (input.proofMode !== "notice_photo" && input.proofMode !== "miking_video") throw ApiError.badRequest("Proof must be a photo of the notice or a video of miking.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const c = await lockCase(client, id, actor);
    if (c.kind !== "temporary") throw ApiError.badRequest("A 24-hour notice applies to temporary encroachments only.");
    if (c.status !== "registered") throw ApiError.badRequest("The notice has already been served for this case.");
    const mediaId = input.proofMode === "notice_photo"
      ? await requireMedia(client, input.proofMediaId, "encroachment", ["photo"], ["notice_photo"])
      : await requireMedia(client, input.proofMediaId, "encroachment", ["video"], ["miking_video"]);
    await client.query(
      `INSERT INTO encroachment_notices (case_id, notice_type, notice_text, proof_mode, proof_media_id, issued_by_name, issued_at, served_at, served_by_name, deadline_at)
       VALUES ($1,'temporary_24h',$2,$3,$4,$5, now(), now(), $5, now() + interval '24 hours')`,
      [id, input.noticeText?.trim() || null, input.proofMode, mediaId, actor.displayName]);
    await client.query(`UPDATE encroachment_cases SET status = 'notice_served' WHERE id = $1`, [id]);
    await logEvent(client, id, "notice_served", `24-hour notice served (${input.proofMode === "notice_photo" ? "photo of notice" : "video of miking"}); removal due within 24 hours`, actor);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
  return getCase(id, actor);
}

/** The encroachment was removed (temporary: after the notice; permanent: after the final order). */
export async function markRemoved(id: number, input: { remarks?: string; photoMediaId?: number | null }, actor: AttendanceTokenPayload) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const c = await lockCase(client, id, actor);
    const okStatus = c.kind === "temporary" ? c.status === "notice_served" : c.status === "order_passed";
    if (!okStatus) throw ApiError.badRequest(c.kind === "temporary" ? "Removal can be recorded only after the 24-hour notice has been served." : "Removal can be recorded only after the final order is passed.");
    if (c.kind === "permanent") {
      const fo = await client.query<{ decision: string }>(`SELECT decision FROM encroachment_final_orders WHERE case_id = $1`, [id]);
      if (fo.rows[0]?.decision === "no_action") throw ApiError.badRequest("The final order took no action, so there is nothing to remove.");
    }
    const photo = input.photoMediaId ? await requireMedia(client, input.photoMediaId, "encroachment", ["photo"], ["removal_photo"]) : null;
    await client.query(
      `UPDATE encroachment_cases SET status = 'removed', removed_at = now(), removal_media_id = $2, removal_remarks = $3 WHERE id = $1`,
      [id, photo, input.remarks?.trim() || null]);
    await logEvent(client, id, "removed", input.remarks?.trim() || "Encroachment removed", actor);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
  return getCase(id, actor);
}

/**
 * FINE. Temporary: only after the 24 hours have run out with the encroachment still there.
 * Permanent: only after the City Manager's final order (and not when that order took no action).
 * The officer enters the amount and the Act / section each time.
 */
export async function imposeFine(id: number, input: FineInput, actor: AttendanceTokenPayload) {
  if (!isOfficer(actor)) throw new ApiError(403, "Only the City Manager can impose a fine.");
  const fine = checkFineInput(input);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const c = await lockCase(client, id, actor);
    const full = (await client.query(`SELECT * FROM encroachment_cases WHERE id = $1`, [id])).rows[0];
    const existing = await client.query(`SELECT 1 FROM enforcement_fines WHERE encroachment_case_id = $1`, [id]);
    if (existing.rows.length) throw ApiError.badRequest("A fine has already been imposed on this case.");
    let violation: string;
    if (c.kind === "temporary") {
      if (c.status !== "notice_served") throw ApiError.badRequest(c.status === "registered" ? "Serve the 24-hour notice first." : "A fine cannot be imposed on this case in its present state.");
      const n = await client.query<{ expired: boolean }>(
        `SELECT (deadline_at <= now()) AS expired FROM encroachment_notices WHERE case_id = $1 AND notice_type = 'temporary_24h' ORDER BY id DESC LIMIT 1`, [id]);
      if (!n.rows[0]?.expired) throw ApiError.badRequest("The 24-hour notice period has not ended yet - a fine can be imposed only after it, if the encroachment is not removed.");
      violation = "Temporary encroachment not removed within 24 hours of notice";
    } else {
      const fo = await client.query<{ decision: string }>(`SELECT decision FROM encroachment_final_orders WHERE case_id = $1`, [id]);
      if (!["order_passed", "removed"].includes(c.status) || !fo.rows[0]) throw ApiError.badRequest("A fine on a permanent encroachment follows the City Manager's final order.");
      if (fo.rows[0].decision === "no_action") throw ApiError.badRequest("The final order took no action, so no fine can be imposed.");
      violation = "Permanent encroachment";
    }
    const fineNo = await nextNumber(client, "FINE-E");
    await client.query(
      `INSERT INTO enforcement_fines (fine_no, module, encroachment_case_id, payer_name, payer_phone, payer_email, violation_type, latitude, longitude, amount, legal_basis, reason, imposed_by_name)
       VALUES ($1,'encroachment',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [fineNo, id, full.encroacher_name, full.encroacher_phone, fine.email, violation, full.latitude, full.longitude, fine.amount, fine.legalBasis, fine.reason, actor.displayName]);
    if (c.kind === "temporary") await client.query(`UPDATE encroachment_cases SET status = 'fine_imposed' WHERE id = $1`, [id]);
    await logEvent(client, id, "fine_imposed", `${fineNo}: Rs ${fine.amount} under ${fine.legalBasis}`, actor);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
  return getCase(id, actor);
}

// ------------------------------------------------------------------ permanent encroachment case management

/** Recomputes a permanent case's stage from what is on file. */
async function recomputePermanent(client: PoolClient, id: number) {
  const q = async (sql: string) => (await client.query(sql, [id])).rows;
  const [fin, notices, orders] = await Promise.all([
    q(`SELECT 1 FROM encroachment_final_orders WHERE case_id = $1`),
    q(`SELECT served_at FROM encroachment_notices WHERE case_id = $1 AND notice_type = 'permanent'`),
    q(`SELECT report_received_at FROM encroachment_measurement_orders WHERE case_id = $1`),
  ]);
  const cur = (await q(`SELECT status FROM encroachment_cases WHERE id = $1`))[0]!.status as string;
  if (["removed", "closed", "fine_imposed"].includes(cur)) return;
  const served = notices.some((n) => n.served_at);
  const issued = notices.length > 0;
  const reportIn = orders.some((o) => o.report_received_at);
  const orderOut = orders.length > 0;
  let status = "registered";
  if (fin.length) status = "order_passed";
  else if (served && reportIn) status = "ready_for_order";
  else if (orderOut && !reportIn) status = "measurement_pending";
  else if (served) status = "notice_served";
  else if (issued) status = "notice_issued";
  await client.query(`UPDATE encroachment_cases SET status = $2 WHERE id = $1`, [id, status]);
}

async function permanentStep<T>(id: number, actor: AttendanceTokenPayload, body: (client: PoolClient, c: CaseRow) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const c = await lockCase(client, id, actor);
    if (c.kind !== "permanent") throw ApiError.badRequest("This step applies to permanent encroachment cases only.");
    if (["removed", "closed"].includes(c.status)) throw ApiError.badRequest("This case is closed.");
    await body(client, c);
    await recomputePermanent(client, id);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
  return getCase(id, actor);
}

/** The notice to the encroacher, prepared for the City Manager's signature (printable from the case page). */
export function issuePermanentNotice(id: number, input: { noticeText: string }, actor: AttendanceTokenPayload) {
  if (!isOfficer(actor)) throw new ApiError(403, "Only the City Manager can issue the notice.");
  return permanentStep(id, actor, async (client, c) => {
    if (c.status === "order_passed") throw ApiError.badRequest("The final order has already been passed.");
    const text = (input.noticeText ?? "").trim();
    if (text.length < 20) throw ApiError.badRequest("Write the notice text (what is alleged, the law relied on, and the time given to respond).");
    const dup = await client.query(`SELECT 1 FROM encroachment_notices WHERE case_id = $1 AND notice_type = 'permanent'`, [id]);
    if (dup.rows.length) throw ApiError.badRequest("A notice has already been issued for this case.");
    await client.query(
      `INSERT INTO encroachment_notices (case_id, notice_type, notice_text, issued_by_name) VALUES ($1,'permanent',$2,$3)`, [id, text, actor.displayName]);
    await logEvent(client, id, "notice_issued", "Notice prepared for the City Manager's signature", actor);
  });
}

/** The signed notice has been served on the encroacher; the proof is a photo of the signed copy. */
export function markPermanentNoticeServed(id: number, input: { signedCopyMediaId: number }, actor: AttendanceTokenPayload) {
  return permanentStep(id, actor, async (client) => {
    const n = await client.query<{ id: string; served_at: Date | null }>(`SELECT id, served_at FROM encroachment_notices WHERE case_id = $1 AND notice_type = 'permanent' FOR UPDATE`, [id]);
    if (!n.rows[0]) throw ApiError.badRequest("The notice has not been issued yet.");
    if (n.rows[0].served_at) throw ApiError.badRequest("The notice is already marked as served.");
    const media = await requireMedia(client, input.signedCopyMediaId, "encroachment", ["photo", "document"], ["signed_notice"]);
    await client.query(`UPDATE encroachment_notices SET served_at = now(), served_by_name = $2, proof_mode = 'signed_copy', proof_media_id = $3 WHERE id = $1`, [n.rows[0].id, actor.displayName, media]);
    await logEvent(client, id, "notice_served", "Signed notice served on the encroacher", actor);
  });
}

/** Office order asking the Amin for a measurement report. */
export function issueMeasurementOrder(id: number, input: { aminName: string; orderText: string; dueDate?: string | null }, actor: AttendanceTokenPayload) {
  if (!isOfficer(actor)) throw new ApiError(403, "Only the City Manager can issue the office order.");
  return permanentStep(id, actor, async (client) => {
    const amin = (input.aminName ?? "").trim();
    const text = (input.orderText ?? "").trim();
    if (amin.length < 2) throw ApiError.badRequest("Enter the Amin's name.");
    if (text.length < 10) throw ApiError.badRequest("Write the office order.");
    let due: string | null = null;
    if (input.dueDate?.trim()) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate.trim())) throw ApiError.badRequest("The due date is not valid.");
      due = input.dueDate.trim();
    }
    const open = await client.query(`SELECT 1 FROM encroachment_measurement_orders WHERE case_id = $1 AND report_received_at IS NULL`, [id]);
    if (open.rows.length) throw ApiError.badRequest("A measurement report is already awaited from the Amin.");
    if ((await client.query(`SELECT 1 FROM encroachment_final_orders WHERE case_id = $1`, [id])).rows.length) throw ApiError.badRequest("The final order has already been passed.");
    await client.query(`INSERT INTO encroachment_measurement_orders (case_id, amin_name, order_text, due_date, issued_by_name) VALUES ($1,$2,$3,$4,$5)`, [id, amin, text, due, actor.displayName]);
    await logEvent(client, id, "measurement_ordered", `Office order to Amin ${amin} for a measurement report`, actor);
  });
}

/** The Amin's report has come in - enter its findings and attach the report. */
export function recordMeasurementReport(id: number, input: { reportText: string; reportMediaId?: number | null }, actor: AttendanceTokenPayload) {
  return permanentStep(id, actor, async (client) => {
    const o = await client.query<{ id: string }>(`SELECT id FROM encroachment_measurement_orders WHERE case_id = $1 AND report_received_at IS NULL ORDER BY id DESC LIMIT 1 FOR UPDATE`, [id]);
    if (!o.rows[0]) throw ApiError.badRequest("No measurement report is awaited - issue the office order to the Amin first.");
    const text = (input.reportText ?? "").trim();
    if (text.length < 10) throw ApiError.badRequest("Enter the findings of the measurement report.");
    const media = input.reportMediaId ? await requireMedia(client, input.reportMediaId, "encroachment", ["photo", "document"], ["measurement_report"]) : null;
    await client.query(`UPDATE encroachment_measurement_orders SET report_text = $2, report_media_id = $3, report_received_at = now(), report_recorded_by = $4 WHERE id = $1`, [o.rows[0].id, text, media, actor.displayName]);
    await logEvent(client, id, "measurement_received", "Amin's measurement report received", actor);
  });
}

/** The City Manager's final order - possible only once the notice is served AND the Amin's report is in. */
export function passFinalOrder(id: number, input: { decision: string; orderText: string; orderDate: string }, actor: AttendanceTokenPayload) {
  if (!isOfficer(actor)) throw new ApiError(403, "Only the City Manager can pass the final order.");
  return permanentStep(id, actor, async (client, c) => {
    if (c.status !== "ready_for_order") throw ApiError.badRequest("The final order can be passed only after the notice is served and the Amin's measurement report is received.");
    if (!["removal", "no_action", "other"].includes(input.decision)) throw ApiError.badRequest("Choose the decision.");
    const text = (input.orderText ?? "").trim();
    if (text.length < 20) throw ApiError.badRequest("Write the order, with the reasons for the decision.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.orderDate ?? "") || Number.isNaN(Date.parse(input.orderDate))) throw ApiError.badRequest("The order date is not valid.");
    await client.query(`INSERT INTO encroachment_final_orders (case_id, decision, order_text, order_date, passed_by_name) VALUES ($1,$2,$3,$4,$5)`, [id, input.decision, text, input.orderDate, actor.displayName]);
    await logEvent(client, id, "order_passed", `Final order: ${input.decision === "removal" ? "removal" : input.decision === "no_action" ? "no action" : "other"}`, actor);
    if (input.decision === "no_action") await client.query(`UPDATE encroachment_cases SET status = 'closed' WHERE id = $1`, [id]);
  });
}
