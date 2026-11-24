import { pool } from "../config/db";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import { signDocument, verifyDocumentSignature } from "../utils/verificationSignature";
import type { AdminTokenPayload } from "../types/admin.types";

/**
 * Electric crematorium tickets. Each Crematorium Counter login cuts one ticket per cremation - the deceased, the
 * informant (name, relation to the deceased, address, phone), the date and time of cremation - for the fee the
 * Municipal Commissioner sets, paid in cash or on the bank POS (the POS slip's approval code / RRN is recorded). The
 * ticket is printed with a QR code that anyone can scan to check it is genuine.
 *
 * Crematorium Prabhari: watches every counter and ticket and can cancel a ticket with a reason. Municipal Commissioner:
 * sets the fee; with the DMC and City Manager also sees the report.
 */

const MONITORS = ["crematorium_prabhari", "commissioner", "deputy_commissioner", "city_manager"] as const;
const isMonitor = (u: AdminTokenPayload) => (MONITORS as readonly string[]).includes(u.role);
/** A counter can cancel its own ticket this long after cutting it (a wrong entry); later only the Prabhari / MC can. */
const COUNTER_CANCEL_MIN = 30;
const TODAY = `(now() AT TIME ZONE 'Asia/Kolkata')::date`;

export type PaymentMode = "cash" | "pos_card" | "pos_upi";
export const MODE_LABEL: Record<PaymentMode, string> = { cash: "Cash", pos_card: "Card (POS)", pos_upi: "UPI (POS)" };
const r2 = (n: number) => Math.round(n * 100) / 100;

interface TicketRow {
  id: string;
  ticket_no: string;
  deceased_name: string;
  informant_name: string;
  informant_relation: string;
  informant_address: string;
  informant_phone: string;
  cremation_date: string;
  cremation_time: string;
  remarks: string | null;
  amount: string;
  payment_mode: PaymentMode;
  pos_reference: string | null;
  status: "issued" | "cancelled";
  issued_by: string;
  issued_by_name: string | null;
  created_at: Date;
  cancelled_at: Date | null;
  cancelled_by_name: string | null;
  cancel_reason: string | null;
}

const SELECT = `SELECT id, ticket_no, deceased_name, informant_name, informant_relation, informant_address, informant_phone,
       to_char(cremation_date, 'YYYY-MM-DD') AS cremation_date, to_char(cremation_time, 'HH24:MI') AS cremation_time, remarks,
       amount, payment_mode, pos_reference, status, issued_by, issued_by_name, created_at, cancelled_at, cancelled_by_name, cancel_reason
  FROM crematorium_tickets`;

const ist = (d: Date | null) =>
  d
    ? d.toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
    : null;

export function ticketVerifyUrl(ticketNo: string): string {
  const base = (env.FRONTEND_URL || "").replace(/\/+$/, "");
  return `${base}/verify/cremation/${encodeURIComponent(ticketNo)}?sig=${signDocument("cremation-ticket", ticketNo)}`;
}

function view(t: TicketRow) {
  return {
    id: Number(t.id),
    ticketNo: t.ticket_no,
    deceasedName: t.deceased_name,
    informantName: t.informant_name,
    informantRelation: t.informant_relation,
    informantAddress: t.informant_address,
    informantPhone: t.informant_phone,
    cremationDate: t.cremation_date,
    cremationTime: t.cremation_time,
    remarks: t.remarks,
    amount: Number(t.amount),
    paymentMode: t.payment_mode,
    paymentModeLabel: MODE_LABEL[t.payment_mode],
    posReference: t.pos_reference,
    status: t.status,
    issuedBy: t.issued_by,
    issuedByName: t.issued_by_name,
    issuedAt: t.created_at,
    issuedAtText: ist(t.created_at),
    cancelledAt: t.cancelled_at,
    cancelledAtText: ist(t.cancelled_at),
    cancelledByName: t.cancelled_by_name,
    cancelReason: t.cancel_reason,
    verifyUrl: ticketVerifyUrl(t.ticket_no),
  };
}
export type CremationTicketView = ReturnType<typeof view>;

function assertCounter(u: AdminTokenPayload) {
  if (u.role !== "crematorium_counter") throw new ApiError(403, "Only a Crematorium Counter login cuts tickets.");
}
function assertMonitor(u: AdminTokenPayload) {
  if (!isMonitor(u)) throw new ApiError(403, "Not allowed.");
}

// ---------- fee (Municipal Commissioner) ----------

export async function currentFee(): Promise<{ amount: number; setAt: Date; setByName: string | null } | null> {
  const { rows } = await pool.query<{ amount: string; set_at: Date; set_by_name: string | null }>(
    `SELECT amount, set_at, set_by_name FROM crematorium_fees ORDER BY set_at DESC, id DESC LIMIT 1`,
  );
  return rows[0] ? { amount: Number(rows[0].amount), setAt: rows[0].set_at, setByName: rows[0].set_by_name } : null;
}

export async function feeHistory(u: AdminTokenPayload) {
  assertMonitor(u);
  const { rows } = await pool.query(
    `SELECT amount::float8 AS amount, remarks, set_by_name, set_at FROM crematorium_fees ORDER BY set_at DESC, id DESC LIMIT 50`,
  );
  return rows;
}

export async function setFee(u: AdminTokenPayload, amount: number, remarks: string | null) {
  if (u.role !== "commissioner") throw new ApiError(403, "Only the Municipal Commissioner sets the cremation fee.");
  if (!Number.isFinite(amount) || amount < 0 || amount > 100000) throw ApiError.badRequest("Enter a valid fee.");
  await pool.query(`INSERT INTO crematorium_fees (amount, remarks, set_by, set_by_name) VALUES ($1, $2, $3, $4)`, [
    r2(amount),
    remarks?.trim() || null,
    u.username,
    u.displayName,
  ]);
}

// ---------- counter ----------

export interface TicketInput {
  deceasedName: string;
  informantName: string;
  informantRelation: string;
  informantAddress: string;
  informantPhone: string;
  cremationDate: string; // YYYY-MM-DD
  cremationTime: string; // HH:MM
  remarks?: string | null;
  paymentMode: PaymentMode;
  posReference?: string | null;
}

/** The counter's fee and its own tickets today. */
export async function counterToday(u: AdminTokenPayload) {
  assertCounter(u);
  const fee = await currentFee();
  const { rows } = await pool.query<TicketRow>(
    `${SELECT} WHERE issued_by = $1 AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = ${TODAY} ORDER BY created_at DESC`,
    [u.username],
  );
  const tickets = rows.map(view);
  const valid = tickets.filter((t) => t.status === "issued");
  const sum = (m?: PaymentMode) => r2(valid.filter((t) => !m || t.paymentMode === m).reduce((s, t) => s + t.amount, 0));
  return {
    fee: fee?.amount ?? null,
    cancelWindowMinutes: COUNTER_CANCEL_MIN,
    today: {
      tickets: valid.length,
      amount: sum(),
      cash: sum("cash"),
      posCard: sum("pos_card"),
      posUpi: sum("pos_upi"),
      cancelled: tickets.length - valid.length,
    },
    tickets,
  };
}

export async function cutTicket(u: AdminTokenPayload, input: TicketInput) {
  assertCounter(u);
  const fee = await currentFee();
  if (!fee) throw ApiError.badRequest("The cremation fee has not been set yet - ask the Municipal Commissioner's office.");
  const pos = input.paymentMode === "pos_card" || input.paymentMode === "pos_upi";
  const ref = input.posReference?.trim() || null;
  if (pos && (!ref || ref.length < 4)) throw ApiError.badRequest("Enter the approval code / RRN printed on the bank POS slip.");
  // The cremation is today or recently (an entry made after the event) - not a future booking.
  const { rows: d } = await pool.query<{ ok: boolean }>(`SELECT ($1::date BETWEEN ${TODAY} - 7 AND ${TODAY}) AS ok`, [input.cremationDate]);
  if (!d[0]?.ok) throw ApiError.badRequest("The cremation date must be today or within the last 7 days.");
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO crematorium_tickets (ticket_no, deceased_name, informant_name, informant_relation, informant_address, informant_phone,
                                      cremation_date, cremation_time, remarks, amount, payment_mode, pos_reference, issued_by, issued_by_name)
     VALUES ('CR-' || to_char(${TODAY}, 'YYMMDD') || '-' || lpad(nextval('crematorium_ticket_seq')::text, 5, '0'),
             $1, $2, $3, $4, $5, $6::date, $7::time, $8, $9, $10, $11, $12, $13)
     RETURNING id`,
    [
      input.deceasedName.trim(),
      input.informantName.trim(),
      input.informantRelation.trim(),
      input.informantAddress.trim(),
      input.informantPhone.trim(),
      input.cremationDate,
      input.cremationTime,
      input.remarks?.trim() || null,
      fee.amount,
      input.paymentMode,
      pos ? ref : null,
      u.username,
      u.displayName,
    ],
  );
  return ticketById(u, Number(rows[0]!.id));
}

export async function ticketById(u: AdminTokenPayload, id: number) {
  const { rows } = await pool.query<TicketRow>(`${SELECT} WHERE id = $1`, [id]);
  const t = rows[0];
  if (!t) throw ApiError.notFound("Ticket not found.");
  // A counter sees (and reprints) its own tickets; the Prabhari and officers see all.
  if (!isMonitor(u) && !(u.role === "crematorium_counter" && t.issued_by === u.username)) throw new ApiError(403, "Not allowed.");
  return view(t);
}

export async function cancelTicket(u: AdminTokenPayload, id: number, reason: string) {
  const { rows } = await pool.query<{ status: string; issued_by: string; created_at: Date }>(
    `SELECT status, issued_by, created_at FROM crematorium_tickets WHERE id = $1`,
    [id],
  );
  const t = rows[0];
  if (!t) throw ApiError.notFound("Ticket not found.");
  const ownCounter = u.role === "crematorium_counter" && t.issued_by === u.username;
  const canCancel = ownCounter || u.role === "crematorium_prabhari" || u.role === "commissioner";
  if (!canCancel)
    throw new ApiError(403, "Only the counter that cut it, the Crematorium Prabhari or the Municipal Commissioner can cancel a ticket.");
  if (t.status !== "issued") throw ApiError.badRequest("This ticket is already cancelled.");
  if (ownCounter && Date.now() - t.created_at.getTime() > COUNTER_CANCEL_MIN * 60_000)
    throw ApiError.badRequest(`The counter can cancel a ticket only within ${COUNTER_CANCEL_MIN} minutes - ask the Crematorium Prabhari.`);
  if (reason.trim().length < 3) throw ApiError.badRequest("Write the reason for cancelling.");
  await pool.query(
    `UPDATE crematorium_tickets SET status = 'cancelled', cancelled_at = now(), cancelled_by = $2, cancelled_by_name = $3, cancel_reason = $4
      WHERE id = $1 AND status = 'issued'`,
    [id, u.username, u.displayName, reason.trim()],
  );
}

// ---------- Prabhari / officers ----------

/** Tickets of a period (by cremation date), with totals by counter and by payment mode. */
export async function report(u: AdminTokenPayload, from: string, to: string, q: string | null, counter: string | null) {
  assertMonitor(u);
  const params: unknown[] = [from, to];
  const where = [`cremation_date BETWEEN $1::date AND $2::date`];
  if (counter) {
    params.push(counter);
    where.push(`issued_by = $${params.length}`);
  }
  if (q?.trim()) {
    params.push(`%${q.trim().replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
    const n = params.length;
    where.push(`(ticket_no ILIKE $${n} OR deceased_name ILIKE $${n} OR informant_name ILIKE $${n} OR informant_phone ILIKE $${n})`);
  }
  const { rows } = await pool.query<TicketRow>(
    `${SELECT} WHERE ${where.join(" AND ")} ORDER BY cremation_date DESC, cremation_time DESC, id DESC LIMIT 1000`,
    params,
  );
  const tickets = rows.map(view);
  const valid = tickets.filter((t) => t.status === "issued");
  const byCounter = new Map<
    string,
    { username: string; name: string | null; tickets: number; amount: number; cash: number; pos: number }
  >();
  for (const t of valid) {
    const c = byCounter.get(t.issuedBy) ?? { username: t.issuedBy, name: t.issuedByName, tickets: 0, amount: 0, cash: 0, pos: 0 };
    c.tickets += 1;
    c.amount = r2(c.amount + t.amount);
    if (t.paymentMode === "cash") c.cash = r2(c.cash + t.amount);
    else c.pos = r2(c.pos + t.amount);
    byCounter.set(t.issuedBy, c);
  }
  const sum = (m?: PaymentMode) => r2(valid.filter((t) => !m || t.paymentMode === m).reduce((s, t) => s + t.amount, 0));
  const { rows: counters } = await pool.query<{ username: string; display_name: string; active: boolean }>(
    `SELECT username, display_name, active FROM admins WHERE role = 'crematorium_counter' ORDER BY display_name`,
  );
  return {
    fee: await currentFee(),
    totals: {
      tickets: valid.length,
      amount: sum(),
      cash: sum("cash"),
      posCard: sum("pos_card"),
      posUpi: sum("pos_upi"),
      cancelled: tickets.length - valid.length,
    },
    byCounter: [...byCounter.values()].sort((a, b) => b.amount - a.amount),
    counters,
    tickets,
    truncated: rows.length === 1000,
  };
}

// ---------- public verification (QR on the printed ticket) ----------

export async function verifyTicket(ticketNo: string, sig: string) {
  if (!verifyDocumentSignature("cremation-ticket", ticketNo, sig))
    throw ApiError.notFound("Not a genuine cremation ticket of Munger Nagar Nigam.");
  const { rows } = await pool.query<TicketRow>(`${SELECT} WHERE ticket_no = $1`, [ticketNo]);
  const t = rows[0];
  if (!t) throw ApiError.notFound("Ticket not found.");
  // The informant's phone and address are not shown publicly.
  return {
    ticketNo: t.ticket_no,
    deceasedName: t.deceased_name,
    cremationDate: t.cremation_date,
    cremationTime: t.cremation_time,
    amount: Number(t.amount),
    status: t.status,
    issuedAtText: ist(t.created_at),
  };
}
