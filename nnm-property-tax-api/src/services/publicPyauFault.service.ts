import { pool } from "../config/db";
import { ApiError } from "../utils/ApiError";
import { pyauRepository } from "../repositories/pyau.repository";
import { pyauIssueRepository } from "../repositories/pyauIssue.repository";
import { pyauContractorWardRepository } from "../repositories/pyauContractorWard.repository";
import { isUnderBuilderWarranty } from "./pyauIssue.service";

/**
 * Citizens report non-working submersibles (pyaus). They are verified with the same holding number + registered
 * mobile session as the public streetlight reports (see publicLightFault.service openSession / verifyToken). They
 * see each ward's submersibles with working / not working (without the maintenance log, costs or who reported) and
 * can mark a working one as not working, with the date, the problem seen and remarks. The report becomes an
 * ordinary pyau issue: the pyau turns non-functional and the issue goes to the ward's pyau contractor (or the builder
 * while under the 2-year warranty), exactly as when a JE/AE logs it.
 */

type Session = { holdingNo: string; phone: string };

/** One mobile number can mark at most this many submersibles in a day. */
const MAX_REPORTS_PER_DAY = 10;

export const PROBLEMS = ["no_water", "motor_not_running", "starter_switch", "pipe_leak", "tap_broken", "tank_overflow", "other"] as const;
export type Problem = (typeof PROBLEMS)[number];
const PROBLEM_LABEL: Record<Problem, string> = {
  no_water: "No water",
  motor_not_running: "Motor not running",
  starter_switch: "Starter / switch / panel fault",
  pipe_leak: "Pipe leaking / burst",
  tap_broken: "Tap broken",
  tank_overflow: "Tank overflowing / damaged",
  other: "Other",
};

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
  return rows.map((r) => ({
    pyauId: Number(r.id),
    serialNumber: r.serial_number ?? `#${r.id}`,
    location: r.location_address,
    schemeName: r.scheme_name,
    working: r.functional_status === "functional",
    reportedOn: r.open_reported_on,
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
  const since = new Date(`${input.nonFunctionalSince}T00:00:00+05:30`);
  if (Number.isNaN(since.getTime()) || since.getTime() > Date.now()) throw ApiError.badRequest("The date it stopped working cannot be in the future.");
  if (since.getTime() < Date.now() - 366 * 86400_000) throw ApiError.badRequest("Give a date within the last year.");

  const open = await pyauIssueRepository.findOpenForPyau(pyau.id);
  if (open) {
    const on = new Date(open.date_of_issue).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });
    throw ApiError.badRequest(`This submersible is already reported as not working (on ${on}) and is with the contractor for repair.`);
  }
  if (pyau.functional_status !== "functional") {
    throw ApiError.badRequest("This submersible is already recorded as not working with the Nagar Nigam.");
  }
  const { rows: today } = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM pyau_issues WHERE reporter_phone = $1 AND reported_by_type = 'public' AND reported_at > now() - interval '24 hours'`,
    [session.phone],
  );
  if ((today[0]?.n ?? 0) >= MAX_REPORTS_PER_DAY) throw ApiError.badRequest(`At most ${MAX_REPORTS_PER_DAY} submersibles can be reported from one mobile number in a day.`);

  // Same assignment as a JE/AE report: the builder while under warranty (no contractor), otherwise the ward's contractor.
  let assignedContractorId: number | null = null;
  if (!isUnderBuilderWarranty(pyau)) {
    const mapping = await pyauContractorWardRepository.findByWard(Number(pyau.ward_id));
    assignedContractorId = mapping?.contractor_id ?? null;
  }
  const remarks = input.remarks?.trim().slice(0, 500) || null;
  const issue = await pyauIssueRepository.create({
    pyauId: Number(pyau.id),
    dateOfIssue: input.nonFunctionalSince,
    reportedByUserId: null,
    issueNotes: `Public report (holding ${session.holdingNo}): ${PROBLEM_LABEL[input.problem]}.${remarks ? ` ${remarks}` : ""}`,
    assignedContractorId,
    reportedByType: "public",
    reporterPhone: session.phone,
    reporterHoldingNo: session.holdingNo,
    reportedProblem: input.problem,
  });
  await pyauRepository.setFunctionalStatus(Number(pyau.id), "non_functional");
  return { issueId: Number(issue.id), serialNumber: pyau.serial_number };
}

/** The citizen's own submersible reports (by mobile number), newest first. */
export async function myReports(session: Session) {
  const { rows } = await pool.query(
    `SELECT i.id, i.reported_at, i.status, to_char(i.date_of_repair, 'YYYY-MM-DD') AS date_of_repair, i.reported_problem,
            p.serial_number, p.location_address, w.ward_name
       FROM pyau_issues i JOIN pyaus p ON p.id = i.pyau_id JOIN attendance_wards w ON w.id = p.ward_id
      WHERE i.reporter_phone = $1 AND i.reported_by_type = 'public'
      ORDER BY i.reported_at DESC LIMIT 50`,
    [session.phone],
  );
  return rows;
}
