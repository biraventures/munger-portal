import { pool } from "../config/db";
import { ApiError } from "../utils/ApiError";
import { pyauRepository } from "../repositories/pyau.repository";
import { pyauIssueRepository } from "../repositories/pyauIssue.repository";
import { checkSinceDate, myReports as myPublicReports, pendingFor, pendingMap, reportsToday, submit } from "./publicAssetReport.service";

/**
 * Citizens report non-working submersibles (pyaus). They are verified with the same holding number + registered
 * mobile session as the public streetlight reports (see publicLightFault.service openSession / verifyToken). They
 * see each ward's submersibles with working / not working (without the maintenance log, costs or who reported) and
 * can mark a working one as not working, with the date, the problem seen and remarks. The complaint first waits
 * for the City Manager to verify it (publicAssetReport.service); on approval it becomes an ordinary pyau issue: the
 * pyau turns non-functional and the issue goes to the ward's pyau contractor (or the builder while under the 2-year
 * warranty), exactly as when a JE/AE logs it.
 */

type Session = { holdingNo: string; phone: string };

/** One mobile number can mark at most this many submersibles in a day. */
const MAX_REPORTS_PER_DAY = 10;

export const PROBLEMS = ["no_water", "motor_not_running", "starter_switch", "pipe_leak", "tap_broken", "tank_overflow", "other"] as const;
export type Problem = (typeof PROBLEMS)[number];

/** Wards that have submersibles, with working / not working counts. */
export async function wards() {
  const { rows } = await pool.query<{ ward_id: string; ward_name: string; total: number; working: number }>(
    `SELECT w.id AS ward_id, w.ward_name, count(*)::int AS total,
            count(*) FILTER (WHERE p.functional_status = 'functional')::int AS working
       FROM pyaus p JOIN attendance_wards w ON w.id = p.ward_id
      WHERE p.active
      GROUP BY w.id, w.ward_name
      ORDER BY NULLIF(substring(w.ward_name FROM '([0-9]+)'), '')::int NULLS LAST, w.ward_name`,
  );
  return rows.map((r) => ({ wardId: Number(r.ward_id), wardName: r.ward_name, total: r.total, working: r.working, notWorking: r.total - r.working }));
}

/** The submersibles of one ward. A non-working one without an open issue is marked "known" (already recorded by the Nagar Nigam). */
export async function ward(wardId: number) {
  const { rows } = await pool.query<{
    id: string;
    serial_number: string | null;
    location_address: string | null;
    scheme_name: string | null;
    functional_status: string;
    open_reported_on: string | null;
  }>(
    `SELECT p.id, p.serial_number, p.location_address, p.scheme_name, p.functional_status,
            (SELECT to_char(i.date_of_issue, 'YYYY-MM-DD') FROM pyau_issues i WHERE i.pyau_id = p.id AND i.status = 'open' ORDER BY i.id LIMIT 1) AS open_reported_on
       FROM pyaus p
      WHERE p.ward_id = $1 AND p.active
      ORDER BY NULLIF(substring(p.serial_number FROM '([0-9]+)$'), '')::int NULLS LAST, p.id`,
    [wardId],
  );
  const pending = await pendingMap("pyau", rows.map((r) => Number(r.id)));
  return rows.map((r) => ({
    pyauId: Number(r.id),
    serialNumber: r.serial_number ?? `#${r.id}`,
    location: r.location_address,
    schemeName: r.scheme_name,
    working: r.functional_status === "functional",
    reportedOn: r.open_reported_on,
    /** A complaint waiting for the City Manager's verification. */
    pendingOn: pending.get(Number(r.id)) ?? null,
  }));
}

export interface PublicPyauFaultInput {
  pyauId: number;
  nonFunctionalSince: string; // YYYY-MM-DD
  problem: Problem;
  remarks?: string | null;
}

export async function reportFault(session: Session, input: PublicPyauFaultInput) {
  const pyau = await pyauRepository.findById(input.pyauId);
  if (!pyau || !pyau.active) throw ApiError.notFound("Submersible not found.");
  checkSinceDate(input.nonFunctionalSince);

  const open = await pyauIssueRepository.findOpenForPyau(pyau.id);
  if (open) {
    const on = new Date(open.date_of_issue).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });
    throw ApiError.badRequest(`This submersible is already reported as not working (on ${on}) and is with the contractor for repair.`);
  }
  if (pyau.functional_status !== "functional") {
    throw ApiError.badRequest("This submersible is already recorded as not working with the Nagar Nigam.");
  }
  const pending = await pendingFor("pyau", Number(pyau.id));
  if (pending) {
    throw ApiError.badRequest(
      `This submersible was already reported on ${pending.reported_at.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })} and is waiting for verification by the City Manager.`,
    );
  }
  if ((await reportsToday(session.phone, "pyau")) >= MAX_REPORTS_PER_DAY) {
    throw ApiError.badRequest(`At most ${MAX_REPORTS_PER_DAY} submersibles can be reported from one mobile number in a day.`);
  }
  const r = await submit({
    assetType: "pyau",
    assetId: Number(pyau.id),
    wardId: Number(pyau.ward_id),
    phone: session.phone,
    holdingNo: session.holdingNo,
    nonFunctionalSince: input.nonFunctionalSince,
    problem: input.problem,
    remarks: input.remarks,
  });
  return { reportId: r.reportId, serialNumber: pyau.serial_number };
}

/** The citizen's own submersible complaints (by mobile number), newest first. */
export async function myReports(session: Session) {
  return myPublicReports(session.phone, "pyau");
}
