import type { PoolClient } from "pg";
import { ApiError } from "../utils/ApiError";

/**
 * Credits a new trade licence application to the Tax Collector whose notice brought it in (it then counts in his
 * collection); without such a notice it is an "automatic" application, credited to no one.
 *
 * The notice is the one whose number was entered on the application, or - when none was entered - a notice visit on
 * the same holding whose first notice was issued on or before today (within a year), not yet credited to another
 * application, and with the same - or a similar - business name (one name contains the other, or they share a word).
 * Never a guess between unrelated businesses: without a matching name the application is automatic.
 */

const key = (s: string | null | undefined) => (s ?? "").replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase();
/** Words that say nothing about which business it is. */
const COMMON = new Set(["shop", "store", "stores", "and", "the", "new", "enterprises", "enterprise", "traders", "trader", "dukan", "दुकान"]);
const words = (s: string | null | undefined) =>
  new Set(
    (s ?? "")
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length >= 3 && !COMMON.has(w)),
  );
/** Same business name, or one contains the other, or they share a distinctive word. */
function similar(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = key(a);
  const kb = key(b);
  if (!ka || !kb) return false;
  if (ka === kb || ka.includes(kb) || kb.includes(ka)) return true;
  const wb = words(b);
  return [...words(a)].some((w) => wb.has(w));
}

interface Visit {
  id: number;
  business_name: string | null;
  recorded_by_username: string;
  recorded_by_name: string;
  notice_no: string;
  linked_app: string | null;
}

export async function creditApplication(
  client: PoolClient,
  applicationId: number,
  input: { noticeNo?: string | null; holdingNo?: string | null; entityName: string },
): Promise<{ source: "notice" | "automatic"; collector: string | null; noticeNo: string | null }> {
  let visit: Visit | undefined;
  const noticeNo = input.noticeNo?.trim();
  if (noticeNo) {
    const { rows } = await client.query<Visit>(
      `SELECT s.id, s.business_name, s.recorded_by_username, s.recorded_by_name, n.notice_no,
              (SELECT application_number FROM trade_license_applications WHERE tl_survey_id = s.id) AS linked_app
         FROM trade_license_notices n JOIN trade_license_surveys s ON s.id = n.survey_id
        WHERE upper(n.notice_no) = upper($1)`,
      [noticeNo],
    );
    visit = rows[0];
    if (!visit)
      throw ApiError.badRequest(`Trade licence notice ${noticeNo} not found - check the number on the notice, or leave it blank.`);
    if (visit.linked_app) throw ApiError.badRequest(`Notice ${noticeNo} is already linked to application ${visit.linked_app}.`);
  } else if (input.holdingNo?.trim()) {
    const { rows } = await client.query<Visit>(
      `SELECT s.id, s.business_name, s.recorded_by_username, s.recorded_by_name,
              (SELECT notice_no FROM trade_license_notices WHERE survey_id = s.id ORDER BY level LIMIT 1) AS notice_no, NULL AS linked_app
         FROM trade_license_surveys s
         JOIN LATERAL (SELECT min(issued_on) AS first_issued FROM trade_license_notices WHERE survey_id = s.id) n ON n.first_issued IS NOT NULL
        WHERE s.holding_no = $1
          AND n.first_issued BETWEEN (now() AT TIME ZONE 'Asia/Kolkata')::date - 365 AND (now() AT TIME ZONE 'Asia/Kolkata')::date
          AND NOT EXISTS (SELECT 1 FROM trade_license_applications a WHERE a.tl_survey_id = s.id)
        ORDER BY n.first_issued DESC`,
      [input.holdingNo.trim()],
    );
    visit =
      rows.find((r) => key(r.business_name) && key(r.business_name) === key(input.entityName)) ??
      rows.find((r) => similar(r.business_name, input.entityName));
  }
  if (!visit) return { source: "automatic", collector: null, noticeNo: null };
  await client.query(
    `UPDATE trade_license_applications
        SET tl_survey_id = $2, tl_notice_no = $3, source = 'notice', credited_collector_username = $4, credited_collector_name = $5
      WHERE id = $1`,
    [applicationId, visit.id, visit.notice_no, visit.recorded_by_username, visit.recorded_by_name],
  );
  return { source: "notice", collector: visit.recorded_by_name, noticeNo: visit.notice_no };
}
