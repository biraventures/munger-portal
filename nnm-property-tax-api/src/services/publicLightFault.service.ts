import jwt from "jsonwebtoken";
import { pool } from "../config/db";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import { lightRepository } from "../repositories/light.repository";
import { checkSinceDate, myReports as myPublicReports, pendingFor, pendingMap, reportsToday, submit } from "./publicAssetReport.service";
import { buildHighMastLightsForWard, buildSegmentLightStatus, buildStreetStatusDashboard, buildWardStatusDashboard } from "./streetlightStatusDashboard.service";

/**
 * Citizens report non-working streetlights and High Mast lights. They identify themselves with a holding number and
 * the mobile number recorded on that holding; they then see the same ward -> street -> light status the officers see
 * (without who reported or repaired what) and can mark a working light as not working, with the date, the switch
 * status and remarks. The complaint first waits for the City Manager to verify it (publicAssetReport.service); only
 * on approval does it become a fault for the ward's contractor.
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
  const pending = await pendingMap("light", highMasts.map((h) => Number(h.lightId)));
  return { streets, highMasts: highMasts.map((h) => ({ ...h, pendingOn: pending.get(Number(h.lightId)) ?? null })) };
}

/** Lights on one street, without fault history. */
export async function segmentLights(segmentId: number) {
  const lights = (await buildSegmentLightStatus(segmentId)).filter((l) => l.active);
  const pending = await pendingMap("light", lights.map((l) => Number(l.lightId)));
  return lights.map((l) => ({
    lightId: l.lightId,
    serialNumber: l.serialNumber,
    working: l.working,
    reportedOn: l.faultHistory.find((f) => f.status === "open")?.reportedAt ?? null,
    /** A complaint waiting for the City Manager's verification. */
    pendingOn: pending.get(Number(l.lightId)) ?? null,
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
  checkSinceDate(input.nonFunctionalSince);

  const { rows: open } = await pool.query<{ reported_at: Date }>(`SELECT reported_at FROM light_faults WHERE light_id = $1 AND status = 'open' ORDER BY reported_at LIMIT 1`, [light.id]);
  if (open[0]) {
    throw ApiError.badRequest(
      `This light is already reported as not working (on ${open[0].reported_at.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}) and is with the contractor for repair.`,
    );
  }
  const pending = await pendingFor("light", Number(light.id));
  if (pending) {
    throw ApiError.badRequest(
      `This light was already reported on ${pending.reported_at.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })} and is waiting for verification by the City Manager.`,
    );
  }
  if ((await reportsToday(session.phone, "light")) >= MAX_REPORTS_PER_DAY) {
    throw ApiError.badRequest(`At most ${MAX_REPORTS_PER_DAY} lights can be reported from one mobile number in a day.`);
  }
  const r = await submit({
    assetType: "light",
    assetId: Number(light.id),
    wardId: Number(light.ward_id),
    phone: session.phone,
    holdingNo: session.holdingNo,
    nonFunctionalSince: input.nonFunctionalSince,
    switchStatus: input.switchStatus,
    remarks: input.remarks,
  });
  return { reportId: r.reportId, serialNumber: light.serial_number };
}

/** The citizen's own light complaints (by mobile number), newest first. */
export async function myReports(session: PublicLightToken) {
  return myPublicReports(session.phone, "light");
}
