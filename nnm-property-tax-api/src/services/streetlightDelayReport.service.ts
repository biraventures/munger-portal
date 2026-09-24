import { lightFaultRepository } from "../repositories/lightFault.repository";

const REPAIR_DEADLINE_HOURS = 72;

export interface StreetlightDelayReportRow {
  faultId: number;
  serialNumber: string | null;
  wardName: string | null;
  startPoint: string | null;
  endPoint: string | null;
  agencyName: string | null;
  reportedByType: "staff" | "public" | "admin";
  reportedAt: string;
  nonFunctionalSince: string | null;
  localSourceName: string | null;
  status: "open" | "repaired";
  repairedAt: string | null;
  deadlineAt: string;
  hoursTaken: number | null;
  hoursOverdue: number | null;
  pastDeadline: boolean;
}

/**
 * Every fault, with how long it took (or has been taking) to repair
 * against the 72-hour deadline - the Commissioner's view of repair
 * delays, replacing the earlier penalty-calculation approach with a
 * plain report per what was asked for ("simplify - just a delay
 * report, no penalties").
 */
export async function buildStreetlightDelayReport(): Promise<StreetlightDelayReportRow[]> {
  const faults = await lightFaultRepository.listAllEnriched();
  const now = Date.now();

  return faults.map((f) => {
    const reportedAt = new Date(f.reported_at).getTime();
    const deadlineAt = new Date(f.deadline_at).getTime();
    const repairedAt = f.repaired_at ? new Date(f.repaired_at).getTime() : null;

    const hoursTaken = repairedAt ? Math.round(((repairedAt - reportedAt) / 3600_000) * 10) / 10 : null;
    const referenceNow = repairedAt ?? now;
    const pastDeadline = referenceNow > deadlineAt;
    const hoursOverdue = pastDeadline ? Math.round(((referenceNow - deadlineAt) / 3600_000) * 10) / 10 : null;

    return {
      faultId: f.id,
      serialNumber: f.serial_number,
      wardName: f.ward_name,
      startPoint: f.start_point,
      endPoint: f.end_point,
      agencyName: f.agency_name,
      reportedByType: f.reported_by_type,
      reportedAt: f.reported_at,
      nonFunctionalSince: f.non_functional_since,
      localSourceName: f.local_source_name,
      status: f.status,
      repairedAt: f.repaired_at,
      deadlineAt: f.deadline_at,
      hoursTaken,
      hoursOverdue,
      pastDeadline,
    };
  });
}

export { REPAIR_DEADLINE_HOURS };
