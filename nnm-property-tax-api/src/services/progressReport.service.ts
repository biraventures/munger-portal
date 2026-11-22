import { pool } from "../config/db";
import { ApiError } from "../utils/ApiError";
import type { AdminTokenPayload } from "../types/admin.types";

/**
 * Progress report: everything one officer did in a period - collection made, changes to holdings, notices, approvals
 * and decisions, other field work - from the records each screen already keeps. An officer sees their own; the
 * Commissioner, the DMC and the City Manager can also look at any officer's.
 *
 * Actor columns differ between tables (some keep the login name, some the display name), so each source matches
 * either. Every source returns: at, action, ref (holding / notice / receipt), amount (collections only), detail.
 * Parameters: $1 username, $2 display name, $3 period start, $4 period end (exclusive).
 */

export const PROGRESS_REPORT_ROLES = [
  "agency_project_manager",
  "agency_team_leader",
  "agency_operator",
  "tax_collector",
  "tax_surveyor",
  "tax_daroga",
  "trade_license_nodal",
  "city_manager",
  "deputy_commissioner",
  "commissioner",
];
const SUPERVISORS = ["commissioner", "deputy_commissioner", "city_manager"];

type Category = "collection" | "holdings" | "notices" | "approvals" | "other";
export const CATEGORY_LABEL: Record<Category, string> = {
  collection: "Collection made",
  holdings: "Changes to holdings",
  notices: "Notices",
  approvals: "Approvals & decisions",
  other: "Other work",
};

const ME = (col: string) => `(${col} = $1 OR ${col} = $2)`;
const IN_PERIOD = (col: string) => `${col} >= $3 AND ${col} < $4`;

interface Source {
  category: Category;
  sql: string;
}

const SOURCES: Source[] = [
  // ---------- collection ----------
  {
    category: "collection",
    sql: `SELECT txn_date AS at, 'Property tax collected (' || coalesce(payment_mode, '-') || ')' AS action, holding_no AS ref,
                 amount_received AS amount, 'Receipt ' || receipt_no AS detail
            FROM transactions
           WHERE (collected_by_username = $1 OR collected_by = $2) AND NOT coalesce(cancelled, false) AND coalesce(status, 'success') = 'success'
             AND ${IN_PERIOD("txn_date")}`,
  },
  {
    category: "collection",
    sql: `SELECT txn_date, 'Shop rent collected (' || coalesce(payment_mode, '-') || ')', shop_no, amount_received, 'Receipt ' || receipt_no
            FROM shop_rent_payments WHERE ${ME("collected_by")} AND NOT coalesce(cancelled, false) AND ${IN_PERIOD("txn_date")}`,
  },
  {
    category: "collection",
    sql: `SELECT created_at, 'Cremation ticket (' || payment_mode || ')', ticket_no, amount, deceased_name
            FROM crematorium_tickets WHERE issued_by = $1 AND status <> 'cancelled' AND ${IN_PERIOD("created_at")}`,
  },
  {
    category: "collection",
    sql: `SELECT created_at, 'Garden ticket (' || coalesce(payment_mode, channel) || ')', ticket_no, amount, persons || ' person(s)'
            FROM garden_tickets WHERE sold_by_username = $1 AND status IN ('paid', 'used') AND ${IN_PERIOD("created_at")}`,
  },
  {
    category: "collection",
    sql: `SELECT paid_at, 'Community hall payment recorded', booking_no, NULL::numeric, NULL
            FROM hall_bookings WHERE ${ME("payment_recorded_by")} AND ${IN_PERIOD("paid_at")}`,
  },
  // ---------- changes to holdings ----------
  {
    category: "holdings",
    sql: `SELECT ts, 'Holding ' || lower(action), holding_no, NULL::numeric, nullif(concat_ws(' - ', change_basis, change_reference), '')
            FROM property_history WHERE ${ME("operator_name")} AND ${IN_PERIOD("ts")}`,
  },
  {
    category: "holdings",
    sql: `SELECT reported_at, 'Discrepancy reported', holding_no, NULL::numeric, left(discrepancy_notes, 120)
            FROM property_discrepancy_requests WHERE reported_by_username = $1 AND ${IN_PERIOD("reported_at")}`,
  },
  {
    category: "holdings",
    sql: `SELECT requested_at, 'Property change requested', holding_no, NULL::numeric, change_basis
            FROM property_change_requests WHERE ${ME("requested_by")} AND ${IN_PERIOD("requested_at")}`,
  },
  {
    category: "holdings",
    sql: `SELECT requested_at, 'Solid waste user type entered', holding_no, NULL::numeric, requested_type
            FROM solid_waste_type_requests WHERE requested_by_username = $1 AND ${IN_PERIOD("requested_at")}`,
  },
  {
    category: "holdings",
    sql: `SELECT captured_at, 'Field verification (photos / documents)', holding_no, NULL::numeric, NULL
            FROM property_field_verifications WHERE captured_by_username = $1 AND ${IN_PERIOD("captured_at")}`,
  },
  {
    category: "holdings",
    sql: `SELECT recorded_at, 'Missing house recorded', coalesce(house_no, 'Ward ' || ward), NULL::numeric, owner_name
            FROM unsurveyed_houses WHERE recorded_by_username = $1 AND ${IN_PERIOD("recorded_at")}`,
  },
  {
    category: "holdings",
    sql: `SELECT created_at, 'Old holding survey: ' || replace(event_type, '_', ' '), holding_no, NULL::numeric, left(notes, 120)
            FROM migrated_holding_survey_events WHERE actor_username = $1 AND ${IN_PERIOD("created_at")}`,
  },
  {
    category: "holdings",
    sql: `SELECT (e->>'at')::timestamptz, 'Old record (MIG): ' || (e->>'action'), coalesce(r.holding_no, 'MIG-' || r.mig_number, r.old_holding_no), NULL::numeric,
                 left(e->>'note', 120)
            FROM mig_records r, jsonb_array_elements(r.events) e
           WHERE e->>'by' IN ($1, $2, $2 || ' (Operator)') AND e->>'action' <> 'uploaded' AND (e->>'at')::timestamptz >= $3 AND (e->>'at')::timestamptz < $4`,
  },
  {
    category: "holdings",
    sql: `SELECT entered_at, 'Pre-2011 ARV entered', holding_no, NULL::numeric, register_reference
            FROM pre2011_arv_entries WHERE entered_by_username = $1 AND ${IN_PERIOD("entered_at")}`,
  },
  {
    category: "holdings",
    sql: `SELECT flagged_at, 'Holding flagged for re-survey', holding_no, NULL::numeric, NULL
            FROM property_resurvey_flags WHERE flagged_by_username = $1 AND ${IN_PERIOD("flagged_at")}`,
  },
  {
    category: "holdings",
    sql: `SELECT entered_at, 'Old payment entered', holding_no, NULL::numeric, NULL
            FROM historical_payment_settlements WHERE entered_by_username = $1 AND ${IN_PERIOD("entered_at")}`,
  },
  // ---------- notices ----------
  {
    category: "notices",
    sql: `SELECT notice_date, 'Demand notice generated', holding_no, NULL::numeric, demand_no
            FROM demand_notices WHERE ${ME("generated_by")} AND NOT coalesce(cancelled, false) AND ${IN_PERIOD("notice_date")}`,
  },
  {
    category: "notices",
    sql: `SELECT printed_at, 'Demand notice printed', holding_no, NULL::numeric, demand_no
            FROM notice_print_positions WHERE ${ME("printed_by")} AND ${IN_PERIOD("printed_at")}`,
  },
  {
    category: "notices",
    sql: `SELECT c.uploaded_at, 'Demand notice receiving copy uploaded', d.holding_no, NULL::numeric, c.demand_no
            FROM demand_notice_receiving_copies c LEFT JOIN demand_notices d ON d.demand_no = c.demand_no
           WHERE c.uploaded_by_username = $1 AND ${IN_PERIOD("c.uploaded_at")}`,
  },
  {
    category: "notices",
    sql: `SELECT n.created_at, 'Trade licence notice ' || n.level || ' issued', s.holding_no, NULL::numeric, n.notice_no
            FROM trade_license_notices n JOIN trade_license_surveys s ON s.id = n.survey_id
           WHERE s.recorded_by_username = $1 AND ${IN_PERIOD("n.created_at")}`,
  },
  {
    category: "notices",
    sql: `SELECT l.at, 'Trade licence notice receiving: ' || replace(l.action, '_', ' '), n.notice_no, NULL::numeric, l.reason
            FROM trade_license_notice_receiving_log l JOIN trade_license_notices n ON n.id = l.notice_id
           WHERE l.by_username = $1 AND ${IN_PERIOD("l.at")}`,
  },
  {
    category: "notices",
    sql: `SELECT generated_at, 'Collection issue notice issued', holding_no, NULL::numeric, notice_no
            FROM collection_issue_notices WHERE generated_by_username = $1 AND ${IN_PERIOD("generated_at")}`,
  },
  {
    category: "notices",
    sql: `SELECT l.at, 'Collection issue notice receiving: ' || replace(l.action, '_', ' '), n.notice_no, NULL::numeric, l.reason
            FROM collection_issue_notice_receiving_log l JOIN collection_issue_notices n ON n.id = l.notice_id
           WHERE l.by_username = $1 AND ${IN_PERIOD("l.at")}`,
  },
  // ---------- approvals & decisions ----------
  {
    category: "approvals",
    sql: `SELECT a.decided_at, 'Discrepancy ' || a.decision || ' (' || replace(a.stage, '_', ' ') || ')', r.holding_no, NULL::numeric, left(a.notes, 120)
            FROM property_discrepancy_approvals a JOIN property_discrepancy_requests r ON r.id = a.discrepancy_request_id
           -- "submitted" rows are the reporter's own submission / resubmission - counted as "Discrepancy reported" (resubmitted below).
           WHERE a.admin_username = $1 AND a.decision <> 'submitted' AND ${IN_PERIOD("a.decided_at")}
          UNION ALL
          SELECT a.decided_at, 'Discrepancy resubmitted after correction', r.holding_no, NULL::numeric, left(a.notes, 120)
            FROM property_discrepancy_approvals a JOIN property_discrepancy_requests r ON r.id = a.discrepancy_request_id
           WHERE a.admin_username = $1 AND a.decision = 'submitted' AND a.decided_at > r.reported_at + interval '1 minute' AND ${IN_PERIOD("a.decided_at")}`,
  },
  {
    category: "approvals",
    sql: `SELECT a.decided_at, 'Property change ' || a.decision || ' (' || replace(a.stage, '_', ' ') || ')', r.holding_no, NULL::numeric, left(a.notes, 120)
            FROM change_request_approvals a JOIN property_change_requests r ON r.id = a.change_request_id
           WHERE a.admin_username = $1 AND ${IN_PERIOD("a.decided_at")}`,
  },
  {
    category: "approvals",
    sql: `SELECT daroga_at, 'Solid waste user type approved (Tax Daroga)', holding_no, NULL::numeric, requested_type
            FROM solid_waste_type_requests WHERE ${ME("daroga_by")} AND ${IN_PERIOD("daroga_at")}
          UNION ALL
          SELECT city_manager_at, 'Solid waste user type approved (City Manager)', holding_no, NULL::numeric, requested_type
            FROM solid_waste_type_requests WHERE ${ME("city_manager_by")} AND ${IN_PERIOD("city_manager_at")}
          UNION ALL
          SELECT rejected_at, 'Solid waste user type rejected', holding_no, NULL::numeric, reject_reason
            FROM solid_waste_type_requests WHERE ${ME("rejected_by")} AND ${IN_PERIOD("rejected_at")}`,
  },
  {
    category: "approvals",
    sql: `SELECT handled_at, 'Mutation application ' || replace(status, '_', ' '), coalesce(holding_no, application_no), NULL::numeric, handling_remarks
            FROM mutation_applications WHERE ${ME("handled_by")} AND ${IN_PERIOD("handled_at")}
          UNION ALL
          SELECT handled_at, 'New holding application ' || replace(status, '_', ' '), application_no, NULL::numeric, handling_remarks
            FROM new_holding_requests WHERE ${ME("handled_by")} AND ${IN_PERIOD("handled_at")}`,
  },
  {
    category: "approvals",
    sql: `SELECT requested_at, 'Cancellation requested (' || request_type || ')', coalesce(holding_no, target_id), NULL::numeric, left(reason, 120)
            FROM cancellation_requests WHERE (requested_by_username = $1 OR requested_by = $2) AND ${IN_PERIOD("requested_at")}
          UNION ALL
          SELECT tax_daroga_approved_at, 'Cancellation forwarded (Tax Daroga)', coalesce(holding_no, target_id), NULL::numeric, tax_daroga_notes
            FROM cancellation_requests WHERE ${ME("tax_daroga_approved_by")} AND ${IN_PERIOD("tax_daroga_approved_at")}
          UNION ALL
          SELECT reviewed_at, 'Cancellation ' || status, coalesce(holding_no, target_id), NULL::numeric, review_notes
            FROM cancellation_requests WHERE ${ME("reviewed_by")} AND ${IN_PERIOD("reviewed_at")}`,
  },
  {
    category: "approvals",
    sql: `SELECT a.decided_at, 'Trade licence application ' || a.decision || ' (' || replace(a.stage, '_', ' ') || ')', t.holding_no, NULL::numeric, left(a.notes, 120)
            FROM trade_license_application_approvals a JOIN trade_license_applications t ON t.id = a.application_id
           WHERE a.admin_username = $1 AND ${IN_PERIOD("a.decided_at")}`,
  },
  {
    category: "approvals",
    sql: `SELECT decided_at, 'Pre-2011 ARV ' || status, holding_no, NULL::numeric, decision_remarks
            FROM pre2011_arv_entries WHERE decided_by_username = $1 AND ${IN_PERIOD("decided_at")}
          UNION ALL
          SELECT decided_at, 'Old payment ' || status, holding_no, NULL::numeric, NULL
            FROM historical_payment_settlements WHERE decided_by_username = $1 AND ${IN_PERIOD("decided_at")}
          UNION ALL
          SELECT reviewed_at, 'Re-survey flag ' || status, holding_no, NULL::numeric, NULL
            FROM property_resurvey_flags WHERE reviewed_by_username = $1 AND ${IN_PERIOD("reviewed_at")}`,
  },
  {
    category: "approvals",
    sql: `SELECT decided_at, 'Community hall booking ' || status, booking_no, NULL::numeric, NULL
            FROM hall_bookings WHERE ${ME("decided_by")} AND ${IN_PERIOD("decided_at")}`,
  },
  {
    category: "approvals",
    sql: `SELECT reviewed_at, 'Khatian record ' || status, survey_sheet_no || coalesce(' / part ' || part_no, ''), NULL::numeric, NULL
            FROM khatian_records WHERE reviewed_by_username = $1 AND ${IN_PERIOD("reviewed_at")}`,
  },
  {
    category: "approvals",
    sql: `SELECT confirmed_at, 'Payment verified (project manager)', holding_no, amount_received, 'Receipt ' || receipt_no
            FROM transactions WHERE ${ME("pm_verified_by")} AND ${IN_PERIOD("confirmed_at")}`,
  },
  // ---------- other work ----------
  {
    category: "other",
    sql: `SELECT recorded_at, CASE WHEN has_license THEN 'Trade licence visit - licence seen' ELSE 'Trade licence visit - no licence' END,
                 holding_no, NULL::numeric, business_name
            FROM trade_license_surveys WHERE recorded_by_username = $1 AND ${IN_PERIOD("recorded_at")}
          UNION ALL
          SELECT complied_at, 'Trade licence obtained after notice (recorded)', holding_no, NULL::numeric, business_name
            FROM trade_license_surveys WHERE ${ME("complied_by")} AND ${IN_PERIOD("complied_at")}`,
  },
  {
    category: "other",
    sql: `SELECT reported_at, 'Collection issue reported (' || replace(issue_type, '_', ' ') || ')', holding_no, NULL::numeric, left(notes, 120)
            FROM collection_issues WHERE reported_by_username = $1 AND ${IN_PERIOD("reported_at")}
          UNION ALL
          SELECT resolved_at, 'Collection issue resolved', holding_no, NULL::numeric, left(resolution_note, 120)
            FROM collection_issues WHERE ${ME("resolved_by")} AND ${IN_PERIOD("resolved_at")}`,
  },
  {
    category: "other",
    sql: `SELECT assigned_at, 'Work assigned to Tax Surveyor ' || surveyor_username, NULL, NULL::numeric, NULL
            FROM surveyor_assignment_log WHERE ${ME("assigned_by")} AND ${IN_PERIOD("assigned_at")}`,
  },
  {
    category: "other",
    sql: `SELECT verified_at, 'Mutation area verified', concat_ws(' / ', khata_no, khesra_no), NULL::numeric, survey_sheet_no
            FROM mutation_area_verifications WHERE (verified_by_username = $1 OR verified_by = $2) AND ${IN_PERIOD("verified_at")}`,
  },
  {
    category: "other",
    sql: `SELECT uploaded_at, 'Khatian record uploaded', survey_sheet_no || coalesce(' / part ' || part_no, ''), NULL::numeric, NULL
            FROM khatian_records WHERE uploaded_by_username = $1 AND ${IN_PERIOD("uploaded_at")}`,
  },
  {
    category: "other",
    sql: `SELECT inspected_at, 'Shop inspected', shop_no, NULL::numeric, NULL FROM shop_inspections WHERE ${ME("inspected_by")} AND ${IN_PERIOD("inspected_at")}`,
  },
];

export interface ProgressItem {
  at: string;
  category: Category;
  action: string;
  ref: string | null;
  amount: number | null;
  detail: string | null;
}

const ITEM_LIMIT = 3000;

/** Officers whose report a supervisor can open (the progress-report roles). */
export async function listReportableOfficers(u: AdminTokenPayload) {
  if (!SUPERVISORS.includes(u.role)) throw new ApiError(403, "Not allowed.");
  const { rows } = await pool.query<{ username: string; display_name: string; role: string }>(
    `SELECT username, display_name, role FROM admins WHERE role = ANY($1::text[]) ORDER BY role, display_name`,
    [PROGRESS_REPORT_ROLES],
  );
  return rows;
}

/** The progress report of `username` (default: the signed-in officer) for the days from..to (India time, inclusive). */
export async function progressReport(u: AdminTokenPayload, from: string, to: string, username?: string) {
  if (!PROGRESS_REPORT_ROLES.includes(u.role)) throw new ApiError(403, "The progress report is not available for your login.");
  if (to < from) throw ApiError.badRequest("The end date is before the start date.");
  const days = (Date.parse(to) - Date.parse(from)) / 86400000 + 1;
  if (days > 366) throw ApiError.badRequest("Choose a period of at most one year.");

  let who: { username: string; name: string; role: string } = { username: u.username, name: u.displayName, role: u.role };
  if (username && username !== u.username) {
    if (!SUPERVISORS.includes(u.role)) throw new ApiError(403, "You can see only your own progress report.");
    const { rows } = await pool.query<{ username: string; display_name: string; role: string }>(
      `SELECT username, display_name, role FROM admins WHERE username = $1`,
      [username],
    );
    if (!rows[0]) throw ApiError.notFound("Officer not found.");
    who = { username: rows[0].username, name: rows[0].display_name, role: rows[0].role };
  }

  const { rows: b } = await pool.query<{ s: Date; e: Date }>(
    `SELECT ($1::date)::timestamp AT TIME ZONE 'Asia/Kolkata' AS s, ($2::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata' AS e`,
    [from, to],
  );
  const params = [who.username, who.name, b[0]!.s, b[0]!.e];

  const results = await Promise.all(
    SOURCES.map(async (src) => {
      try {
        const { rows } = await pool.query<{ at: Date; action: string; ref: string | null; amount: string | null; detail: string | null }>(
          `SELECT at, action, ref, amount, detail FROM (${src.sql}) q(at, action, ref, amount, detail) WHERE at IS NOT NULL
             -- Every source gets all four parameters; typed here, since not every source uses each one.
             AND $1::text IS NOT NULL AND $2::text IS NOT NULL AND $3::timestamptz IS NOT NULL AND $4::timestamptz IS NOT NULL`,
          params,
        );
        return rows.map((r): ProgressItem => ({
          at: new Date(r.at).toISOString(),
          category: src.category,
          action: r.action,
          ref: r.ref,
          amount: r.amount === null ? null : Number(r.amount),
          detail: r.detail,
        }));
      } catch (e) {
        // One source failing (e.g. a table not yet migrated) must not take the whole report down.
        console.error("Progress report source failed", src.category, e instanceof Error ? e.message : e);
        return [];
      }
    }),
  );
  const items = results.flat().sort((a, z) => (a.at < z.at ? 1 : -1));

  // Totals by category and by action, and day by day (India dates).
  const istDay = (iso: string) => new Date(new Date(iso).getTime() + 5.5 * 3600000).toISOString().slice(0, 10);
  const byCat = new Map<Category, { count: number; amount: number }>();
  const byAction = new Map<string, { category: Category; action: string; count: number; amount: number }>();
  const byDay = new Map<string, { count: number; amount: number }>();
  for (const i of items) {
    const amt = i.category === "collection" ? (i.amount ?? 0) : 0;
    const c = byCat.get(i.category) ?? { count: 0, amount: 0 };
    c.count++;
    c.amount += amt;
    byCat.set(i.category, c);
    // Group action labels that only differ by payment mode etc. under the label as written.
    const key = `${i.category}|${i.action}`;
    const a = byAction.get(key) ?? { category: i.category, action: i.action, count: 0, amount: 0 };
    a.count++;
    a.amount += amt;
    byAction.set(key, a);
    const d = istDay(i.at);
    const dd = byDay.get(d) ?? { count: 0, amount: 0 };
    dd.count++;
    dd.amount += amt;
    byDay.set(d, dd);
  }

  return {
    officer: who,
    from,
    to,
    summary: (Object.keys(CATEGORY_LABEL) as Category[]).map((k) => ({
      category: k,
      label: CATEGORY_LABEL[k],
      count: byCat.get(k)?.count ?? 0,
      amount: Math.round((byCat.get(k)?.amount ?? 0) * 100) / 100,
    })),
    byAction: [...byAction.values()]
      .map((a) => ({ ...a, amount: Math.round(a.amount * 100) / 100 }))
      .sort((a, z) => (a.category === z.category ? z.count - a.count : a.category < z.category ? -1 : 1)),
    days: [...byDay.entries()]
      .sort(([a], [z]) => (a < z ? 1 : -1))
      .map(([date, v]) => ({ date, count: v.count, amount: Math.round(v.amount * 100) / 100 })),
    items: items.slice(0, ITEM_LIMIT),
    truncated: items.length > ITEM_LIMIT,
    total: items.length,
  };
}
