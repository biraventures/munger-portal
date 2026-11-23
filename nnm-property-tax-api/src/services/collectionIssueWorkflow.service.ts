import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "../config/db";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import { photoOrDocumentExt } from "../utils/uploadLimits";
import type { AdminTokenPayload } from "../types/admin.types";
import { collectorWardScope } from "../middleware/collectorWardGuard";

/**
 * Collection issues after they are reported (migration 191):
 * - status: open -> notice_issued (the City Manager generated a notice) -> resolved;
 * - resolved automatically when the holding's demand is paid after the issue was reported - a demand notice of the
 *   holding settled since then and none left unpaid - or by the City Manager / Commissioner with a note; reopenable;
 * - the receiving copy of each notice: uploaded by the Tax Collector who reported the issue, the Tax Daroga or the City
 *   Manager (photo or PDF), removed only with the DMC's approval - a removed copy is kept in the log.
 */

/** Closes issues whose holding has paid: a demand settled after the issue was reported, and no demand left unpaid. */
export async function autoResolvePaid(): Promise<number> {
  const { rowCount } = await pool.query(
    `UPDATE collection_issues ci
        SET status = 'resolved', resolved_how = 'paid', resolved_at = now(), resolved_by = 'System (demand paid)',
            resolution_note = 'Demand paid' || COALESCE(' - receipt ' || (
              SELECT d.settled_receipt_no FROM demand_notices d
               WHERE d.holding_no = ci.holding_no AND d.settled AND d.settled_at >= ci.reported_at ORDER BY d.settled_at DESC LIMIT 1), '')
      WHERE ci.status IN ('open', 'notice_issued')
        AND EXISTS (SELECT 1 FROM demand_notices d WHERE d.holding_no = ci.holding_no AND d.settled AND d.settled_at >= ci.reported_at)
        AND NOT EXISTS (SELECT 1 FROM demand_notices d WHERE d.holding_no = ci.holding_no AND NOT d.settled AND NOT d.superseded AND NOT d.cancelled)`,
  );
  return rowCount ?? 0;
}

const RESOLVERS = ["city_manager", "commissioner"];

/** City Manager / Commissioner: marks an issue resolved, with what happened. */
export async function resolveIssue(id: number, note: string, admin: AdminTokenPayload): Promise<void> {
  if (!RESOLVERS.includes(admin.role)) throw new ApiError(403, "Only the City Manager or the Commissioner can resolve a collection issue.");
  const { rowCount } = await pool.query(
    `UPDATE collection_issues SET status = 'resolved', resolved_how = 'manual', resolved_at = now(), resolved_by = $2, resolution_note = $3
      WHERE id = $1 AND status <> 'resolved'`,
    [id, admin.displayName, note.trim()],
  );
  if (!rowCount) throw ApiError.badRequest("This issue is already resolved (or not found).");
}

/** City Manager / Commissioner: reopens a resolved issue (back to notice issued if it has a notice, else open). */
export async function reopenIssue(id: number, admin: AdminTokenPayload): Promise<void> {
  if (!RESOLVERS.includes(admin.role)) throw new ApiError(403, "Only the City Manager or the Commissioner can reopen a collection issue.");
  const { rowCount } = await pool.query(
    `UPDATE collection_issues ci
        SET status = CASE WHEN EXISTS (SELECT 1 FROM collection_issue_notices n WHERE n.collection_issue_id = ci.id) THEN 'notice_issued' ELSE 'open' END,
            resolved_how = NULL, resolved_at = NULL, resolved_by = NULL,
            resolution_note = 'Reopened by ' || $2 || ' on ' || to_char(now() AT TIME ZONE 'Asia/Kolkata', 'DD/MM/YYYY')
                              || COALESCE(' (was: ' || ci.resolution_note || ')', '')
      WHERE id = $1 AND status = 'resolved'`,
    [id, admin.displayName],
  );
  if (!rowCount) throw ApiError.badRequest("Only a resolved issue can be reopened.");
}

/** Dashboard counts: open issues (no notice yet) for the City Manager; removals waiting for the DMC. */
export async function workflowCounts() {
  await autoResolvePaid();
  const { rows } = await pool.query<{ open: number; notice_issued: number; removals: number }>(
    `SELECT (SELECT count(*)::int FROM collection_issues WHERE status = 'open') AS open,
            (SELECT count(*)::int FROM collection_issues WHERE status = 'notice_issued') AS notice_issued,
            (SELECT count(*)::int FROM collection_issue_notices WHERE receiving_removal_requested_at IS NOT NULL) AS removals`,
  );
  return rows[0]!;
}

// ---------- receiving copies ----------

interface NoticeOwner {
  reported_by_username: string;
  ward: string | null;
  receiving_photo_path: string | null;
  receiving_removal_requested_at: string | null;
}
async function noticeOwner(db: Pick<PoolClient, "query">, noticeId: string, lock = false): Promise<NoticeOwner> {
  const { rows } = await db.query<NoticeOwner>(
    `SELECT ci.reported_by_username, btrim(p.ward) AS ward, n.receiving_photo_path, n.receiving_removal_requested_at
       FROM collection_issue_notices n JOIN collection_issues ci ON ci.id = n.collection_issue_id
       LEFT JOIN properties p ON p.holding_no = ci.holding_no
      WHERE n.id = $1 ${lock ? "FOR UPDATE OF n" : ""}`,
    [noticeId],
  );
  if (!rows[0]) throw ApiError.notFound("Notice not found.");
  return rows[0];
}

/** The Tax Collector who reported the issue, or a Tax Collector of the holding's ward. */
async function isIssueCollector(admin: AdminTokenPayload, n: NoticeOwner): Promise<boolean> {
  if (admin.role !== "tax_collector") return false;
  if (admin.username === n.reported_by_username) return true;
  const wards = (await collectorWardScope(admin)) ?? [];
  return !!n.ward && wards.includes(n.ward);
}

/** Upload / ask for removal: a Tax Collector (reported it, or of the ward), the Tax Daroga or the City Manager (removal: also the Commissioner). */
async function assertReceivingRole(admin: AdminTokenPayload, n: NoticeOwner, what: string, alsoCommissioner = false) {
  const ok =
    (await isIssueCollector(admin, n)) ||
    admin.role === "tax_daroga" ||
    admin.role === "city_manager" ||
    (alsoCommissioner && admin.role === "commissioner");
  if (!ok) throw new ApiError(403, `Only a Tax Collector of the ward, the Tax Daroga or the City Manager can ${what}.`);
}

async function log(
  db: Pick<PoolClient, "query">,
  noticeId: string,
  action: "uploaded" | "removal_requested" | "removal_rejected" | "removed",
  admin: AdminTokenPayload,
  photoPath: string | null,
  reason: string | null,
) {
  await db.query(
    `INSERT INTO collection_issue_notice_receiving_log (notice_id, action, photo_path, reason, by_username, by_name) VALUES ($1,$2,$3,$4,$5,$6)`,
    [noticeId, action, photoPath, reason, admin.username, admin.displayName],
  );
}

async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const out = await fn(c);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    c.release();
  }
}

/** The signed receiving copy of a collection issue notice - a photo or a PDF. Once uploaded it stays (removal needs the DMC). */
export async function uploadReceiving(noticeId: string, file: { base64: string; mime: string }, admin: AdminTokenPayload): Promise<void> {
  const buf = Buffer.from(file.base64, "base64");
  const ext = photoOrDocumentExt(file.mime, buf, true);
  await tx(async (c) => {
    const n = await noticeOwner(c, noticeId, true);
    await assertReceivingRole(admin, n, "upload the receiving copy");
    if (n.receiving_photo_path)
      throw ApiError.badRequest("The receiving copy of this notice is already uploaded. It can be removed only with the DMC's approval.");
    const rel = path.join(
      "collection-issue-notices",
      `receiving-${noticeId}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${ext}`,
    );
    const full = path.join(env.PHOTO_UPLOAD_DIR, rel);
    await fs.promises.mkdir(path.dirname(full), { recursive: true });
    await fs.promises.writeFile(full, buf);
    await c.query(
      `UPDATE collection_issue_notices SET receiving_photo_path = $2, receiving_uploaded_by_username = $3, receiving_uploaded_by_name = $4,
              receiving_uploaded_at = now() WHERE id = $1`,
      [noticeId, rel, admin.username, admin.displayName],
    );
    await log(c, noticeId, "uploaded", admin, rel, null);
  });
}

export async function requestRemoval(noticeId: string, reason: string, admin: AdminTokenPayload): Promise<void> {
  const n = await noticeOwner(pool, noticeId);
  await assertReceivingRole(admin, n, "ask for the receiving copy to be removed", true);
  if (!n.receiving_photo_path) throw ApiError.badRequest("No receiving copy is uploaded for this notice.");
  if (n.receiving_removal_requested_at) throw ApiError.badRequest("Removal of this receiving copy is already waiting for the DMC.");
  await pool.query(
    `UPDATE collection_issue_notices SET receiving_removal_reason = $2, receiving_removal_requested_by = $3, receiving_removal_requested_at = now()
      WHERE id = $1`,
    [noticeId, reason.trim(), admin.displayName],
  );
  await log(pool, noticeId, "removal_requested", admin, n.receiving_photo_path, reason.trim());
}

/** DMC: approves (copy taken off, kept in the log) or rejects a requested removal. */
export async function decideRemoval(noticeId: string, approve: boolean, remark: string | null, admin: AdminTokenPayload): Promise<void> {
  if (admin.role !== "deputy_commissioner") throw new ApiError(403, "Removal of a receiving copy is approved by the DMC.");
  await tx(async (c) => {
    const n = await noticeOwner(c, noticeId, true);
    if (!n.receiving_removal_requested_at || !n.receiving_photo_path) throw ApiError.badRequest("No removal is waiting for this notice.");
    await c.query(
      approve
        ? `UPDATE collection_issue_notices SET receiving_photo_path = NULL, receiving_uploaded_by_username = NULL, receiving_uploaded_by_name = NULL,
                  receiving_uploaded_at = NULL, receiving_removal_reason = NULL, receiving_removal_requested_by = NULL, receiving_removal_requested_at = NULL
            WHERE id = $1`
        : `UPDATE collection_issue_notices SET receiving_removal_reason = NULL, receiving_removal_requested_by = NULL, receiving_removal_requested_at = NULL
            WHERE id = $1`,
      [noticeId],
    );
    await log(c, noticeId, approve ? "removed" : "removal_rejected", admin, n.receiving_photo_path, remark?.trim() || null);
  });
}

export async function receivingLog(noticeId: string) {
  const { rows } = await pool.query(
    `SELECT id, action, reason, by_name, at, (photo_path IS NOT NULL AND action = 'removed') AS has_removed_copy
       FROM collection_issue_notice_receiving_log WHERE notice_id = $1 ORDER BY at DESC, id DESC`,
    [noticeId],
  );
  return rows;
}

function storedFile(rel: string | null): string {
  if (!rel) throw ApiError.notFound("No receiving copy uploaded yet.");
  const base = path.resolve(env.PHOTO_UPLOAD_DIR);
  const full = path.resolve(base, rel);
  if (!full.startsWith(base + path.sep) || !fs.existsSync(full)) throw ApiError.notFound("The file is missing from storage.");
  return full;
}

/** The current receiving copy - a Tax Collector only for issues they reported. */
export async function receivingFile(noticeId: string, admin: AdminTokenPayload): Promise<string> {
  const n = await noticeOwner(pool, noticeId);
  if (admin.role === "tax_collector" && !(await isIssueCollector(admin, n))) throw new ApiError(403, "Not your record.");
  return storedFile(n.receiving_photo_path);
}

/** A removed receiving copy (from the log). */
export async function removedFile(logId: string): Promise<string> {
  const { rows } = await pool.query<{ photo_path: string | null }>(
    `SELECT photo_path FROM collection_issue_notice_receiving_log WHERE id = $1 AND action = 'removed'`,
    [logId],
  );
  if (!rows[0]) throw ApiError.notFound("Not found.");
  return storedFile(rows[0].photo_path);
}
