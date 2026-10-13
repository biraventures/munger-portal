import type { PoolClient } from "pg";
import { pool } from "../config/db";
import { ApiError } from "../utils/ApiError";
import type { AttendanceTokenPayload } from "../types/attendance.types";
import {
  MOBILE_COURT_OFFICER, checkFineInput, checkGps, cleanPhone, nextNumber, requireMedia, signMediaLink,
  type FineInput,
} from "./enforcementCommon.service";

export const VIOLATION_TYPES = [
  "Littering / throwing waste in the open",
  "Burning of waste",
  "Not segregating waste at source",
  "Dumping of construction & demolition debris",
  "Dumping waste in drains or water bodies",
  "Bulk waste generator not complying",
  "Unauthorised dumping / transport of waste",
  "Spitting / urinating in public",
  "Other",
];

const isOfficer = (a: AttendanceTokenPayload) => MOBILE_COURT_OFFICER.includes(a.role);
const seesOnlyOwn = (a: AttendanceTokenPayload) => a.role === "mobile_court_staff";

async function logEvent(client: PoolClient, caseId: number | string, action: string, detail: string | null, actor: AttendanceTokenPayload) {
  await client.query(`INSERT INTO mobile_court_events (case_id, action, detail, actor_name) VALUES ($1,$2,$3,$4)`, [caseId, action, detail, actor.displayName]);
}

interface CaseRow { id: string; status: string; created_by: string; violator_name: string; violator_phone: string; violator_email: string; violation_type: string; latitude: string; longitude: string }

async function lockCase(client: PoolClient, id: number, actor: AttendanceTokenPayload): Promise<CaseRow> {
  const { rows } = await client.query<CaseRow>(`SELECT * FROM mobile_court_cases WHERE id = $1 FOR UPDATE`, [id]);
  const c = rows[0];
  if (!c) throw ApiError.notFound("Case not found.");
  if (seesOnlyOwn(actor) && c.created_by !== actor.username) throw new ApiError(403, "This case was recorded by someone else.");
  return c;
}

async function tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export interface NewViolationInput {
  violatorName: string; violatorPhone: string; violatorEmail: string; violationType: string; description?: string | null;
  ward?: string | null; locationText: string; latitude: number; longitude: number; evidenceMediaId?: number | null;
}

/** Records a violator and the violation, with GPS and photo evidence. Name, type, phone, email and GPS are all mandatory. */
export async function recordViolation(input: NewViolationInput, actor: AttendanceTokenPayload) {
  const name = (input.violatorName ?? "").trim();
  if (name.length < 2) throw ApiError.badRequest("Enter the violator's name.");
  const phone = cleanPhone(input.violatorPhone ?? "");
  const email = (input.violatorEmail ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw ApiError.badRequest("Enter a valid email address - the fine receipt is sent there.");
  if (!VIOLATION_TYPES.includes(input.violationType)) throw ApiError.badRequest("Choose the type of violation.");
  const location = (input.locationText ?? "").trim();
  if (location.length < 3) throw ApiError.badRequest("Describe the location.");
  const gps = checkGps(input.latitude, input.longitude);
  return tx(async (client) => {
    const evidence = input.evidenceMediaId ? await requireMedia(client, input.evidenceMediaId, "mobile_court", ["photo", "video"], ["violation_evidence"]) : null;
    const caseNo = await nextNumber(client, "MC");
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO mobile_court_cases (case_no, status, violator_name, violator_phone, violator_email, violation_type, description, ward, location_text, latitude, longitude, evidence_media_id, created_by, created_by_name)
       VALUES ($1,'recorded',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [caseNo, name, phone, email, input.violationType, input.description?.trim() || null, input.ward?.trim() || null, location, gps.lat, gps.lng, evidence, actor.username, actor.displayName]);
    await logEvent(client, rows[0]!.id, "recorded", `${input.violationType} at ${location}`, actor);
    return { id: rows[0]!.id, caseNo };
  });
}

export async function listCases(actor: AttendanceTokenPayload, filter: { status?: string; q?: string }) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.status) { params.push(filter.status); where.push(`c.status = $${params.length}`); }
  if (filter.q?.trim()) { params.push(`%${filter.q.trim()}%`); where.push(`(c.case_no ILIKE $${params.length} OR c.violator_name ILIKE $${params.length} OR c.violator_phone ILIKE $${params.length} OR c.location_text ILIKE $${params.length})`); }
  if (seesOnlyOwn(actor)) { params.push(actor.username); where.push(`c.created_by = $${params.length}`); }
  const { rows } = await pool.query(
    `SELECT c.id, c.case_no, c.status, c.violator_name, c.violator_phone, c.violation_type, c.ward, c.location_text, c.created_at,
            (SELECT issued_at + (rectify_within_days || ' days')::interval FROM mobile_court_notices n WHERE n.case_id = c.id ORDER BY n.id DESC LIMIT 1) AS rectify_by,
            (SELECT status FROM enforcement_fines f WHERE f.mobile_court_case_id = c.id) AS fine_status
       FROM mobile_court_cases c ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY c.created_at DESC LIMIT 500`, params);
  return rows;
}

export async function getCase(id: number, actor: AttendanceTokenPayload) {
  const { rows } = await pool.query(`SELECT * FROM mobile_court_cases WHERE id = $1`, [id]);
  const c = rows[0];
  if (!c) throw ApiError.notFound("Case not found.");
  if (seesOnlyOwn(actor) && c.created_by !== actor.username) throw new ApiError(403, "This case was recorded by someone else.");
  const [notices, followups, events, fine, earlier] = await Promise.all([
    pool.query(`SELECT n.*, v.title AS miking_title, v.media_id AS miking_media_id, (n.issued_at + (n.rectify_within_days || ' days')::interval) AS rectify_by
                  FROM mobile_court_notices n LEFT JOIN mobile_court_miking_videos v ON v.id = n.miking_video_id WHERE n.case_id = $1 ORDER BY n.id`, [id]),
    pool.query(`SELECT * FROM mobile_court_followups WHERE case_id = $1 ORDER BY id`, [id]),
    pool.query(`SELECT action, detail, actor_name, at FROM mobile_court_events WHERE case_id = $1 ORDER BY id`, [id]),
    pool.query(`SELECT * FROM enforcement_fines WHERE mobile_court_case_id = $1`, [id]),
    // The same person (by mobile number) in other cases - shows whether this is a repeat offender.
    pool.query(`SELECT id, case_no, status, violation_type, created_at FROM mobile_court_cases WHERE violator_phone = $1 AND id <> $2 ORDER BY created_at DESC LIMIT 20`, [c.violator_phone, id]),
  ]);
  const link = (mid: unknown) => (mid ? signMediaLink(String(mid)).path : null);
  return {
    case: { ...c, evidence_link: link(c.evidence_media_id) },
    notices: notices.rows.map((n) => ({ ...n, miking_link: link(n.miking_media_id) })),
    followups: followups.rows.map((f) => ({ ...f, evidence_link: link(f.evidence_media_id) })),
    events: events.rows,
    fine: fine.rows[0] ?? null,
    otherCases: earlier.rows,
  };
}

/** Notice asking the violator to rectify their behaviour, optionally tied to a miking video kept for the area. */
export function issueNotice(id: number, input: { noticeText: string; rectifyWithinDays: number; mikingVideoId?: number | null }, actor: AttendanceTokenPayload) {
  if (!isOfficer(actor)) throw new ApiError(403, "Only the APSWMO can issue the notice.");
  return tx(async (client) => {
    const c = await lockCase(client, id, actor);
    if (c.status !== "recorded") throw ApiError.badRequest(c.status === "noticed" ? "A notice has already been issued." : "A notice cannot be issued in the present state of this case.");
    const text = (input.noticeText ?? "").trim();
    if (text.length < 10) throw ApiError.badRequest("Write the notice.");
    const days = Number(input.rectifyWithinDays);
    if (!Number.isInteger(days) || days < 1 || days > 90) throw ApiError.badRequest("Give a time to rectify between 1 and 90 days.");
    let video: number | null = null;
    if (input.mikingVideoId) {
      const v = await client.query(`SELECT id FROM mobile_court_miking_videos WHERE id = $1`, [input.mikingVideoId]);
      if (!v.rows[0]) throw ApiError.badRequest("The chosen miking video was not found.");
      video = Number(input.mikingVideoId);
    }
    await client.query(`INSERT INTO mobile_court_notices (case_id, notice_text, rectify_within_days, miking_video_id, issued_by_name) VALUES ($1,$2,$3,$4,$5)`, [id, text, days, video, actor.displayName]);
    await client.query(`UPDATE mobile_court_cases SET status = 'noticed' WHERE id = $1`, [id]);
    await logEvent(client, id, "notice_issued", `Notice to rectify within ${days} day(s)${video ? " (miking video attached)" : ""}`, actor);
  }).then(() => getCase(id, actor));
}

/** Re-inspection after the notice: the violator complied, or violated again - the latter is what permits a fine. */
export function recordFollowup(id: number, input: { outcome: string; remarks?: string; evidenceMediaId?: number | null; latitude?: number; longitude?: number }, actor: AttendanceTokenPayload) {
  return tx(async (client) => {
    const c = await lockCase(client, id, actor);
    if (c.status !== "noticed") throw ApiError.badRequest("A re-inspection can be recorded only after a notice has been issued, and only once.");
    if (input.outcome !== "complied" && input.outcome !== "violated_again") throw ApiError.badRequest("Choose whether the violator complied or violated again.");
    const due = await client.query<{ over: boolean }>(`SELECT (issued_at + (rectify_within_days || ' days')::interval) <= now() AS over FROM mobile_court_notices WHERE case_id = $1 ORDER BY id DESC LIMIT 1`, [id]);
    if (input.outcome === "violated_again" && !due.rows[0]?.over) throw ApiError.badRequest("The time given to rectify has not ended yet.");
    const remarks = input.remarks?.trim() || null;
    if (input.outcome === "violated_again" && !input.evidenceMediaId) throw ApiError.badRequest("Upload a photo or video showing the repeat violation.");
    if (input.outcome === "violated_again" && (!remarks || remarks.length < 5)) throw ApiError.badRequest("Describe the repeat violation.");
    const gps = input.outcome === "violated_again" ? checkGps(input.latitude, input.longitude) : null;
    const media = input.evidenceMediaId ? await requireMedia(client, input.evidenceMediaId, "mobile_court", ["photo", "video"], ["followup_evidence"]) : null;
    await client.query(
      `INSERT INTO mobile_court_followups (case_id, outcome, remarks, evidence_media_id, latitude, longitude, recorded_by_name) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, input.outcome, remarks, media, gps?.lat ?? null, gps?.lng ?? null, actor.displayName]);
    await client.query(`UPDATE mobile_court_cases SET status = $2 WHERE id = $1`, [id, input.outcome === "complied" ? "complied" : "violated_again"]);
    await logEvent(client, id, input.outcome === "complied" ? "complied" : "violated_again", remarks, actor);
  }).then(() => getCase(id, actor));
}

/** Fine - only for someone who was served a notice and then violated again. Amount and Act / section are entered by the APSWMO. */
export function imposeFine(id: number, input: FineInput, actor: AttendanceTokenPayload) {
  if (!isOfficer(actor)) throw new ApiError(403, "Only the APSWMO can impose a fine.");
  const fine = checkFineInput(input);
  return tx(async (client) => {
    const c = await lockCase(client, id, actor);
    if (c.status !== "violated_again") throw ApiError.badRequest("A fine can be imposed only after a notice was issued and the violator was found violating again.");
    if (!fine.email && !c.violator_email) throw ApiError.badRequest("An email address is required.");
    const fineNo = await nextNumber(client, "FINE-M");
    await client.query(
      `INSERT INTO enforcement_fines (fine_no, module, mobile_court_case_id, payer_name, payer_phone, payer_email, violation_type, latitude, longitude, amount, legal_basis, reason, imposed_by_name)
       VALUES ($1,'mobile_court',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [fineNo, id, c.violator_name, c.violator_phone, fine.email ?? c.violator_email, c.violation_type, c.latitude, c.longitude, fine.amount, fine.legalBasis, fine.reason, actor.displayName]);
    await client.query(`UPDATE mobile_court_cases SET status = 'fined' WHERE id = $1`, [id]);
    await logEvent(client, id, "fine_imposed", `${fineNo}: Rs ${fine.amount} under ${fine.legalBasis}`, actor);
  }).then(() => getCase(id, actor));
}

export async function closeCase(id: number, actor: AttendanceTokenPayload) {
  if (!isOfficer(actor)) throw new ApiError(403, "Only the APSWMO can close a case.");
  await tx(async (client) => {
    const c = await lockCase(client, id, actor);
    if (c.status === "closed") throw ApiError.badRequest("Already closed.");
    if (c.status === "fined") {
      const f = await client.query<{ status: string }>(`SELECT status FROM enforcement_fines WHERE mobile_court_case_id = $1`, [id]);
      if (f.rows[0]?.status !== "paid") throw ApiError.badRequest("The fine is not paid yet.");
    } else if (c.status !== "complied") {
      throw ApiError.badRequest("A case is closed after the violator complies, or after the fine is paid.");
    }
    await client.query(`UPDATE mobile_court_cases SET status = 'closed' WHERE id = $1`, [id]);
    await logEvent(client, id, "closed", null, actor);
  });
  return getCase(id, actor);
}

// ------------------------------------------------------------------ miking videos kept for notices

export async function addMikingVideo(input: { title: string; areaText: string; ward?: string | null; recordedOn: string; messageText?: string | null; mediaId: number }, actor: AttendanceTokenPayload) {
  const title = (input.title ?? "").trim();
  const area = (input.areaText ?? "").trim();
  if (title.length < 3) throw ApiError.badRequest("Give the video a title.");
  if (area.length < 3) throw ApiError.badRequest("Say which area was covered.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.recordedOn ?? "") || Number.isNaN(Date.parse(input.recordedOn))) throw ApiError.badRequest("Enter the date of the miking.");
  return tx(async (client) => {
    const media = await requireMedia(client, input.mediaId, "mobile_court", ["video"], ["miking_video"]);
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO mobile_court_miking_videos (title, area_text, ward, recorded_on, message_text, media_id, uploaded_by_name) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [title, area, input.ward?.trim() || null, input.recordedOn, input.messageText?.trim() || null, media, actor.displayName]);
    return { id: rows[0]!.id };
  });
}

export async function listMikingVideos() {
  const { rows } = await pool.query(`SELECT id, title, area_text, ward, recorded_on, message_text, media_id, uploaded_by_name, uploaded_at FROM mobile_court_miking_videos ORDER BY recorded_on DESC, id DESC LIMIT 300`);
  return rows.map((r) => ({ ...r, link: signMediaLink(String(r.media_id)).path }));
}
