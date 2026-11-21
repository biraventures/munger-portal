import type { PoolClient } from "pg";
import { pool } from "../config/db";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import { signDocument, verifyDocumentSignature } from "../utils/verificationSignature";
import type { AdminTokenPayload } from "../types/admin.types";

/**
 * Community hall bookings. The Municipal Commissioner sets each hall's rate options (small hall, big hall, garden only,
 * hall + garden ...) - each with a full-day rent, an optional half-day rent and its own refundable security deposit.
 * A member of the public picks an option and applies for whole days, or for one morning / evening slot (from tomorrow,
 * up to 6 months ahead). The same option cannot be held twice for the same slot; bookings of different options of a hall
 * on the same date are allowed but flagged for the officer deciding. The Community Hall Prabhari
 * (or the Commissioner) approves or rejects; an approved booking holds the dates until its payment due date. The
 * applicant pays rent + deposit - online through the halls' own gateway once it is set up (HALL_ONLINE_PAYMENT_ENABLED),
 * or at the Nagar Nigam office, where the Prabhari records the payment - and the booking is confirmed. Unpaid by the
 * due date, it expires and the dates are free again. After the function the deposit is settled: refunded in full, or
 * with a deduction and its reason. Every step is kept in the booking's events.
 *
 * DMC and City Manager: view only.
 */

const DECIDERS = ["community_hall_prabhari", "commissioner"] as const;
const VIEWERS = [...DECIDERS, "deputy_commissioner", "city_manager"] as const;
const canDecide = (u: AdminTokenPayload) => (DECIDERS as readonly string[]).includes(u.role);
const canView = (u: AdminTokenPayload) => (VIEWERS as readonly string[]).includes(u.role);

const TODAY = `(now() AT TIME ZONE 'Asia/Kolkata')::date`;
const MAX_DAYS = 15;
const MAX_AHEAD_DAYS = 180;
/** Days an approved booking waits for payment (at most until the day before the function). */
const PAY_WITHIN_DAYS = 7;
/** Open applications one mobile number may have at a time. */
const MAX_OPEN_PER_PHONE = 3;
/** Bookings that hold their dates: approved (awaiting payment, not overdue) or confirmed. */
const HOLDS = `(status = 'confirmed' OR (status = 'approved' AND payment_due_date >= ${TODAY}))`;

export type HallSlot = "full_day" | "morning" | "evening";
export const SLOT_LABEL: Record<HallSlot, string> = { full_day: "Full day", morning: "Morning (half day)", evening: "Evening (half day)" };
/** SQL: slot column `col` overlaps the slot in parameter `$p` (a full day overlaps both halves). */
const slotsOverlap = (col: string, p: string) => `(${col} = 'full_day' OR ${p}::text = 'full_day' OR ${col} = ${p}::text)`;

export type OfficePaymentMode = "cash" | "pos_card" | "pos_upi" | "dd";
const MODE_LABEL: Record<string, string> = {
  cash: "Cash",
  pos_card: "Card (POS)",
  pos_upi: "UPI (POS)",
  dd: "Demand Draft",
  online: "Online",
};
export const STATUS_LABEL: Record<string, string> = {
  applied: "Applied - awaiting approval",
  approved: "Approved - awaiting payment",
  confirmed: "Confirmed",
  rejected: "Rejected",
  cancelled: "Cancelled",
  expired: "Expired - not paid in time",
};

const r2 = (n: number) => Math.round(n * 100) / 100;

function assertDecider(u: AdminTokenPayload) {
  if (!canDecide(u)) throw new ApiError(403, "Only the Community Hall Prabhari or the Municipal Commissioner can do this.");
}
function assertViewer(u: AdminTokenPayload) {
  if (!canView(u)) throw new ApiError(403, "Not allowed.");
}

/** Approved bookings not paid by their due date expire - run before anything that reads or changes bookings. */
async function expireOverdue(db: Pick<PoolClient, "query"> = pool) {
  await db.query(
    `UPDATE hall_bookings SET status = 'expired',
            events = events || jsonb_build_array(jsonb_build_object('at', now(), 'action', 'expired', 'by', 'System',
                                                                    'note', 'Not paid by ' || to_char(payment_due_date, 'DD-MM-YYYY')))
      WHERE status = 'approved' AND payment_due_date < ${TODAY}`,
  );
}

function event(action: string, u: AdminTokenPayload | null, note?: string | null) {
  return JSON.stringify([
    { at: new Date().toISOString(), action, by: u?.displayName ?? "Applicant", role: u?.role ?? "public", note: note ?? null },
  ]);
}

export function bookingLink(bookingNo: string, phone: string): string {
  const base = (env.FRONTEND_URL || "").replace(/\/+$/, "");
  return `${base}/community-halls/booking?no=${encodeURIComponent(bookingNo)}&sig=${signDocument("hall-booking", `${bookingNo}:${phone}`)}`;
}

// ---------- halls (Municipal Commissioner) ----------

export interface HallInput {
  name: string;
  nameHi?: string | null;
  address?: string | null;
  capacity?: number | null;
  facilities?: string | null;
  options: RateOptionInput[];
  active?: boolean;
}
export interface RateOptionInput {
  /** An existing option's id; omitted for a new one. Existing options left out are withdrawn (kept for old bookings). */
  id?: number;
  name: string;
  nameHi?: string | null;
  fullDayRent: number;
  /** Null when the option is not let for half a day. */
  halfDayRent?: number | null;
  securityDeposit: number;
}

const HALL_COLS = `id, name, name_hi, address, capacity, facilities, daily_rent::float8 AS daily_rent, security_deposit::float8 AS security_deposit, active`;
const OPTION_COLS = `id, hall_id, name, name_hi, full_day_rent::float8 AS full_day_rent, half_day_rent::float8 AS half_day_rent,
                     security_deposit::float8 AS security_deposit`;

interface OptionRow {
  id: number;
  hall_id: number;
  name: string;
  name_hi: string | null;
  full_day_rent: number;
  half_day_rent: number | null;
  security_deposit: number;
}
const optionView = (o: OptionRow) => ({
  id: o.id,
  name: o.name,
  nameHi: o.name_hi,
  fullDayRent: o.full_day_rent,
  halfDayRent: o.half_day_rent,
  securityDeposit: o.security_deposit,
});

/** Halls with their active rate options. */
async function hallsWithOptions(where: string) {
  const { rows: halls } = await pool.query(`SELECT ${HALL_COLS} FROM community_halls ${where} ORDER BY name`);
  const { rows: opts } = await pool.query<OptionRow>(`SELECT ${OPTION_COLS} FROM hall_rate_options WHERE active ORDER BY sort_order, id`);
  return halls.map((h) => ({ ...h, options: opts.filter((o) => o.hall_id === h.id).map(optionView) }));
}

export async function listHalls(u: AdminTokenPayload) {
  assertViewer(u);
  return hallsWithOptions("");
}

function checkOptions(options: RateOptionInput[]) {
  if (!options.length) throw ApiError.badRequest("Add at least one rate option (e.g. Full hall).");
  const names = options.map((o) => o.name.trim().toLowerCase());
  if (names.some((n) => !n)) throw ApiError.badRequest("Every rate option needs a name.");
  if (new Set(names).size !== names.length) throw ApiError.badRequest("Two rate options have the same name.");
}

/** Saves the hall's options: updates those with an id, adds the new ones, withdraws the rest. Keeps the hall's "from" rent and deposit. */
async function saveOptions(c: PoolClient, hallId: number, options: RateOptionInput[]) {
  const keep: number[] = [];
  // Withdraw first, so a renamed / re-added name does not collide with the unique-name index.
  const ids = options.filter((o) => o.id).map((o) => o.id!);
  await c.query(
    `UPDATE hall_rate_options SET active = false, updated_at = now() WHERE hall_id = $1 AND active AND NOT (id = ANY($2::int[]))`,
    [hallId, ids],
  );
  for (const [i, o] of options.entries()) {
    const vals = [
      hallId,
      o.name.trim(),
      o.nameHi?.trim() || null,
      r2(o.fullDayRent),
      o.halfDayRent == null ? null : r2(o.halfDayRent),
      r2(o.securityDeposit),
      i,
    ];
    if (o.id) {
      const { rowCount } = await c.query(
        `UPDATE hall_rate_options SET name = $2, name_hi = $3, full_day_rent = $4, half_day_rent = $5, security_deposit = $6, sort_order = $7,
                active = true, updated_at = now() WHERE id = $8 AND hall_id = $1`,
        [...vals, o.id],
      );
      if (!rowCount) throw ApiError.badRequest("A rate option does not belong to this hall.");
      keep.push(o.id);
    } else {
      const { rows } = await c.query<{ id: number }>(
        `INSERT INTO hall_rate_options (hall_id, name, name_hi, full_day_rent, half_day_rent, security_deposit, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        vals,
      );
      keep.push(rows[0]!.id);
    }
  }
  await c.query(
    `UPDATE community_halls h SET daily_rent = o.rent, security_deposit = o.dep
       FROM (SELECT min(full_day_rent) AS rent, min(security_deposit) AS dep FROM hall_rate_options WHERE hall_id = $1 AND active) o
      WHERE h.id = $1`,
    [hallId],
  );
}

async function inTx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const out = await fn(c);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => undefined);
    if ((e as { code?: string }).code === "23505")
      throw ApiError.badRequest("A hall (or a rate option of this hall) with this name already exists.");
    throw e;
  } finally {
    c.release();
  }
}

function assertCommissioner(u: AdminTokenPayload) {
  if (u.role !== "commissioner") throw new ApiError(403, "Only the Municipal Commissioner manages the halls and their rent.");
}

export async function createHall(u: AdminTokenPayload, h: HallInput) {
  assertCommissioner(u);
  checkOptions(h.options);
  return inTx(async (pool) => {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO community_halls (name, name_hi, address, capacity, facilities, daily_rent, security_deposit, active, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [
        h.name.trim(),
        h.nameHi?.trim() || null,
        h.address?.trim() || null,
        h.capacity ?? null,
        h.facilities?.trim() || null,
        0,
        0,
        h.active ?? true,
        u.username,
      ],
    );
    await saveOptions(pool, rows[0]!.id, h.options);
    return { id: rows[0]!.id };
  });
}

export async function updateHall(u: AdminTokenPayload, id: number, h: HallInput) {
  assertCommissioner(u);
  checkOptions(h.options);
  // Bookings already made keep the option, rent and deposit they were made at.
  await inTx(async (c) => {
    const { rowCount } = await c.query(
      `UPDATE community_halls SET name = $2, name_hi = $3, address = $4, capacity = $5, facilities = $6, active = $7, updated_at = now() WHERE id = $1`,
      [
        id,
        h.name.trim(),
        h.nameHi?.trim() || null,
        h.address?.trim() || null,
        h.capacity ?? null,
        h.facilities?.trim() || null,
        h.active ?? true,
      ],
    );
    if (!rowCount) throw ApiError.notFound("Hall not found.");
    await saveOptions(c, id, h.options);
  });
}

// ---------- public ----------

/** Active halls with their rate options and the dates already taken (next 6 months) - by option and slot. */
export async function publicHalls() {
  await expireOverdue();
  const halls = await hallsWithOptions("WHERE active");
  const { rows: taken } = await pool.query<{
    hall_id: number;
    from_date: string;
    to_date: string;
    option_id: number | null;
    slot: HallSlot;
  }>(
    `SELECT hall_id, to_char(from_date, 'YYYY-MM-DD') AS from_date, to_char(to_date, 'YYYY-MM-DD') AS to_date, rate_option_id AS option_id, slot
       FROM hall_bookings WHERE ${HOLDS} AND to_date >= ${TODAY} ORDER BY from_date`,
  );
  const { rows: d } = await pool.query<{ min: string; max: string }>(
    `SELECT to_char(${TODAY} + 1, 'YYYY-MM-DD') AS min, to_char(${TODAY} + ${MAX_AHEAD_DAYS}, 'YYYY-MM-DD') AS max`,
  );
  return {
    halls: halls
      .filter((h) => h.options.length > 0)
      .map((h) => ({
        ...h,
        taken: taken
          .filter((t) => t.hall_id === h.id)
          .map((t) => ({ from: t.from_date, to: t.to_date, optionId: t.option_id, slot: t.slot })),
      })),
    minDate: d[0]!.min,
    maxDate: d[0]!.max,
    maxDays: MAX_DAYS,
    onlinePayment: env.HALL_ONLINE_PAYMENT_ENABLED,
  };
}

export interface ApplicationInput {
  hallId: number;
  rateOptionId: number;
  /** full_day (default), or morning / evening for half a day (one date only). */
  slot?: HallSlot;
  fromDate: string;
  toDate: string;
  applicantName: string;
  applicantPhone: string;
  applicantAddress: string;
  purpose: string;
  expectedGuests?: number | null;
}

/** A booking holding the same option for an overlapping slot on any of these dates - that would be a double booking. */
async function overlapping(
  db: Pick<PoolClient, "query">,
  optionId: number | null,
  slot: HallSlot,
  from: string,
  to: string,
  exceptId?: number,
) {
  if (optionId === null) return null;
  const { rows } = await db.query<{ booking_no: string }>(
    `SELECT booking_no FROM hall_bookings WHERE rate_option_id = $1 AND ${HOLDS} AND from_date <= $3::date AND to_date >= $2::date AND id <> $4
        AND ${slotsOverlap("slot", "$5")} LIMIT 1`,
    [optionId, from, to, exceptId ?? 0, slot],
  );
  return rows[0]?.booking_no ?? null;
}

export async function apply(input: ApplicationInput) {
  await expireOverdue();
  const { rows: h } = await pool.query<{ id: number; name: string; daily_rent: string; security_deposit: string; active: boolean }>(
    `SELECT id, name, daily_rent, security_deposit, active FROM community_halls WHERE id = $1`,
    [input.hallId],
  );
  const hall = h[0];
  if (!hall || !hall.active) throw ApiError.badRequest("This hall is not open for booking.");
  const { rows: o } = await pool.query<OptionRow>(
    `SELECT ${OPTION_COLS} FROM hall_rate_options WHERE id = $1 AND hall_id = $2 AND active`,
    [input.rateOptionId, hall.id],
  );
  const option = o[0];
  if (!option) throw ApiError.badRequest("Choose one of the hall's booking options.");
  const slot: HallSlot = input.slot ?? "full_day";
  if (slot !== "full_day") {
    if (option.half_day_rent === null) throw ApiError.badRequest(`"${option.name}" is let only for the full day.`);
    if (input.fromDate !== input.toDate) throw ApiError.badRequest("A half-day booking is for one date only.");
  }
  const { rows: d } = await pool.query<{ days: number; ok_from: boolean; ok_to: boolean }>(
    `SELECT ($2::date - $1::date) + 1 AS days, $1::date >= ${TODAY} + 1 AS ok_from, $2::date <= ${TODAY} + ${MAX_AHEAD_DAYS} AS ok_to`,
    [input.fromDate, input.toDate],
  );
  const days = d[0]!.days;
  if (days < 1) throw ApiError.badRequest("The last day cannot be before the first day.");
  if (days > MAX_DAYS) throw ApiError.badRequest(`At most ${MAX_DAYS} days in one booking.`);
  if (!d[0]!.ok_from) throw ApiError.badRequest("Bookings start from tomorrow.");
  if (!d[0]!.ok_to) throw ApiError.badRequest("Bookings can be made up to 6 months ahead.");
  const clash = await overlapping(pool, option.id, slot, input.fromDate, input.toDate);
  if (clash)
    throw ApiError.badRequest(
      `"${option.name}"${slot === "full_day" ? "" : ` (${slot})`} is already booked on some of these dates - choose other dates or another option.`,
    );
  const { rows: open } = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM hall_bookings WHERE applicant_phone = $1 AND status IN ('applied', 'approved')`,
    [input.applicantPhone],
  );
  if ((open[0]?.n ?? 0) >= MAX_OPEN_PER_PHONE)
    throw ApiError.badRequest("This mobile number already has applications pending - wait for them to be decided.");

  // A half day: one date at the half-day rent (kept as the booking's "daily" rent, days = 1).
  const perDay = slot === "full_day" ? option.full_day_rent : option.half_day_rent!;
  const rent = r2(perDay * days);
  const deposit = option.security_deposit;
  const { rows } = await pool.query<{ booking_no: string }>(
    `INSERT INTO hall_bookings (booking_no, hall_id, from_date, to_date, days, applicant_name, applicant_phone, applicant_address, purpose,
                                expected_guests, daily_rent, rent_amount, deposit_amount, total_amount, events, rate_option_id, option_name, slot)
     VALUES ('CH-' || to_char(${TODAY}, 'YYMMDD') || '-' || lpad(nextval('hall_booking_seq')::text, 5, '0'),
             $1, $2::date, $3::date, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15, $16, $17)
     RETURNING booking_no`,
    [
      hall.id,
      input.fromDate,
      input.toDate,
      days,
      input.applicantName.trim(),
      input.applicantPhone,
      input.applicantAddress.trim(),
      input.purpose.trim(),
      input.expectedGuests ?? null,
      perDay,
      rent,
      deposit,
      r2(rent + deposit),
      event("applied", null, `${option.name} - ${SLOT_LABEL[slot]}`),
      option.id,
      option.name,
      slot,
    ],
  );
  const bookingNo = rows[0]!.booking_no;
  return { bookingNo, link: bookingLink(bookingNo, input.applicantPhone) };
}

interface BookingRow {
  id: string;
  booking_no: string;
  hall_id: number;
  hall_name: string;
  hall_name_hi: string | null;
  hall_address: string | null;
  from_date: string;
  to_date: string;
  days: number;
  applicant_name: string;
  applicant_phone: string;
  applicant_address: string;
  purpose: string;
  expected_guests: number | null;
  daily_rent: string;
  rent_amount: string;
  deposit_amount: string;
  total_amount: string;
  status: string;
  decided_at: Date | null;
  decided_by_name: string | null;
  decision_remarks: string | null;
  payment_due_date: string | null;
  paid_at: Date | null;
  payment_channel: string | null;
  payment_mode: string | null;
  payment_reference: string | null;
  payment_recorded_by: string | null;
  cancelled_at: Date | null;
  cancelled_by_name: string | null;
  cancel_reason: string | null;
  deposit_status: string;
  deposit_refunded: string | null;
  deposit_deducted: string | null;
  deposit_remarks: string | null;
  deposit_settled_at: Date | null;
  deposit_settled_by: string | null;
  events: unknown[];
  created_at: Date;
  event_over: boolean;
  rate_option_id: number | null;
  option_name: string | null;
  slot: HallSlot;
  /** Other live bookings (applied / approved / confirmed) of the hall on an overlapping date and slot. */
  overlap_count: number;
}

const BOOKING_SELECT = `SELECT b.*, to_char(b.from_date, 'YYYY-MM-DD') AS from_date, to_char(b.to_date, 'YYYY-MM-DD') AS to_date,
       to_char(b.payment_due_date, 'YYYY-MM-DD') AS payment_due_date, h.name AS hall_name, h.name_hi AS hall_name_hi, h.address AS hall_address,
       (b.to_date < ${TODAY}) AS event_over,
       (SELECT count(*)::int FROM hall_bookings x
         WHERE x.hall_id = b.hall_id AND x.id <> b.id AND x.status IN ('applied', 'approved', 'confirmed')
           AND x.from_date <= b.to_date AND x.to_date >= b.from_date AND ${slotsOverlap("x.slot", "b.slot")}) AS overlap_count
  FROM hall_bookings b JOIN community_halls h ON h.id = b.hall_id`;

function view(b: BookingRow) {
  return {
    id: Number(b.id),
    bookingNo: b.booking_no,
    hallId: b.hall_id,
    hallName: b.hall_name,
    hallNameHi: b.hall_name_hi,
    hallAddress: b.hall_address,
    rateOptionId: b.rate_option_id,
    optionName: b.option_name,
    slot: b.slot,
    slotLabel: SLOT_LABEL[b.slot] ?? b.slot,
    fromDate: b.from_date,
    toDate: b.to_date,
    days: b.days,
    applicantName: b.applicant_name,
    applicantPhone: b.applicant_phone,
    applicantAddress: b.applicant_address,
    purpose: b.purpose,
    expectedGuests: b.expected_guests,
    dailyRent: Number(b.daily_rent),
    rentAmount: Number(b.rent_amount),
    depositAmount: Number(b.deposit_amount),
    totalAmount: Number(b.total_amount),
    status: b.status,
    statusLabel: STATUS_LABEL[b.status] ?? b.status,
    decidedAt: b.decided_at,
    decidedByName: b.decided_by_name,
    decisionRemarks: b.decision_remarks,
    paymentDueDate: b.payment_due_date,
    paidAt: b.paid_at,
    paymentChannel: b.payment_channel,
    paymentMode: b.payment_mode,
    paymentModeLabel: b.payment_mode ? (MODE_LABEL[b.payment_mode] ?? b.payment_mode) : null,
    paymentReference: b.payment_reference,
    paymentRecordedBy: b.payment_recorded_by,
    cancelledAt: b.cancelled_at,
    cancelledByName: b.cancelled_by_name,
    cancelReason: b.cancel_reason,
    depositStatus: b.deposit_status,
    depositRefunded: b.deposit_refunded === null ? null : Number(b.deposit_refunded),
    depositDeducted: b.deposit_deducted === null ? null : Number(b.deposit_deducted),
    depositRemarks: b.deposit_remarks,
    depositSettledAt: b.deposit_settled_at,
    depositSettledBy: b.deposit_settled_by,
    eventOver: b.event_over,
    overlapCount: ["applied", "approved", "confirmed"].includes(b.status) ? b.overlap_count : 0,
    events: b.events,
    appliedAt: b.created_at,
  };
}
export type HallBookingView = ReturnType<typeof view>;

/** The applicant's view of a booking - by its link (signed with the mobile number) or booking no. + mobile. */
export async function publicBooking(bookingNo: string, auth: { sig?: string; phone?: string }) {
  await expireOverdue();
  const { rows } = await pool.query<BookingRow>(`${BOOKING_SELECT} WHERE b.booking_no = $1`, [bookingNo.trim().toUpperCase()]);
  const b = rows[0];
  const ok =
    !!b &&
    (auth.sig
      ? verifyDocumentSignature("hall-booking", `${b.booking_no}:${b.applicant_phone}`, auth.sig)
      : auth.phone === b.applicant_phone);
  if (!b || !ok) throw ApiError.notFound("No booking found for this booking number and mobile number.");
  const v = view(b);
  // Officers' internal notes and the audit trail stay inside the office.
  return {
    ...v,
    events: undefined,
    overlapCount: undefined,
    link: bookingLink(b.booking_no, b.applicant_phone),
    onlinePayment: env.HALL_ONLINE_PAYMENT_ENABLED && b.status === "approved",
  };
}

/**
 * Online payment through the halls' own gateway (kept apart from the property tax gateway). Off until that gateway is
 * integrated - the applicant pays at the office meanwhile.
 */
export async function startOnlinePayment(bookingNo: string, phone: string) {
  const b = await publicBooking(bookingNo, { phone });
  if (b.status !== "approved") throw ApiError.badRequest("This booking is not awaiting payment.");
  if (!env.HALL_ONLINE_PAYMENT_ENABLED)
    throw new ApiError(503, "Online payment for community halls is not available yet - please pay at the Nagar Nigam office.");
  throw new ApiError(503, "Online payment for community halls is being set up - please pay at the Nagar Nigam office.");
}

// ---------- office (Community Hall Prabhari / Commissioner; DMC and City Manager view) ----------

export async function listBookings(u: AdminTokenPayload, f: { status?: string; hallId?: number; q?: string }) {
  assertViewer(u);
  await expireOverdue();
  const params: unknown[] = [];
  const where: string[] = [];
  if (f.status === "upcoming") where.push(`b.status = 'confirmed' AND b.to_date >= ${TODAY}`);
  else if (f.status === "deposit") where.push(`b.status = 'confirmed' AND b.deposit_status = 'held' AND b.to_date < ${TODAY}`);
  else if (f.status && f.status !== "all") {
    params.push(f.status);
    where.push(`b.status = $${params.length}`);
  }
  if (f.hallId) {
    params.push(f.hallId);
    where.push(`b.hall_id = $${params.length}`);
  }
  if (f.q?.trim()) {
    params.push(`%${f.q.trim().replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
    where.push(
      `(b.booking_no ILIKE $${params.length} OR b.applicant_name ILIKE $${params.length} OR b.applicant_phone ILIKE $${params.length})`,
    );
  }
  const { rows } = await pool.query<BookingRow>(
    `${BOOKING_SELECT} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY b.from_date ${f.status === "applied" || f.status === "upcoming" ? "ASC" : "DESC"}, b.id LIMIT 500`,
    params,
  );
  const { rows: counts } = await pool.query<{ applied: number; approved: number; upcoming: number; deposit: number }>(
    `SELECT count(*) FILTER (WHERE status = 'applied')::int AS applied,
            count(*) FILTER (WHERE status = 'approved')::int AS approved,
            count(*) FILTER (WHERE status = 'confirmed' AND to_date >= ${TODAY})::int AS upcoming,
            count(*) FILTER (WHERE status = 'confirmed' AND deposit_status = 'held' AND to_date < ${TODAY})::int AS deposit
       FROM hall_bookings`,
  );
  return { bookings: rows.map(view), counts: counts[0], canDecide: canDecide(u) };
}

export async function bookingDetail(u: AdminTokenPayload, id: number) {
  assertViewer(u);
  await expireOverdue();
  const { rows } = await pool.query<BookingRow>(`${BOOKING_SELECT} WHERE b.id = $1`, [id]);
  if (!rows[0]) throw ApiError.notFound("Booking not found.");
  // Other bookings on overlapping dates, for the officer deciding this one.
  // Other bookings of the hall on overlapping dates and slots, for the officer deciding this one: a different option
  // (e.g. garden while the hall is let) is allowed but worth a look; the same option cannot be held twice.
  const { rows: clashes } = await pool.query(
    `SELECT booking_no, applicant_name, status, to_char(from_date, 'YYYY-MM-DD') AS from_date, to_char(to_date, 'YYYY-MM-DD') AS to_date,
            option_name, slot, (rate_option_id IS NOT DISTINCT FROM $5::int) AS same_option
       FROM hall_bookings WHERE hall_id = $1 AND id <> $2 AND status IN ('applied', 'approved', 'confirmed')
        AND from_date <= $4::date AND to_date >= $3::date AND ${slotsOverlap("slot", "$6")} ORDER BY id`,
    [rows[0].hall_id, id, rows[0].from_date, rows[0].to_date, rows[0].rate_option_id, rows[0].slot],
  );
  return { booking: view(rows[0]), overlapping: clashes, canDecide: canDecide(u) };
}

/** Runs `fn` on the booking, locked, with the hall's bookings serialised (no two officers confirm the same dates). */
async function withBooking<T>(id: number, fn: (c: PoolClient, b: BookingRow) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await expireOverdue(client);
    const { rows: h } = await client.query<{ hall_id: number }>(`SELECT hall_id FROM hall_bookings WHERE id = $1`, [id]);
    if (!h[0]) throw ApiError.notFound("Booking not found.");
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('hall-booking'), $1)`, [h[0].hall_id]);
    const { rows } = await client.query<BookingRow>(`${BOOKING_SELECT} WHERE b.id = $1 FOR UPDATE OF b`, [id]);
    const out = await fn(client, rows[0]!);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

export async function approve(u: AdminTokenPayload, id: number, remarks: string | null) {
  assertDecider(u);
  return withBooking(id, async (c, b) => {
    if (b.status !== "applied") throw ApiError.badRequest("Only an application awaiting approval can be approved.");
    if (b.overlap_count > 0 && !(remarks && remarks.trim().length >= 3))
      throw ApiError.badRequest(
        "Other bookings of this hall fall on the same date / slot - check them and write a remark before approving.",
      );
    const { rows: d } = await c.query<{ past: boolean; due: string }>(
      `SELECT $1::date <= ${TODAY} AS past, to_char(GREATEST(${TODAY}, LEAST(${TODAY} + ${PAY_WITHIN_DAYS}, $1::date - 1)), 'YYYY-MM-DD') AS due`,
      [b.from_date],
    );
    if (d[0]!.past) throw ApiError.badRequest("The booking date has already come - it can only be rejected.");
    const clash = await overlapping(c, b.rate_option_id, b.slot, b.from_date, b.to_date, Number(b.id));
    if (clash) throw ApiError.badRequest(`"${b.option_name}" is already held on these dates by booking ${clash}.`);
    await c.query(
      `UPDATE hall_bookings SET status = 'approved', decided_at = now(), decided_by = $2, decided_by_name = $3, decision_remarks = $4,
              payment_due_date = $5::date, events = events || $6::jsonb WHERE id = $1`,
      [
        id,
        u.username,
        u.displayName,
        remarks?.trim() || null,
        d[0]!.due,
        event("approved", u, `${remarks?.trim() ? `${remarks.trim()} - ` : ""}pay by ${d[0]!.due.split("-").reverse().join("-")}`),
      ],
    );
    return { paymentDueDate: d[0]!.due };
  });
}

export async function reject(u: AdminTokenPayload, id: number, reason: string) {
  assertDecider(u);
  return withBooking(id, async (c, b) => {
    if (b.status !== "applied") throw ApiError.badRequest("Only an application awaiting approval can be rejected.");
    await c.query(
      `UPDATE hall_bookings SET status = 'rejected', decided_at = now(), decided_by = $2, decided_by_name = $3, decision_remarks = $4,
              events = events || $5::jsonb WHERE id = $1`,
      [id, u.username, u.displayName, reason.trim(), event("rejected", u, reason)],
    );
  });
}

/** Rent + deposit paid at the office - the booking is confirmed. */
export async function recordOfficePayment(u: AdminTokenPayload, id: number, mode: OfficePaymentMode, reference: string | null) {
  assertDecider(u);
  const ref = reference?.trim() || null;
  if (mode !== "cash" && (!ref || ref.length < 4)) throw ApiError.badRequest("Enter the POS approval code / RRN or the DD number.");
  return withBooking(id, async (c, b) => {
    if (b.status !== "approved") throw ApiError.badRequest("Only an approved booking awaiting payment can be paid.");
    const clash = await overlapping(c, b.rate_option_id, b.slot, b.from_date, b.to_date, Number(b.id));
    if (clash) throw ApiError.badRequest(`"${b.option_name}" is already held on these dates by booking ${clash}.`);
    await c.query(
      `UPDATE hall_bookings SET status = 'confirmed', paid_at = now(), payment_channel = 'office', payment_mode = $2, payment_reference = $3,
              payment_recorded_by = $4, deposit_status = CASE WHEN deposit_amount > 0 THEN 'held' ELSE 'none' END, events = events || $5::jsonb
        WHERE id = $1`,
      [
        id,
        mode,
        ref,
        u.displayName,
        event("paid", u, `Rs ${Number(b.total_amount).toFixed(2)} by ${MODE_LABEL[mode]}${ref ? ` (${ref})` : ""}`),
      ],
    );
  });
}

export async function cancel(u: AdminTokenPayload, id: number, reason: string) {
  assertDecider(u);
  return withBooking(id, async (c, b) => {
    if (!["applied", "approved", "confirmed"].includes(b.status)) throw ApiError.badRequest("This booking is already closed.");
    if (b.status === "confirmed" && b.event_over) throw ApiError.badRequest("The function is over - settle the deposit instead.");
    await c.query(
      `UPDATE hall_bookings SET status = 'cancelled', cancelled_at = now(), cancelled_by_name = $2, cancel_reason = $3, events = events || $4::jsonb
        WHERE id = $1`,
      [id, u.displayName, reason.trim(), event("cancelled", u, reason)],
    );
  });
}

/** After the function: the deposit refunded, less any deduction (with its reason). */
export async function settleDeposit(u: AdminTokenPayload, id: number, deducted: number, remarks: string | null) {
  assertDecider(u);
  return withBooking(id, async (c, b) => {
    if (b.status !== "confirmed" || b.deposit_status !== "held") throw ApiError.badRequest("There is no deposit held on this booking.");
    if (!b.event_over) throw ApiError.badRequest("The deposit is settled after the function is over.");
    const deposit = Number(b.deposit_amount);
    const d = r2(deducted);
    if (d < 0 || d > deposit) throw ApiError.badRequest(`The deduction must be between Rs 0 and the deposit, Rs ${deposit.toFixed(2)}.`);
    if (d > 0 && (!remarks || remarks.trim().length < 3)) throw ApiError.badRequest("Write the reason for the deduction.");
    await c.query(
      `UPDATE hall_bookings SET deposit_status = 'settled', deposit_refunded = $2, deposit_deducted = $3, deposit_remarks = $4,
              deposit_settled_at = now(), deposit_settled_by = $5, events = events || $6::jsonb WHERE id = $1`,
      [
        id,
        r2(deposit - d),
        d,
        remarks?.trim() || null,
        u.displayName,
        event("deposit settled", u, `refund Rs ${(deposit - d).toFixed(2)}${d ? `, deducted Rs ${d.toFixed(2)}: ${remarks?.trim()}` : ""}`),
      ],
    );
  });
}
