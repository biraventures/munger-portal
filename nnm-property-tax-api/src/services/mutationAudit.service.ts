import { pool } from "../config/db";
import { ApiError } from "../utils/ApiError";
import { APPROVAL_STAGE_ORDER } from "../types/admin.types";

/**
 * Audit trail of one mutation case, oldest first: submission, holding identification, every stage's decision with its
 * comment (forwarded / sent back / rejected / finally approved), corrections and resubmissions, applicant edits and the
 * Tax Daroga's area verification - with the time the case spent at each desk.
 *
 * Built from the logs that already exist (change_request_approvals, entry_revert_events, the application's own
 * timestamps) plus mutation_audit_events for what those do not hold, so it also covers cases from before this audit
 * trail was added.
 */

export const DESK_LABEL: Record<string, string> = {
  tax_daroga: "Tax Daroga",
  mutation_nodal_clerk: "Mutation Nodal Clerk",
  deputy_commissioner: "Deputy Municipal Commissioner",
  commissioner: "Municipal Commissioner",
  correction: "Sent back for correction",
};

export type TimelineKind =
  | "submitted"
  | "holding_linked"
  | "not_accepted"
  | "entered_chain"
  | "forwarded"
  | "approved"
  | "rejected"
  | "sent_back"
  | "resubmitted"
  | "applicant_edited"
  | "area_verified";

export interface TimelineEvent {
  at: string;
  kind: TimelineKind;
  stage: string | null; // desk that acted (or received)
  actor: string;
  comment: string | null;
  details: Record<string, unknown> | null;
  /** For a decision: minutes the case was at that desk before it acted. */
  minutesAtDesk: number | null;
}

export interface DeskTime {
  desk: string;
  label: string;
  minutes: number;
  visits: number;
  ongoing: boolean;
}

export interface MutationTimeline {
  changeRequestId: string | null;
  applicationId: string | null;
  applicationNo: string | null;
  holdingNo: string | null;
  status: string;
  currentDesk: string | null;
  /** Since the current desk received it (pending only). */
  minutesAtCurrentDesk: number | null;
  totalMinutes: number;
  events: TimelineEvent[];
  deskTimes: DeskTime[];
}

interface AppRow {
  id: string;
  application_no: string | null;
  status: string;
  holding_no: string | null;
  applicant_name: string;
  submitted_at: Date | null;
  handled_by: string | null;
  handled_at: Date | null;
  handling_remarks: string | null;
  change_request_id: string | null;
}

interface CrRow {
  id: string;
  holding_no: string;
  requested_by: string;
  requested_at: Date;
  status: string;
  current_stage: string;
  final_stage: string;
  final_decided_at: Date | null;
  public_application_id: string | null;
}

const mins = (a: Date, b: Date) => Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));

export async function buildTimeline(ref: { changeRequestId?: string; applicationId?: string }): Promise<MutationTimeline> {
  let cr: CrRow | null = null;
  let app: AppRow | null = null;
  if (ref.changeRequestId) {
    const { rows } = await pool.query<CrRow>(`SELECT * FROM property_change_requests WHERE id = $1`, [ref.changeRequestId]);
    cr = rows[0] ?? null;
    if (!cr) throw ApiError.notFound("Mutation case not found.");
  }
  const appId = ref.applicationId ?? cr?.public_application_id ?? null;
  if (appId) {
    const { rows } = await pool.query<AppRow>(`SELECT * FROM mutation_applications WHERE id = $1 AND status <> 'draft'`, [appId]);
    app = rows[0] ?? null;
    if (!app && !cr) throw ApiError.notFound("Application not found.");
    if (app && !cr && app.change_request_id) {
      const { rows: c } = await pool.query<CrRow>(`SELECT * FROM property_change_requests WHERE id = $1`, [app.change_request_id]);
      cr = c[0] ?? null;
    }
  }

  const ev: (Omit<TimelineEvent, "at" | "minutesAtDesk"> & { at: Date; seq: number })[] = [];
  let seq = 0;
  const push = (e: Omit<TimelineEvent, "at" | "minutesAtDesk"> & { at: Date }) => ev.push({ ...e, seq: seq++ });

  if (app?.submitted_at) {
    push({ at: app.submitted_at, kind: "submitted", stage: null, actor: `${app.applicant_name} (applicant)`, comment: "Application submitted online", details: null });
    if (app.handled_at && app.status === "rejected") {
      push({ at: app.handled_at, kind: "not_accepted", stage: "tax_daroga", actor: app.handled_by ?? "Tax Daroga", comment: app.handling_remarks, details: null });
    } else if (app.handled_at && app.handled_by) {
      push({ at: app.handled_at, kind: "holding_linked", stage: "tax_daroga", actor: app.handled_by, comment: `Holding ${app.holding_no} identified and linked`, details: null });
    }
  }
  if (cr) {
    if (!app) push({ at: cr.requested_at, kind: "submitted", stage: null, actor: cr.requested_by, comment: "Mutation request raised", details: null });
    else push({ at: cr.requested_at, kind: "entered_chain", stage: "tax_daroga", actor: "System", comment: "Entered the mutation approval chain", details: null });

    const { rows: approvals } = await pool.query<{ stage: string; decision: string; admin_display_name: string; notes: string | null; decided_at: Date }>(
      `SELECT stage, decision, admin_display_name, notes, decided_at FROM change_request_approvals WHERE change_request_id = $1`,
      [cr.id],
    );
    for (const a of approvals) {
      const finalApproval = a.decision === "approved" && cr.status === "approved" && a.stage === cr.final_stage && cr.final_decided_at && Math.abs(cr.final_decided_at.getTime() - a.decided_at.getTime()) < 60000;
      push({
        at: a.decided_at,
        kind: a.decision === "rejected" ? "rejected" : finalApproval ? "approved" : "forwarded",
        stage: a.stage,
        actor: a.admin_display_name,
        comment: a.notes,
        details: null,
      });
    }
    const { rows: reverts } = await pool.query<{ reverted_by: string; reverted_from_stage: string; comment: string; reverted_at: Date; resubmitted_at: Date | null }>(
      `SELECT reverted_by, reverted_from_stage, comment, reverted_at, resubmitted_at FROM entry_revert_events WHERE entry_type = 'property_mutation' AND entry_id = $1`,
      [cr.id],
    );
    const { rows: audits } = await pool.query<{ event: string; stage: string | null; actor: string; comment: string | null; details: Record<string, unknown> | null; at: Date }>(
      `SELECT event, stage, actor, comment, details, at FROM mutation_audit_events
        WHERE change_request_id = $1 OR ($2::bigint IS NOT NULL AND application_id = $2::bigint)`,
      [cr.id, app?.id ?? null],
    );
    for (const r of reverts) {
      push({ at: r.reverted_at, kind: "sent_back", stage: r.reverted_from_stage, actor: r.reverted_by, comment: r.comment, details: null });
      if (r.resubmitted_at) {
        // Resubmitted by the applicant (online edit) or by an operator at the counter.
        const byApplicant = audits.some((x) => x.event === "applicant_resubmitted" && Math.abs(x.at.getTime() - r.resubmitted_at!.getTime()) < 60000);
        if (!byApplicant) push({ at: r.resubmitted_at, kind: "resubmitted", stage: "tax_daroga", actor: "Operator (counter)", comment: "Corrected and resubmitted", details: null });
      }
    }
    for (const x of audits) {
      push({
        at: x.at,
        kind: x.event === "applicant_resubmitted" ? "resubmitted" : (x.event as TimelineKind),
        stage: x.stage,
        actor: x.actor,
        comment: x.comment,
        details: x.details,
      });
    }
  } else if (app) {
    const { rows: audits } = await pool.query<{ event: string; stage: string | null; actor: string; comment: string | null; details: Record<string, unknown> | null; at: Date }>(
      `SELECT event, stage, actor, comment, details, at FROM mutation_audit_events WHERE application_id = $1`,
      [app.id],
    );
    for (const x of audits) push({ at: x.at, kind: x.event as TimelineKind, stage: x.stage, actor: x.actor, comment: x.comment, details: x.details });
  }

  ev.sort((a, b) => a.at.getTime() - b.at.getTime() || a.seq - b.seq);

  // Walk the events to see which desk held the case and for how long.
  const now = new Date();
  const desk = new Map<string, DeskTime>();
  const addTime = (d: string, m: number, ongoing = false) => {
    const t = desk.get(d) ?? { desk: d, label: DESK_LABEL[d] ?? d, minutes: 0, visits: 0, ongoing: false };
    t.minutes += m;
    t.visits += 1;
    t.ongoing = t.ongoing || ongoing;
    desk.set(d, t);
  };
  let holder: string | null = null;
  let since: Date | null = null;
  const out: TimelineEvent[] = [];
  for (const e of ev) {
    let minutesAtDesk: number | null = null;
    const close = () => {
      if (holder && since) {
        minutesAtDesk = mins(since, e.at);
        addTime(holder, minutesAtDesk);
      }
    };
    switch (e.kind) {
      case "submitted":
        holder = "tax_daroga";
        since = e.at;
        break;
      case "holding_linked":
        close();
        holder = "tax_daroga";
        since = e.at;
        break;
      case "entered_chain":
        if (!holder) {
          holder = "tax_daroga";
          since = e.at;
        }
        break;
      case "forwarded": {
        close();
        const i = APPROVAL_STAGE_ORDER.indexOf(e.stage as (typeof APPROVAL_STAGE_ORDER)[number]);
        holder = APPROVAL_STAGE_ORDER[i + 1] ?? null;
        since = e.at;
        break;
      }
      case "sent_back":
        close();
        holder = "correction";
        since = e.at;
        break;
      case "resubmitted":
        close();
        holder = "tax_daroga";
        since = e.at;
        break;
      case "approved":
      case "rejected":
      case "not_accepted":
        close();
        holder = null;
        since = null;
        break;
      default:
        break; // edits and verifications happen within a desk's time
    }
    out.push({ at: e.at.toISOString(), kind: e.kind, stage: e.stage, actor: e.actor, comment: e.comment, details: e.details, minutesAtDesk });
  }
  let minutesAtCurrentDesk: number | null = null;
  if (holder && since) {
    minutesAtCurrentDesk = mins(since, now);
    addTime(holder, minutesAtCurrentDesk, true);
  }

  const first = ev[0]?.at ?? now;
  const last = holder ? now : ev[ev.length - 1]?.at ?? now;
  const status = cr ? cr.status : app?.status === "rejected" ? "not_accepted" : app?.status === "awaiting_holding" ? "awaiting_holding" : "pending";
  const order = ["tax_daroga", "mutation_nodal_clerk", "deputy_commissioner", "commissioner", "correction"];
  return {
    changeRequestId: cr?.id ?? null,
    applicationId: app?.id ?? null,
    applicationNo: app?.application_no ?? null,
    holdingNo: cr?.holding_no ?? app?.holding_no ?? null,
    status,
    currentDesk: holder,
    minutesAtCurrentDesk,
    totalMinutes: mins(first, last),
    events: out,
    deskTimes: [...desk.values()].sort((a, b) => order.indexOf(a.desk) - order.indexOf(b.desk)),
  };
}

/** The same trail for the public status page: desks and dates, no officer names; comments only where they concern the applicant. */
export function publicTimeline(t: MutationTimeline) {
  return {
    events: t.events
      .filter((e) => e.kind !== "area_verified")
      .map((e) => ({
        at: e.at,
        kind: e.kind,
        desk: e.stage ? DESK_LABEL[e.stage] ?? e.stage : null,
        comment: ["sent_back", "rejected", "not_accepted"].includes(e.kind) ? e.comment : e.kind === "applicant_edited" ? e.comment : null,
        minutesAtDesk: e.minutesAtDesk,
      })),
    currentDesk: t.currentDesk ? DESK_LABEL[t.currentDesk] ?? t.currentDesk : null,
    minutesAtCurrentDesk: t.minutesAtCurrentDesk,
  };
}

/**
 * Mutation dashboard: what is waiting at each desk (and who holds that login), with the oldest waiting time.
 * Online applications whose holding is still to be identified wait with the Tax Daroga; cases sent back wait for
 * correction (operator at the counter, or the applicant online).
 */
export async function pendingSummary() {
  const { rows } = await pool.query<{ current_stage: string; mutations: number; other: number; oldest: Date | null }>(
    `WITH p AS (
       SELECT c.current_stage, c.approval_tier,
              GREATEST(c.requested_at,
                       (SELECT max(decided_at) FROM change_request_approvals a WHERE a.change_request_id = c.id),
                       (SELECT max(resubmitted_at) FROM entry_revert_events r WHERE r.entry_type = 'property_mutation' AND r.entry_id = c.id)) AS arrived
         FROM property_change_requests c WHERE c.status = 'pending')
     SELECT current_stage,
            count(*) FILTER (WHERE approval_tier = 'mutation')::int AS mutations,
            count(*) FILTER (WHERE approval_tier <> 'mutation')::int AS other,
            min(arrived) FILTER (WHERE approval_tier = 'mutation') AS oldest
       FROM p GROUP BY current_stage`,
  );
  const { rows: logins } = await pool.query<{ role: string; display_name: string; username: string }>(
    `SELECT role, display_name, username FROM admins WHERE active AND role = ANY($1::text[]) ORDER BY display_name`,
    [APPROVAL_STAGE_ORDER],
  );
  const { rows: extra } = await pool.query<{ awaiting_holding: number; awaiting_since: Date | null; reverted_online: number; reverted_counter: number; reverted_since: Date | null }>(
    `SELECT (SELECT count(*)::int FROM mutation_applications WHERE status = 'awaiting_holding') AS awaiting_holding,
            (SELECT min(submitted_at) FROM mutation_applications WHERE status = 'awaiting_holding') AS awaiting_since,
            (SELECT count(*)::int FROM property_change_requests WHERE status = 'reverted' AND approval_tier = 'mutation' AND public_application_id IS NOT NULL) AS reverted_online,
            (SELECT count(*)::int FROM property_change_requests WHERE status = 'reverted' AND approval_tier = 'mutation' AND public_application_id IS NULL) AS reverted_counter,
            (SELECT min(reverted_at) FROM property_change_requests WHERE status = 'reverted' AND approval_tier = 'mutation') AS reverted_since`,
  );
  const now = Date.now();
  const age = (d: Date | null) => (d ? Math.round((now - d.getTime()) / 60000) : null);
  return {
    desks: APPROVAL_STAGE_ORDER.map((stage) => {
      const r = rows.find((x) => x.current_stage === stage);
      return {
        stage,
        label: DESK_LABEL[stage],
        logins: logins.filter((l) => l.role === stage).map((l) => l.display_name),
        mutations: r?.mutations ?? 0,
        otherChanges: r?.other ?? 0,
        oldestMinutes: age(r?.oldest ?? null),
      };
    }),
    awaitingHolding: { count: extra[0]?.awaiting_holding ?? 0, oldestMinutes: age(extra[0]?.awaiting_since ?? null) },
    sentBack: { online: extra[0]?.reverted_online ?? 0, counter: extra[0]?.reverted_counter ?? 0, oldestMinutes: age(extra[0]?.reverted_since ?? null) },
  };
}

export async function recordAuditEvent(e: {
  changeRequestId?: string | number | null;
  applicationId?: string | number | null;
  event: "applicant_edited" | "applicant_resubmitted" | "area_verified";
  stage?: string | null;
  actor: string;
  actorRole?: string | null;
  comment?: string | null;
  details?: Record<string, unknown> | null;
}): Promise<void> {
  await pool.query(
    `INSERT INTO mutation_audit_events (change_request_id, application_id, event, stage, actor, actor_role, comment, details) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [e.changeRequestId ?? null, e.applicationId ?? null, e.event, e.stage ?? null, e.actor, e.actorRole ?? null, e.comment ?? null, e.details ? JSON.stringify(e.details) : null],
  );
}
