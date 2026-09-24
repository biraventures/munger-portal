import { lightFaultRepository } from "../repositories/lightFault.repository";
import { lightFaultPenaltyRepository } from "../repositories/lightFaultPenalty.repository";
import { attendanceUserRepository } from "../repositories/attendanceUser.repository";
import { istDateString } from "../utils/istDate";
import type { LightFaultRow } from "../types/streetlight.types";

const CONTRACTOR_DAILY_PENALTY = 500;
const CITY_MANAGER_DAILY_PENALTY = 100;
const DMC_DAILY_PENALTY = 100;
const DMC_PENALTY_STARTS_AFTER_DAYS = 7;

/**
 * Adds `days` calendar days to a "yyyy-MM-dd" date string, returning
 * another "yyyy-MM-dd" string - deliberately string-based rather than
 * juggling Date objects across day boundaries, since istDateString
 * already gives us clean IST calendar dates to work from.
 */
function addDaysToDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y!, m! - 1, d! + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function dateStringsBetweenInclusive(startStr: string, endStr: string): string[] {
  const dates: string[] = [];
  let current = startStr;
  // A day-count guard, not just `current <= endStr`, so a data/clock
  // anomaly can't produce an unbounded loop.
  let guard = 0;
  while (current <= endStr && guard < 3650) {
    dates.push(current);
    current = addDaysToDateString(current, 1);
    guard++;
  }
  return dates;
}

/**
 * Backfills any missing daily penalty rows for one fault, from the
 * day after its 72-hour deadline through today (or its repair date,
 * whichever is earlier) - lazy accrual, run whenever fault/penalty
 * data is read, rather than a cron job (this app has no scheduler).
 * Idempotent: re-running for a fault that's already fully accrued
 * inserts nothing new, since lightFaultPenaltyRepository.create uses
 * ON CONFLICT DO NOTHING keyed on (fault_id, penalty_date, party_type).
 */
export async function accruePenaltiesForFault(fault: LightFaultRow): Promise<void> {
  const deadlineDateStr = istDateString(new Date(fault.deadline_at));
  const firstDelayDateStr = addDaysToDateString(deadlineDateStr, 1);

  const lastDayToAccrue = fault.status === "repaired" && fault.repaired_at ? istDateString(new Date(fault.repaired_at)) : istDateString();

  if (firstDelayDateStr > lastDayToAccrue) return; // Not yet past the deadline by even one full day.

  const delayDates = dateStringsBetweenInclusive(firstDelayDateStr, lastDayToAccrue);
  if (delayDates.length === 0) return;

  const cityManagers = await attendanceUserRepository.listByRole("city_manager");
  const dmcs = await attendanceUserRepository.listByRole("deputy_municipal_commissioner");

  for (let i = 0; i < delayDates.length; i++) {
    const penaltyDate = delayDates[i]!;
    const dayOfDelay = i + 1; // 1-indexed: first day past deadline = day 1 of delay.

    await lightFaultPenaltyRepository.create({
      faultId: fault.id,
      penaltyDate,
      partyType: "contractor",
      partyUserId: fault.assigned_contractor_id,
      amount: CONTRACTOR_DAILY_PENALTY,
    });

    // If more than one active city_manager/DMC login exists, each one
    // is penalized independently for that day - the role is expected
    // to be held by a single person in practice, but this doesn't
    // silently drop the penalty if that assumption is ever violated.
    for (const cm of cityManagers) {
      await lightFaultPenaltyRepository.create({ faultId: fault.id, penaltyDate, partyType: "city_manager", partyUserId: cm.id, amount: CITY_MANAGER_DAILY_PENALTY });
    }

    if (dayOfDelay > DMC_PENALTY_STARTS_AFTER_DAYS) {
      for (const dmc of dmcs) {
        await lightFaultPenaltyRepository.create({ faultId: fault.id, penaltyDate, partyType: "dmc", partyUserId: dmc.id, amount: DMC_DAILY_PENALTY });
      }
    }
  }
}

/** Runs accrual across every open fault past its deadline - call before serving any fault/penalty list so the data shown is always caught up. */
export async function accrueAllOverduePenalties(): Promise<void> {
  const overdueFaults = await lightFaultRepository.listOpenPastDeadline();
  for (const fault of overdueFaults) {
    await accruePenaltiesForFault(fault);
  }
}
