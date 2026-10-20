import jwt from "jsonwebtoken";
import { pool } from "../config/db";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import { lightRepository } from "../repositories/light.repository";
import { lightFaultRepository } from "../repositories/lightFault.repository";
import { contractorWardRepository } from "../repositories/contractorWard.repository";
import { buildHighMastLightsForWard, buildSegmentLightStatus, buildStreetStatusDashboard, buildWardStatusDashboard } from "./streetlightStatusDashboard.service";

/**
 * Citizens report non-working streetlights and High Mast lights. They identify themselves with a holding number and
 * the mobile number recorded on that holding; they then see the same ward -> street -> light status the officers see
 * (without who reported or repaired what) and can mark a working light as not working, with the date, the switch
 * status and remarks. The fault goes to the ward's contractor like any other.
 */

const SESSION_HOURS = 3;
/** One mobile number can mark at most this many lights in a day. */
const MAX_REPORTS_PER_DAY = 25;

interface PublicLightToken {
  type: "public_light";
  holdingNo: string;
  phone: string;
}

const cleanMobile = (m: string) => m.replace(/[\s-]/g, "").replace(/^(\+91|91|0)(?=\d{10}$)/, "");

export async function openSession(holdingNo: string, mobile: string) {
  const phone = cleanMobile(mobile);
  if (!/^[6-9]\d{9}$/.test(phone)) throw ApiError.badRequest("Enter a valid 10-digit mobile number.");
  const { rows } = await pool.query<{ holding_no: string; mobile_no: string | null; ward: string | null }>(
    `SELECT holding_no, mobile_no, ward FROM properties WHERE upper(holding_no) = upper($1) LIMIT 1`,
    [holdingNo.trim()],
  );
  const p = rows[0];
  // The same answer for an unknown holding and a wrong mobile, so holdings cannot be probed for their mobile numbers.
  if (!p || !p.mobile_no || cleanMobile(p.mobile_no) !== phone) {
    throw ApiError.badRequest("The holding number and mobile number do not match our records. Use the mobile number registered on your holding.");
  }
  const token = jwt.sign({ type: "public_light", holdingNo: p.holding_no, phone } satisfies PublicLightToken, env.JWT_SECRET, { expiresIn: `${SESSION_HOURS}h` });
  // The ward the holding is in, to open it first (matched by ward number).
  const { rows: w } = await pool.query<{ id: string }>(
    `SELECT id FROM attendance_wards WHERE substring(ward_name FROM '([0-9]+)') = substring($1 FROM '([0-9]+)') ORDER BY id LIMIT 1`,
    [p.ward ?? ""],
  );
  return { token, holdingNo: p.holding_no, homeWardId: w[0] ? Number(w[0].id) : null };
}

export function verifyToken(header: string | undefined): PublicLightToken {
  const t = (header ?? "").replace(/^Bearer\s+/i, "");
  try {
    const p = jwt.verify(t, env.JWT_SECRET) as PublicLightToken;
    if (p.type !== "public_light") throw new Error("wrong type");
    return p;
  } catch {
    throw new ApiError(401, "Your session has ended - enter your holding number and mobile number again.");
  }
}

export async function wards(type?: "streetlight" | "high_mast") {
  return buildWardStatusDashboard(undefined, undefined, type);
}

/** One ward: its streets (with counts) and its High Mast lights - without fault history. */
export async function ward(wardId: number) {
  const streets = (await buildStreetStatusDashboard(undefined, wardId)).map(({ segmentId, startPoint, endPoint, agencyName, totalLights, working, notWorking }) => ({
    segmentId,
    startPoint,
    endPoint,
    agencyName,
    totalLights,
    working,
    notWorking,
  }));
  const highMasts = (await buildHighMastLightsForWard(wardId)).map((l) => ({
    lightId: l.lightId,
    serialNumber: l.serialNumber,
    localityName: l.localityName,
    working: l.working,
    reportedOn: l.faultHistory.find((f) => f.status === "open")?.reportedAt ?? null,
    noOfLights: l.noOfLights,
    noOfFunctionalLights: l.noOfFunctionalLights,
  }));
  return { streets, highMasts };
}

/** Lights on one street, without fault history. */
export async function segmentLights(segmentId: number) {
  return (await buildSegmentLightStatus(segmentId))
    .filter((l) => l.active)
    .map((l) => ({
      lightId: l.lightId,
      serialNumber: l.serialNumber,
      working: l.working,
      reportedOn: l.faultHistory.find((f) => f.status === "open")?.reportedAt ?? null,
    }));
}

export interface PublicFaultInput {
  lightId: number;
  nonFunctionalSince: string; // YYYY-MM-DD
  switchStatus: "working" | "not_working" | "automatic" | "joint" | "unknown";
  remarks?: string | null;
}

export async function reportFault(session: PublicLightToken, input: PublicFaultInput) {
  const light = await lightRepository.findById(input.lightId);
  if (!light || !light.active || light.deleted_at) throw ApiError.notFound("Light not found.");
  const since = new Date(`${input.nonFunctionalSince}T00:00:00+05:30`);
  if (Number.isNaN(since.getTime()) || since.getTime() > Date.now()) throw ApiError.badRequest("The date it stopped working cannot be in the future.");
  if (since.getTime() < Date.now() - 366 * 86400_000) throw ApiError.badRequest("Give a date within the last year.");

  const { rows: open } = await pool.query<{ reported_at: Date }>(`SELECT reported_at FROM light_faults WHERE light_id = $1 AND status = 'open' ORDER BY reported_at LIMIT 1`, [light.id]);
  if (open[0]) {
    throw ApiError.badRequest(
      `This light is already reported as not working (on ${open[0].reported_at.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}) and is with the contractor for repair.`,
    );
  }
  const { rows: today } = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM light_faults WHERE reporter_phone = $1 AND reported_by_type = 'public' AND reported_at > now() - interval '24 hours'`,
    [session.phone],
  );
  if ((today[0]?.n ?? 0) >= MAX_REPORTS_PER_DAY) throw ApiError.badRequest(`At most ${MAX_REPORTS_PER_DAY} lights can be reported from one mobile number in a day.`);

  const mapping = await contractorWardRepository.findByWard(Number(light.ward_id));
  const switchLabel: Record<string, string> = { working: "OK", not_working: "not OK", automatic: "automatic", joint: "joint", unknown: "not known" };
  const remarks = input.remarks?.trim().slice(0, 500) || null;
  const fault = await lightFaultRepository.create({
    lightId: Number(light.id),
    reportedGpsLat: null,
    reportedGpsLng: null,
    deadlineAt: new Date(Date.now() + 72 * 3600_000),
    reportedByType: "public",
    reportedByUserId: null,
    reporterPhone: session.phone,
    reporterNotes: `Public report (holding ${session.holdingNo}). Switch: ${switchLabel[input.switchStatus]}.${remarks ? ` ${remarks}` : ""}`,
    nonFunctionalSince: input.nonFunctionalSince,
    assignedContractorId: mapping?.contractor_id ?? null,
    reporterHoldingNo: session.holdingNo,
    reportedSwitchStatus: input.switchStatus,
  });
  return { faultId: Number(fault.id), serialNumber: light.serial_number };
}

/** The citizen's own reports (by mobile number), newest first. */
export async function myReports(session: PublicLightToken) {
  const { rows } = await pool.query(
    `SELECT f.id, f.reported_at, f.status, f.repaired_at, f.non_functional_since, l.serial_number, l.light_type, l.locality_name, w.ward_name
       FROM light_faults f JOIN lights l ON l.id = f.light_id JOIN attendance_wards w ON w.id = l.ward_id
      WHERE f.reporter_phone = $1 AND f.reported_by_type = 'public'
      ORDER BY f.reported_at DESC LIMIT 50`,
    [session.phone],
  );
  return rows;
}
