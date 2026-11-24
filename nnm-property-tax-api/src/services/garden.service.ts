import crypto from "node:crypto";
import { pool } from "../config/db";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import { signDocument, verifyDocumentSignature } from "../utils/verificationSignature";
import type { AdminTokenPayload } from "../types/admin.types";

/**
 * Garden entry tickets. A garden has a fee per person. The counter (Garden Counter login, one garden each) sells a
 * ticket for a number of persons - cash, or card / UPI on the bank POS (the POS slip's reference is recorded); the
 * ticket shows on the counter screen with its QR code. The public can open the garden's own QR link and buy online
 * through the garden's separate gateway (gardenGateway - off until it is integrated). The gatekeeper scans the
 * ticket's QR once: it is valid for its own date only and is marked used, so a photo / screenshot cannot be reused.
 *
 * Municipal Commissioner: adds gardens, sets the fee, assigns counter logins. MC, DMC, City Manager: reports.
 */

export const OFFICERS = ["commissioner", "deputy_commissioner", "city_manager"] as const;
const isOfficer = (u: AdminTokenPayload) => (OFFICERS as readonly string[]).includes(u.role);
/** A counter sale can be cancelled by its seller this long after the sale (unused only). */
const CANCEL_WINDOW_MIN = 30;

export type PaymentMode = "cash" | "pos_card" | "pos_upi" | "online";
export const MODE_LABEL: Record<PaymentMode, string> = { cash: "Cash", pos_card: "Card (POS)", pos_upi: "UPI (POS)", online: "Online" };

const r2 = (n: number) => Math.round(n * 100) / 100;
const TODAY = `(now() AT TIME ZONE 'Asia/Kolkata')::date`;

interface TicketRow {
  id: string;
  ticket_no: string;
  garden_id: number;
  garden_name: string;
  garden_name_hi: string | null;
  visit_date: string;
  persons: number;
  fee_per_person: string;
  amount: string;
  channel: string;
  payment_mode: PaymentMode;
  pos_reference: string | null;
  status: string;
  sold_by_name: string | null;
  created_at: Date;
  paid_at: Date | null;
  used_at: Date | null;
  used_by_name: string | null;
  cancelled_at: Date | null;
  cancel_reason: string | null;
}

const TICKET_SELECT = `SELECT t.id, t.ticket_no, t.garden_id, g.name AS garden_name, g.name_hi AS garden_name_hi,
       to_char(t.visit_date, 'YYYY-MM-DD') AS visit_date, t.persons, t.fee_per_person, t.amount, t.channel, t.payment_mode,
       t.pos_reference, t.status, t.sold_by_name, t.created_at, t.paid_at, t.used_at, t.used_by_name, t.cancelled_at, t.cancel_reason
  FROM garden_tickets t JOIN gardens g ON g.id = t.garden_id`;

export function ticketUrl(ticketNo: string): string {
  const base = (env.FRONTEND_URL || "").replace(/\/+$/, "");
  return `${base}/garden/ticket/${encodeURIComponent(ticketNo)}?sig=${signDocument("garden-ticket", ticketNo)}`;
}

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

function view(t: TicketRow) {
  return {
    id: Number(t.id),
    ticketNo: t.ticket_no,
    gardenId: t.garden_id,
    gardenName: t.garden_name,
    gardenNameHi: t.garden_name_hi,
    visitDate: t.visit_date,
    issuedAt: t.created_at,
    issuedAtText: ist(t.paid_at ?? t.created_at),
    persons: t.persons,
    feePerPerson: Number(t.fee_per_person),
    amount: Number(t.amount),
    channel: t.channel,
    paymentMode: t.payment_mode,
    paymentModeLabel: MODE_LABEL[t.payment_mode],
    posReference: t.pos_reference,
    status: t.status,
    soldBy: t.sold_by_name,
    usedAt: t.used_at,
    usedAtText: ist(t.used_at),
    usedBy: t.used_by_name,
    cancelledAt: t.cancelled_at,
    cancelReason: t.cancel_reason,
    url: ticketUrl(t.ticket_no),
  };
}
export type TicketView = ReturnType<typeof view>;

// ---------- gardens (Municipal Commissioner) ----------

function assertCommissioner(u: AdminTokenPayload) {
  if (u.role !== "commissioner") throw new ApiError(403, "Only the Municipal Commissioner manages gardens.");
}
function assertOfficer(u: AdminTokenPayload) {
  if (!isOfficer(u)) throw new ApiError(403, "Not allowed.");
}

export async function listGardens(u: AdminTokenPayload) {
  assertOfficer(u);
  const { rows } = await pool.query(
    `SELECT g.id, g.name, g.name_hi, g.code, g.fee_per_person::float8 AS fee_per_person, g.max_persons_per_ticket, g.active,
            COALESCE(json_agg(json_build_object('username', a.username, 'name', a.display_name, 'active', a.active) ORDER BY a.display_name)
                     FILTER (WHERE a.username IS NOT NULL), '[]') AS staff
       FROM gardens g LEFT JOIN garden_staff s ON s.garden_id = g.id LEFT JOIN admins a ON a.username = s.admin_username
      GROUP BY g.id ORDER BY g.name`,
  );
  const base = (env.FRONTEND_URL || "").replace(/\/+$/, "");
  return rows.map((g) => ({ ...g, publicUrl: `${base}/garden/${g.code}` }));
}

export interface GardenInput {
  name: string;
  nameHi?: string | null;
  feePerPerson: number;
  maxPersonsPerTicket?: number;
  active?: boolean;
}

export async function createGarden(u: AdminTokenPayload, g: GardenInput) {
  assertCommissioner(u);
  const code = crypto.randomBytes(6).toString("base64url").slice(0, 8);
  try {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO gardens (name, name_hi, code, fee_per_person, max_persons_per_ticket, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [g.name.trim(), g.nameHi?.trim() || null, code, r2(g.feePerPerson), g.maxPersonsPerTicket ?? 50, u.username],
    );
    return { id: rows[0]!.id };
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw ApiError.badRequest("A garden with this name already exists.");
    throw e;
  }
}

export async function updateGarden(u: AdminTokenPayload, id: number, g: GardenInput) {
  assertCommissioner(u);
  const { rowCount } = await pool.query(
    `UPDATE gardens SET name = $2, name_hi = $3, fee_per_person = $4, max_persons_per_ticket = $5, active = $6, updated_at = now() WHERE id = $1`,
    [id, g.name.trim(), g.nameHi?.trim() || null, r2(g.feePerPerson), g.maxPersonsPerTicket ?? 50, g.active ?? true],
  );
  if (!rowCount) throw ApiError.notFound("Garden not found.");
}

/** Garden Counter logins and the garden each works at. */
export async function listCounterLogins(u: AdminTokenPayload) {
  assertOfficer(u);
  const { rows } = await pool.query(
    `SELECT a.username, a.display_name, a.active, s.garden_id, g.name AS garden_name
       FROM admins a LEFT JOIN garden_staff s ON s.admin_username = a.username LEFT JOIN gardens g ON g.id = s.garden_id
      WHERE a.role = 'garden_counter' ORDER BY a.display_name`,
  );
  return rows;
}

export async function assignCounter(u: AdminTokenPayload, username: string, gardenId: number | null) {
  assertCommissioner(u);
  const { rows } = await pool.query(`SELECT role FROM admins WHERE username = $1`, [username]);
  if (rows[0]?.role !== "garden_counter") throw ApiError.badRequest("That is not a Garden Counter login.");
  if (gardenId === null) {
    await pool.query(`DELETE FROM garden_staff WHERE admin_username = $1`, [username]);
    return;
  }
  const { rows: g } = await pool.query(`SELECT 1 FROM gardens WHERE id = $1`, [gardenId]);
  if (!g[0]) throw ApiError.notFound("Garden not found.");
  await pool.query(
    `INSERT INTO garden_staff (admin_username, garden_id, assigned_by) VALUES ($1, $2, $3)
     ON CONFLICT (admin_username) DO UPDATE SET garden_id = EXCLUDED.garden_id, assigned_by = EXCLUDED.assigned_by, assigned_at = now()`,
    [username, gardenId, u.username],
  );
}

// ---------- counter ----------

async function myGarden(u: AdminTokenPayload) {
  if (u.role !== "garden_counter") throw new ApiError(403, "Only a Garden Counter login sells and checks tickets.");
  const { rows } = await pool.query<{
    id: number;
    name: string;
    name_hi: string | null;
    fee_per_person: string;
    max_persons_per_ticket: number;
    active: boolean;
  }>(
    `SELECT g.id, g.name, g.name_hi, g.fee_per_person, g.max_persons_per_ticket, g.active FROM garden_staff s JOIN gardens g ON g.id = s.garden_id WHERE s.admin_username = $1`,
    [u.username],
  );
  const g = rows[0];
  if (!g) throw ApiError.badRequest("This login is not assigned to a garden yet - ask the Municipal Commissioner's office.");
  return g;
}

/** The counter's garden and its own sales today. */
export async function counterToday(u: AdminTokenPayload) {
  const g = await myGarden(u);
  const { rows } = await pool.query<TicketRow>(
    `${TICKET_SELECT} WHERE t.garden_id = $1 AND t.visit_date = ${TODAY} AND t.sold_by_username = $2 ORDER BY t.created_at DESC`,
    [g.id, u.username],
  );
  const tickets = rows.map(view);
  const valid = tickets.filter((t) => t.status === "paid");
  const sum = (mode?: PaymentMode) => r2(valid.filter((t) => !mode || t.paymentMode === mode).reduce((s, t) => s + t.amount, 0));
  return {
    garden: {
      id: g.id,
      name: g.name,
      nameHi: g.name_hi,
      feePerPerson: Number(g.fee_per_person),
      maxPersons: g.max_persons_per_ticket,
      active: g.active,
    },
    today: {
      tickets: valid.length,
      persons: valid.reduce((s, t) => s + t.persons, 0),
      amount: sum(),
      cash: sum("cash"),
      posCard: sum("pos_card"),
      posUpi: sum("pos_upi"),
      cancelled: tickets.length - valid.length,
    },
    tickets,
  };
}

export async function sellTicket(
  u: AdminTokenPayload,
  input: { persons: number; paymentMode: PaymentMode; posReference?: string | null; admitNow?: boolean },
) {
  const g = await myGarden(u);
  if (!g.active) throw ApiError.badRequest("Ticket sale is closed for this garden.");
  if (!Number.isInteger(input.persons) || input.persons < 1) throw ApiError.badRequest("Enter the number of persons.");
  if (input.persons > g.max_persons_per_ticket) throw ApiError.badRequest(`At most ${g.max_persons_per_ticket} persons on one ticket.`);
  if (input.paymentMode === "online") throw ApiError.badRequest("Choose cash, card or UPI.");
  const pos = input.paymentMode === "pos_card" || input.paymentMode === "pos_upi";
  const ref = input.posReference?.trim() || null;
  if (pos && (!ref || ref.length < 4)) throw ApiError.badRequest("Enter the approval code / RRN printed on the bank POS slip.");
  const fee = Number(g.fee_per_person);
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO garden_tickets (ticket_no, garden_id, visit_date, persons, fee_per_person, amount, channel, payment_mode, pos_reference, status,
                                 sold_by_username, sold_by_name, paid_at, used_at, used_by_username, used_by_name)
     VALUES ('G' || $1::int::text || '-' || to_char(${TODAY}, 'YYMMDD') || '-' || lpad(nextval('garden_ticket_seq')::text, 6, '0'),
             $1::int, ${TODAY}, $2::int, $3::numeric, round($2::int * $3::numeric, 2), 'counter', $4, $5, 'paid', $6::text, $7::text, now(),
             CASE WHEN $8::boolean THEN now() END, CASE WHEN $8::boolean THEN $6::text END, CASE WHEN $8::boolean THEN $7::text END)
     RETURNING id`,
    [g.id, input.persons, fee, input.paymentMode, pos ? ref : null, u.username, u.displayName, !!input.admitNow],
  );
  return ticketById(Number(rows[0]!.id));
}

async function ticketById(id: number) {
  const { rows } = await pool.query<TicketRow>(`${TICKET_SELECT} WHERE t.id = $1`, [id]);
  if (!rows[0]) throw ApiError.notFound("Ticket not found.");
  return view(rows[0]);
}

export async function cancelTicket(u: AdminTokenPayload, id: number, reason: string) {
  const { rows } = await pool.query<{
    status: string;
    used_at: Date | null;
    sold_by_username: string | null;
    created_at: Date;
    channel: string;
  }>(`SELECT status, used_at, sold_by_username, created_at, channel FROM garden_tickets WHERE id = $1 FOR UPDATE`, [id]);
  const t = rows[0];
  if (!t) throw ApiError.notFound("Ticket not found.");
  const seller = u.role === "garden_counter" && t.sold_by_username === u.username;
  if (!seller && u.role !== "commissioner")
    throw new ApiError(403, "Only the counter that sold it (or the Municipal Commissioner) can cancel a ticket.");
  if (t.channel === "online") throw ApiError.badRequest("An online ticket is refunded through the gateway, not cancelled here.");
  if (t.status !== "paid") throw ApiError.badRequest("This ticket is not active.");
  if (seller && Date.now() - t.created_at.getTime() > CANCEL_WINDOW_MIN * 60_000)
    throw ApiError.badRequest(`A ticket can be cancelled at the counter only within ${CANCEL_WINDOW_MIN} minutes of sale.`);
  if (t.used_at && seller) throw ApiError.badRequest("This ticket has already been used for entry.");
  await pool.query(
    `UPDATE garden_tickets SET status = 'cancelled', cancelled_at = now(), cancelled_by = $2, cancel_reason = $3 WHERE id = $1`,
    [id, u.displayName, reason.trim()],
  );
}

// ---------- gate ----------

/** Parses what the gate scanner read: the ticket link, or "ticketNo|sig". */
export function parseScanned(text: string): { ticketNo: string; sig: string } | null {
  const s = text.trim();
  const m = s.match(/\/garden\/ticket\/([^/?#]+)\?(?:.*&)?sig=([0-9a-f]{32})/i);
  if (m) return { ticketNo: decodeURIComponent(m[1]!), sig: m[2]!.toLowerCase() };
  const p = s.match(/^(G\d+-\d{6}-\d{6})\|([0-9a-f]{32})$/i);
  return p ? { ticketNo: p[1]!.toUpperCase(), sig: p[2]!.toLowerCase() } : null;
}

/** Admits a scanned ticket at this counter's garden: genuine, paid, today's, not used before. */
export async function admit(u: AdminTokenPayload, scanned: string) {
  const g = await myGarden(u);
  const parsed = parseScanned(scanned);
  if (!parsed || !verifyDocumentSignature("garden-ticket", parsed.ticketNo, parsed.sig))
    throw ApiError.badRequest("Not a genuine garden ticket of Munger Nagar Nigam.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<TicketRow & { is_today: boolean }>(
      `${TICKET_SELECT.replace("SELECT t.id,", `SELECT (t.visit_date = ${TODAY}) AS is_today, t.id,`)} WHERE t.ticket_no = $1 FOR UPDATE OF t`,
      [parsed.ticketNo],
    );
    const t = rows[0];
    if (!t) throw ApiError.notFound("Ticket not found.");
    const v = view(t);
    const refusal =
      t.garden_id !== g.id
        ? `This ticket is for ${t.garden_name}, not this garden.`
        : t.status === "cancelled"
          ? "This ticket was cancelled."
          : t.status !== "paid"
            ? "This ticket is not paid."
            : !t.is_today
              ? `This ticket was for ${t.visit_date.split("-").reverse().join("-")} - it is valid on that day only.`
              : t.used_at
                ? `Already used - entered at ${ist(t.used_at)}${t.used_by_name ? ` (checked by ${t.used_by_name})` : ""}.`
                : null;
    if (refusal) {
      await client.query("ROLLBACK");
      return { admitted: false as const, reason: refusal, ticket: v };
    }
    await client.query(`UPDATE garden_tickets SET used_at = now(), used_by_username = $2, used_by_name = $3 WHERE id = $1`, [
      t.id,
      u.username,
      u.displayName,
    ]);
    await client.query("COMMIT");
    return { admitted: true as const, reason: null, ticket: await ticketById(Number(t.id)) };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// ---------- public ----------

export async function publicGarden(code: string) {
  const { rows } = await pool.query(
    `SELECT name, name_hi, fee_per_person::float8 AS fee_per_person, max_persons_per_ticket, active FROM gardens WHERE code = $1`,
    [code],
  );
  if (!rows[0]) throw ApiError.notFound("Garden not found.");
  return { ...rows[0], onlinePayment: env.GARDEN_ONLINE_PAYMENT_ENABLED && rows[0].active };
}

/** The e-ticket opened from its QR code. */
export async function publicTicket(ticketNo: string, sig: string) {
  if (!verifyDocumentSignature("garden-ticket", ticketNo, sig)) throw ApiError.notFound("Ticket not found.");
  const { rows } = await pool.query<TicketRow>(`${TICKET_SELECT} WHERE t.ticket_no = $1`, [ticketNo]);
  if (!rows[0]) throw ApiError.notFound("Ticket not found.");
  const v = view(rows[0]);
  // The public sees the ticket, not who sold it or the POS reference.
  return { ...v, soldBy: null, posReference: null, usedBy: null };
}

/** Public online purchase: through the garden's own gateway, once it is integrated. */
export async function startOnlinePurchase(code: string, persons: number) {
  const g = await publicGarden(code);
  if (!g.active) throw ApiError.badRequest("Ticket sale is closed for this garden.");
  if (!g.onlinePayment)
    throw new ApiError(503, "Online payment for garden tickets is not available yet - please buy the ticket at the counter.");
  if (!Number.isInteger(persons) || persons < 1 || persons > g.max_persons_per_ticket)
    throw ApiError.badRequest("Check the number of persons.");
  // The gateway step (create a pending ticket, redirect to the garden gateway, confirm on its callback) is added in
  // gardenGateway once the provider is chosen.
  throw new ApiError(503, "Online payment for garden tickets is not available yet - please buy the ticket at the counter.");
}

// ---------- reports (MC, DMC, City Manager) ----------

export async function report(u: AdminTokenPayload, f: { from: string; to: string; gardenId?: number }) {
  assertOfficer(u);
  const params: unknown[] = [f.from, f.to];
  let cond = `t.visit_date BETWEEN $1::date AND $2::date AND t.status = 'paid'`;
  if (f.gardenId) {
    params.push(f.gardenId);
    cond += ` AND t.garden_id = $3`;
  }
  const q = (sql: string) => pool.query(sql, params).then((r) => r.rows);
  const [totals, byDay, byMode, bySeller, byGarden, cancelled, list] = await Promise.all([
    q(`SELECT count(*)::int AS tickets, COALESCE(sum(persons), 0)::int AS persons, COALESCE(sum(amount), 0)::float8 AS amount,
              count(*) FILTER (WHERE used_at IS NOT NULL)::int AS used FROM garden_tickets t WHERE ${cond}`),
    q(`SELECT to_char(visit_date, 'YYYY-MM-DD') AS day, count(*)::int AS tickets, sum(persons)::int AS persons, sum(amount)::float8 AS amount
         FROM garden_tickets t WHERE ${cond} GROUP BY 1 ORDER BY 1`),
    q(`SELECT payment_mode AS mode, count(*)::int AS tickets, sum(persons)::int AS persons, sum(amount)::float8 AS amount
         FROM garden_tickets t WHERE ${cond} GROUP BY 1 ORDER BY 1`),
    q(`SELECT COALESCE(sold_by_name, 'Online') AS seller, g.name AS garden, count(*)::int AS tickets, sum(persons)::int AS persons,
              sum(amount)::float8 AS amount, sum(amount) FILTER (WHERE payment_mode = 'cash')::float8 AS cash
         FROM garden_tickets t JOIN gardens g ON g.id = t.garden_id WHERE ${cond} GROUP BY 1, 2 ORDER BY 2, 1`),
    q(`SELECT g.name AS garden, count(*)::int AS tickets, sum(persons)::int AS persons, sum(amount)::float8 AS amount
         FROM garden_tickets t JOIN gardens g ON g.id = t.garden_id WHERE ${cond} GROUP BY 1 ORDER BY 1`),
    q(`SELECT count(*)::int AS n FROM garden_tickets t WHERE ${cond.replace("t.status = 'paid'", "t.status = 'cancelled'")}`),
    pool.query<TicketRow>(
      `${TICKET_SELECT} WHERE ${cond.replace("AND t.status = 'paid'", "")} ORDER BY t.created_at DESC LIMIT 2000`,
      params,
    ),
  ]);
  return {
    totals: totals[0],
    byDay,
    byMode: byMode.map((m) => ({ ...m, label: MODE_LABEL[m.mode as PaymentMode] })),
    bySeller,
    byGarden,
    cancelled: cancelled[0]?.n ?? 0,
    tickets: list.rows.map(view),
  };
}
