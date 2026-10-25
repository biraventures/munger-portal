import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pool } from "../config/db";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import { istDateString } from "../utils/istDate";
import { fieldStaffRepository } from "../repositories/fieldStaff.repository";
import { fieldStaffAttendanceRepository } from "../repositories/fieldStaffAttendance.repository";
import { markStaffIn, markStaffOut } from "./fieldStaffAttendance.service";
import { addExample, deleteSubject, recognizeTop, verifyAgainst, type FaceResult } from "./compreface";
import type { AttendanceRole, AttendanceTokenPayload } from "../types/attendance.types";

/**
 * Face-verified attendance for Safai field staff.
 *
 * Marking: the Jamadar (own ward), Sanitation Prabhari or APSWMO selects the worker and photographs them twice -
 * once looking straight, once with the head turned the way the server asked (random left/right, single-use,
 * 2-minute challenge). Both photos must match the worker's enrolled face 1:1, and the head must actually have
 * turned: a held-up photo or a phone screen showing a still picture cannot do that on demand.
 *
 * Enrolment: by Sanitation Prabhari / APSWMO / Sanitation Officer / Attendance Admin only - not the Jamadar who
 * marks the same worker every day - with the same liveness check, a recorded consent, and a check that the face is
 * not already enrolled as a different worker.
 *
 * An enrolled worker can still be marked by hand (face server down, injury, poor light), but only with a written
 * reason; those marks are flagged for officer review. Workers not yet enrolled are marked by hand as before.
 */

export const FACE_MARK_ROLES: AttendanceRole[] = ["jamadar", "sanitation_prabhari", "apswmo", "attendance_admin"];
export const FACE_ENROL_ROLES: AttendanceRole[] = ["sanitation_prabhari", "apswmo", "sanitation_officer", "attendance_admin"];
export const FACE_REVIEW_ROLES: AttendanceRole[] = ["sanitation_officer", "sanitation_prabhari", "apswmo", "attendance_admin"];

const CHALLENGE_TTL_MS = 2 * 60 * 1000;
const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;

export function faceConfig() {
  return { enabled: env.FACE_ATTENDANCE_ENABLED };
}

function assertEnabled(): void {
  if (!env.FACE_ATTENDANCE_ENABLED) throw ApiError.badRequest("Face attendance is not switched on.");
}

interface EnrolmentRow {
  id: string;
  staff_id: string;
  subject: string;
  image_ids: string[];
  photo_path: string | null;
  enrolled_by_username: string;
  enrolled_at: Date;
}

async function activeEnrolment(staffId: number): Promise<EnrolmentRow | null> {
  const { rows } = await pool.query<EnrolmentRow>(`SELECT * FROM face_enrolments WHERE staff_id = $1 AND active`, [staffId]);
  return rows[0] ?? null;
}

/** Ids of workers (of a ward, or all) with an active face enrolment. */
export async function enrolledStaffIds(wardId?: number): Promise<Set<number>> {
  const { rows } = await pool.query<{ staff_id: string }>(
    `SELECT e.staff_id FROM face_enrolments e JOIN field_staff s ON s.id = e.staff_id
      WHERE e.active AND ($1::bigint IS NULL OR s.ward_id = $1)`,
    [wardId ?? null],
  );
  return new Set(rows.map((r) => Number(r.staff_id)));
}

async function loadStaff(user: AttendanceTokenPayload, staffId: number) {
  const staff = await fieldStaffRepository.findById(staffId);
  if (!staff || !staff.active) throw ApiError.notFound("Worker not found.");
  if (user.role === "jamadar" && Number(user.wardId) !== Number(staff.ward_id)) throw ApiError.badRequest("This worker is not in your ward.");
  return staff;
}

function decodeImage(b64: string, label: string): Buffer {
  const clean = b64.replace(/^data:image\/[a-z]+;base64,/, "");
  const buf = Buffer.from(clean, "base64");
  if (buf.length < 2000) throw ApiError.badRequest(`The ${label} photo is empty or too small. Take it again.`);
  if (buf.length > MAX_IMAGE_BYTES) throw ApiError.badRequest(`The ${label} photo is too large.`);
  if (buf[0] !== 0xff || buf[1] !== 0xd8) throw ApiError.badRequest(`The ${label} photo must be a JPEG from the camera.`);
  return buf;
}

async function savePhoto(kind: "punch" | "enrol", staffId: number, buf: Buffer): Promise<string> {
  const day = istDateString();
  const rel = path.join("face", kind, day, `${staffId}-${Date.now()}-${crypto.randomBytes(3).toString("hex")}.jpg`);
  const full = path.join(env.PHOTO_UPLOAD_DIR, rel);
  await fs.promises.mkdir(path.dirname(full), { recursive: true });
  await fs.promises.writeFile(full, buf);
  return rel;
}

export async function readPhotoDataUrl(rel: string | null): Promise<string | null> {
  if (!rel) return null;
  const root = path.resolve(env.PHOTO_UPLOAD_DIR);
  const full = path.resolve(root, rel);
  if (!full.startsWith(root + path.sep)) return null;
  try {
    return `data:image/jpeg;base64,${(await fs.promises.readFile(full)).toString("base64")}`;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------- challenge

export async function createChallenge(user: AttendanceTokenPayload, staffId: number, purpose: "in" | "out" | "enrol") {
  assertEnabled();
  if (purpose === "enrol" ? !FACE_ENROL_ROLES.includes(user.role) : !FACE_MARK_ROLES.includes(user.role)) {
    throw new ApiError(403, purpose === "enrol" ? "Your login cannot enrol faces." : "Your login cannot mark face attendance.");
  }
  const staff = await loadStaff(user, staffId);
  if (purpose !== "enrol") {
    if (!(await activeEnrolment(staffId))) throw ApiError.badRequest("This worker's face is not enrolled yet. Mark manually, and ask the Prabhari/APSWMO to enrol the face.");
    // Fail early (before taking photos) when the mark itself would be refused.
    const rec = await fieldStaffAttendanceRepository.findForStaffOnDate(staffId, istDateString());
    if (purpose === "in" && rec) throw ApiError.badRequest("Attendance already marked for today.");
    if (purpose === "out" && !rec) throw ApiError.badRequest("Mark in-time first.");
    if (purpose === "out" && rec?.out_time) throw ApiError.badRequest("Out-time already marked.");
    if (staff.suspended && purpose === "in") throw ApiError.badRequest("This worker is suspended - attendance cannot be marked.");
  }
  const id = crypto.randomUUID();
  const direction = crypto.randomInt(0, 2) === 0 ? "left" : "right";
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
  await pool.query(
    `INSERT INTO face_challenges (id, username, staff_id, purpose, direction, expires_at) VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, user.username, staffId, purpose, direction, expiresAt],
  );
  return { challengeId: id, direction, expiresAt: expiresAt.toISOString(), staffName: staff.name };
}

async function claimChallenge(user: AttendanceTokenPayload, challengeId: string, purpose: "punch" | "enrol") {
  const { rows } = await pool.query<{ staff_id: string; purpose: "in" | "out" | "enrol"; direction: "left" | "right" }>(
    `UPDATE face_challenges SET used_at = now()
      WHERE id = $1 AND username = $2 AND used_at IS NULL AND expires_at > now()
        AND (CASE WHEN $3 = 'enrol' THEN purpose = 'enrol' ELSE purpose IN ('in', 'out') END)
      RETURNING staff_id, purpose, direction`,
    [challengeId, user.username, purpose],
  );
  if (!rows[0]) throw ApiError.badRequest("This photo session has expired or was already used. Start again.");
  return { staffId: Number(rows[0].staff_id), action: rows[0].purpose, direction: rows[0].direction };
}

// ---------------------------------------------------------------------------------------------- liveness

interface LivenessOutcome {
  ok: boolean;
  reason: string | null;
  similarityFront: number | null;
  similarityTurn: number | null;
  yawFront: number | null;
  yawTurn: number | null;
}

function single(faces: FaceResult[], label: string): FaceResult | string {
  if (faces.length === 0) return `No face found in the ${label} photo.`;
  if (faces.length > 1) return `More than one face in the ${label} photo - only the worker should be in the frame.`;
  const f = faces[0]!;
  if (f.yaw == null) {
    console.error("[face] CompreFace reply has no pose - enable the 'pose' face plugin (see FACE_ATTENDANCE_SETUP.md)");
    return "Face server is missing the head-pose plugin - inform the Attendance Admin.";
  }
  return f;
}

/** Judges a straight + turned photo pair already matched against an example. */
function judge(front: FaceResult, turn: FaceResult, direction: "left" | "right", requireMatch: boolean): LivenessOutcome {
  const out: LivenessOutcome = {
    ok: false,
    reason: null,
    similarityFront: front.similarity,
    similarityTurn: turn.similarity,
    yawFront: front.yaw,
    yawTurn: turn.yaw,
  };
  const yf = front.yaw ?? 0;
  const yt = turn.yaw ?? 0;
  if (requireMatch && (front.similarity ?? 0) < env.FACE_MATCH_THRESHOLD) out.reason = "Face does not match the enrolled worker.";
  else if (requireMatch && (turn.similarity ?? 0) < env.FACE_MATCH_THRESHOLD_TURNED) out.reason = "Head-turned photo does not match the enrolled worker.";
  else if (Math.abs(yf) > env.FACE_FRONT_MAX_YAW) out.reason = "In the first photo the worker must look straight at the camera.";
  else if (Math.abs(yt - yf) < env.FACE_TURN_MIN_YAW) out.reason = `Head was not turned ${direction} enough in the second photo (liveness check).`;
  else if (env.FACE_YAW_SIGN !== 0 && Math.sign(yt - yf) * env.FACE_YAW_SIGN !== (direction === "left" ? 1 : -1)) {
    out.reason = `Head was turned the wrong way - the worker had to turn ${direction} (liveness check).`;
  } else out.ok = true;
  return out;
}

// ---------------------------------------------------------------------------------------------- punch

export async function facePunch(user: AttendanceTokenPayload, challengeId: string, frontB64: string, turnB64: string) {
  assertEnabled();
  const front = decodeImage(frontB64, "first");
  const turn = decodeImage(turnB64, "second");
  const ch = await claimChallenge(user, challengeId, "punch");
  const action = ch.action as "in" | "out";
  const staff = await loadStaff(user, ch.staffId);
  const enrol = await activeEnrolment(ch.staffId);
  if (!enrol) throw ApiError.badRequest("This worker's face is not enrolled.");

  let verdict: LivenessOutcome;
  if (crypto.createHash("sha256").update(front).digest("hex") === crypto.createHash("sha256").update(turn).digest("hex")) {
    verdict = { ok: false, reason: "The two photos are identical - take a fresh second photo with the head turned.", similarityFront: null, similarityTurn: null, yawFront: null, yawTurn: null };
  } else {
    // Straight photo against every stored example; the turned one against the best match.
    let best: { id: string; r: FaceResult } | null = null;
    let problem: string | null = null;
    for (const id of enrol.image_ids) {
      const f = single(await verifyAgainst(id, front), "first");
      if (typeof f === "string") {
        problem = f;
        break;
      }
      if (!best || (f.similarity ?? 0) > (best.r.similarity ?? 0)) best = { id, r: f };
    }
    if (problem || !best) {
      verdict = { ok: false, reason: problem ?? "No enrolled photo to compare with.", similarityFront: null, similarityTurn: null, yawFront: null, yawTurn: null };
    } else {
      const t = single(await verifyAgainst(best.id, turn), "second");
      verdict = typeof t === "string"
        ? { ok: false, reason: t, similarityFront: best.r.similarity, similarityTurn: null, yawFront: best.r.yaw, yawTurn: null }
        : judge(best.r, t, ch.direction, true);
    }
  }

  const photoPath = await savePhoto("punch", ch.staffId, front);
  let marked: { inTime?: string; outTime?: string; status?: string } | null = null;
  if (verdict.ok) {
    try {
      marked = action === "in" ? await markStaffIn(user, ch.staffId) : await markStaffOut(user, ch.staffId);
    } catch (err) {
      verdict = { ...verdict, ok: false, reason: (err as Error).message };
    }
  }
  await pool.query(
    `INSERT INTO face_punches (staff_id, ward_id, attendance_date, action, outcome, similarity_front, similarity_turn, yaw_front, yaw_turn,
                               challenge_direction, reject_reason, photo_path, marked_by_username, marked_by_role)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      ch.staffId, staff.ward_id, istDateString(), action, verdict.ok ? "verified" : "rejected",
      verdict.similarityFront, verdict.similarityTurn, verdict.yawFront, verdict.yawTurn,
      ch.direction, verdict.reason, photoPath, user.username, user.role,
    ],
  );
  console.log(`[face] ${action} staff ${ch.staffId} by ${user.username}: ${verdict.ok ? "verified" : "rejected"} sim=${verdict.similarityFront}/${verdict.similarityTurn} yaw=${verdict.yawFront}/${verdict.yawTurn} asked=${ch.direction}`);
  if (!verdict.ok) {
    return { verified: false as const, reason: verdict.reason, similarity: verdict.similarityFront };
  }
  return { verified: true as const, action, ...marked, similarity: verdict.similarityFront };
}

/**
 * Called by the ordinary (non-face) mark-in / mark-out endpoints. With face attendance on, an enrolled worker can
 * only be marked by hand with a written reason, and the mark is flagged for review. Returns a recorder to call
 * once the mark has gone through.
 */
export async function guardManualMark(
  user: AttendanceTokenPayload,
  staffId: number,
  action: "in" | "out",
  overrideReason: string | null | undefined,
): Promise<() => Promise<void>> {
  if (!env.FACE_ATTENDANCE_ENABLED) return async () => undefined;
  const enrolled = await activeEnrolment(staffId);
  const reason = (overrideReason ?? "").trim();
  if (enrolled && reason.length < 5) {
    throw ApiError.badRequest("This worker's face is enrolled - use face verification, or give a reason (at least 5 characters) for marking manually.");
  }
  return async () => {
    const staff = await fieldStaffRepository.findById(staffId);
    await pool.query(
      `INSERT INTO face_punches (staff_id, ward_id, attendance_date, action, outcome, override_reason, marked_by_username, marked_by_role, review_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [staffId, staff?.ward_id ?? null, istDateString(), action, enrolled ? "manual_override" : "manual_not_enrolled", enrolled ? reason : null, user.username, user.role, enrolled ? "pending" : "none"],
    );
  };
}

// ---------------------------------------------------------------------------------------------- enrolment

export async function enrolFace(user: AttendanceTokenPayload, challengeId: string, frontB64: string, turnB64: string, consent: boolean) {
  assertEnabled();
  if (!FACE_ENROL_ROLES.includes(user.role)) throw new ApiError(403, "Your login cannot enrol faces.");
  if (!consent) throw ApiError.badRequest("Record the worker's consent before enrolling the face.");
  const front = decodeImage(frontB64, "first");
  const turn = decodeImage(turnB64, "second");
  const ch = await claimChallenge(user, challengeId, "enrol");
  const staff = await loadStaff(user, ch.staffId);

  // Same person already enrolled as somebody else? (ghost / duplicate worker)
  const top = await recognizeTop(front);
  if (top && top.similarity >= env.FACE_MATCH_THRESHOLD) {
    const { rows } = await pool.query<{ staff_id: string; name: string; ward_name: string | null }>(
      `SELECT e.staff_id, s.name, w.ward_name FROM face_enrolments e JOIN field_staff s ON s.id = e.staff_id
         LEFT JOIN attendance_wards w ON w.id = s.ward_id WHERE e.active AND e.subject = $1`,
      [top.subject],
    );
    const other = rows[0];
    if (other && Number(other.staff_id) !== ch.staffId) {
      throw ApiError.badRequest(`This face is already enrolled as ${other.name}${other.ward_name ? ` (${other.ward_name})` : ""}. One person cannot be enrolled as two workers - check the roster.`);
    }
  }

  const subject = `staff-${ch.staffId}-${Date.now()}`;
  const added: string[] = [];
  try {
    const firstId = await addExample(subject, front);
    added.push(firstId);
    const f = single(await verifyAgainst(firstId, front), "first");
    if (typeof f === "string") throw ApiError.badRequest(f);
    const t = single(await verifyAgainst(firstId, turn), "second");
    if (typeof t === "string") throw ApiError.badRequest(t);
    const v = judge(f, t, ch.direction, false);
    if (!v.ok) throw ApiError.badRequest(v.reason ?? "Liveness check failed.");
    if ((t.similarity ?? 0) < env.FACE_MATCH_THRESHOLD_TURNED) throw ApiError.badRequest("The two photos do not look like the same person. Take them again.");
    added.push(await addExample(subject, turn));
  } catch (err) {
    await deleteSubject(subject);
    throw err;
  }

  const photoPath = await savePhoto("enrol", ch.staffId, front);
  const previous = await activeEnrolment(ch.staffId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (previous) {
      await client.query(`UPDATE face_enrolments SET active = FALSE, removed_at = now(), removed_by_username = $2 WHERE id = $1`, [previous.id, user.username]);
    }
    await client.query(
      `INSERT INTO face_enrolments (staff_id, subject, image_ids, photo_path, consent_recorded, enrolled_by_username, enrolled_by_role)
       VALUES ($1, $2, $3, $4, TRUE, $5, $6)`,
      [ch.staffId, subject, added, photoPath, user.username, user.role],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    await deleteSubject(subject);
    throw err;
  } finally {
    client.release();
  }
  if (previous) await deleteSubject(previous.subject);
  return { enrolled: true, staffId: ch.staffId, name: staff.name, reEnrolled: Boolean(previous) };
}

export async function removeEnrolment(user: AttendanceTokenPayload, staffId: number) {
  if (!FACE_ENROL_ROLES.includes(user.role)) throw new ApiError(403, "Your login cannot remove face enrolments.");
  const e = await activeEnrolment(staffId);
  if (!e) throw ApiError.notFound("No face enrolled for this worker.");
  await pool.query(`UPDATE face_enrolments SET active = FALSE, removed_at = now(), removed_by_username = $2 WHERE id = $1`, [e.id, user.username]);
  await deleteSubject(e.subject);
  if (e.photo_path) await fs.promises.rm(path.join(env.PHOTO_UPLOAD_DIR, e.photo_path), { force: true });
  return { removed: true };
}

export async function wardEnrolmentStatus(wardId: number) {
  const { rows } = await pool.query(
    `SELECT s.id::int AS "staffId", s.name, s.name_hi AS "nameHi", e.enrolled_at AS "enrolledAt", e.enrolled_by_username AS "enrolledBy"
       FROM field_staff s LEFT JOIN face_enrolments e ON e.staff_id = s.id AND e.active
      WHERE s.ward_id = $1 AND s.active ORDER BY s.name`,
    [wardId],
  );
  return rows;
}

export async function enrolmentPhoto(staffId: number) {
  const e = await activeEnrolment(staffId);
  return { photo: await readPhotoDataUrl(e?.photo_path ?? null) };
}

// ---------------------------------------------------------------------------------------------- review

export async function listForReview(filter: { kind: "pending" | "rejected" | "all"; date?: string; wardId?: number }) {
  const where: string[] = [];
  const args: unknown[] = [];
  if (filter.kind === "pending") where.push(`p.review_status = 'pending'`);
  else if (filter.kind === "rejected") where.push(`p.outcome = 'rejected'`);
  else where.push(`p.outcome IN ('manual_override', 'rejected')`);
  if (filter.date) {
    args.push(filter.date);
    where.push(`p.attendance_date = $${args.length}`);
  }
  if (filter.wardId) {
    args.push(filter.wardId);
    where.push(`p.ward_id = $${args.length}`);
  }
  const { rows } = await pool.query(
    `SELECT p.id::int AS id, p.staff_id::int AS "staffId", s.name, w.ward_name AS "wardName", p.attendance_date::text AS date, p.action,
            p.outcome, p.similarity_front::float AS "similarity", p.reject_reason AS "rejectReason", p.override_reason AS "overrideReason",
            p.marked_by_username AS "markedBy", p.marked_by_role AS "markedByRole", p.review_status AS "reviewStatus",
            p.reviewed_by AS "reviewedBy", p.review_remarks AS "reviewRemarks", p.created_at AS "createdAt", (p.photo_path IS NOT NULL) AS "hasPhoto"
       FROM face_punches p JOIN field_staff s ON s.id = p.staff_id LEFT JOIN attendance_wards w ON w.id = p.ward_id
      WHERE ${where.join(" AND ")}
      ORDER BY p.created_at DESC LIMIT 300`,
    args,
  );
  return rows;
}

export async function punchPhoto(id: number) {
  const { rows } = await pool.query<{ photo_path: string | null; staff_id: string }>(`SELECT photo_path, staff_id FROM face_punches WHERE id = $1`, [id]);
  if (!rows[0]) throw ApiError.notFound("Not found.");
  const e = await activeEnrolment(Number(rows[0].staff_id));
  return { photo: await readPhotoDataUrl(rows[0].photo_path), enrolledPhoto: await readPhotoDataUrl(e?.photo_path ?? null) };
}

export async function reviewPunch(user: AttendanceTokenPayload, id: number, decision: "accepted" | "rejected", remarks: string | null) {
  if (!FACE_REVIEW_ROLES.includes(user.role)) throw new ApiError(403, "Your login cannot review face attendance.");
  const { rows } = await pool.query<{ marked_by_username: string; review_status: string }>(`SELECT marked_by_username, review_status FROM face_punches WHERE id = $1`, [id]);
  const p = rows[0];
  if (!p) throw ApiError.notFound("Not found.");
  if (p.review_status !== "pending") throw ApiError.badRequest("This entry is not awaiting review.");
  if (p.marked_by_username === user.username) throw ApiError.badRequest("You cannot review a manual mark you made yourself.");
  if (decision === "rejected" && !(remarks ?? "").trim()) throw ApiError.badRequest("Give remarks when rejecting.");
  await pool.query(
    `UPDATE face_punches SET review_status = $2, reviewed_by = $3, reviewed_at = now(), review_remarks = $4 WHERE id = $1 AND review_status = 'pending'`,
    [id, decision, user.username, remarks?.trim() || null],
  );
  return { ok: true };
}

/** Per-ward share of today's (or a date's) in-marks that were face verified. */
export async function faceSummary(date?: string) {
  const d = date || istDateString();
  const { rows } = await pool.query(
    `SELECT w.id::int AS "wardId", w.ward_name AS "wardName",
            (SELECT count(*)::int FROM field_staff s WHERE s.ward_id = w.id AND s.active) AS "activeStaff",
            (SELECT count(*)::int FROM face_enrolments e JOIN field_staff s ON s.id = e.staff_id WHERE e.active AND s.ward_id = w.id AND s.active) AS enrolled,
            count(*) FILTER (WHERE p.action = 'in' AND p.outcome = 'verified')::int AS "faceIn",
            count(*) FILTER (WHERE p.action = 'in' AND p.outcome = 'manual_override')::int AS "manualIn",
            count(*) FILTER (WHERE p.outcome = 'rejected')::int AS "failedAttempts"
       FROM attendance_wards w LEFT JOIN face_punches p ON p.ward_id = w.id AND p.attendance_date = $1
      GROUP BY w.id, w.ward_name ORDER BY w.ward_name`,
    [d],
  );
  return { date: d, wards: rows };
}

/** Housekeeping: punch photos past the retention period, and spent challenges. */
export async function purgeOldFaceData(): Promise<void> {
  const { rows } = await pool.query<{ id: string; photo_path: string }>(
    `SELECT id, photo_path FROM face_punches WHERE photo_path IS NOT NULL AND created_at < now() - make_interval(days => $1) LIMIT 2000`,
    [env.FACE_PHOTO_RETENTION_DAYS],
  );
  for (const r of rows) {
    await fs.promises.rm(path.join(env.PHOTO_UPLOAD_DIR, r.photo_path), { force: true }).catch(() => undefined);
    await pool.query(`UPDATE face_punches SET photo_path = NULL WHERE id = $1`, [r.id]);
  }
  await pool.query(`DELETE FROM face_challenges WHERE created_at < now() - interval '1 day'`);
  if (rows.length) console.log(`[face] removed ${rows.length} punch photos older than ${env.FACE_PHOTO_RETENTION_DAYS} days`);
}
