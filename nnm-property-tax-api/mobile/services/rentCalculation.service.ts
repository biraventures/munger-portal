import { parseYearMonth, currentYearMonth, monthsDiff, monthRange, formatYearMonth, type YearMonth } from "../utils/yearMonth";
import { num } from "../utils/num";
import type { ShopAgreementRow, ShopRentEscalationPeriodRow } from "../types/shop.types";

function dateToYearMonth(d: Date | string): YearMonth {
  const parsed = d instanceof Date ? d : new Date(d);
  return { year: parsed.getFullYear(), month: parsed.getMonth() + 1 };
}

/**
 * Finds which manually-entered escalation period (if any) covers a
 * given month - the period whose [start, end) range contains it.
 * period_end_date is exclusive and null means "still open". Periods
 * are expected non-overlapping by construction (see
 * shopRentEscalationPeriod.repository.ts's setEndDate, used when a
 * new period supersedes a previous open one), so at most one match is
 * expected. Returns null if forMonth falls before the earliest period
 * or after the last period's end with no newer period covering it -
 * the caller falls back to the legacy fixed-formula calculation below
 * in that case.
 */
export function findApplicablePeriod(periods: ShopRentEscalationPeriodRow[], forMonth: YearMonth): ShopRentEscalationPeriodRow | null {
  for (const p of periods) {
    const startYM = dateToYearMonth(p.period_start_date);
    if (monthsDiff(startYM, forMonth) < 0) continue;
    if (p.period_end_date) {
      const endYM = dateToYearMonth(p.period_end_date);
      if (monthsDiff(endYM, forMonth) >= 0) continue;
    }
    return p;
  }
  return null;
}

/**
 * Compounds a period's own escalation percentage every N years since
 * that period's own start date - fully independent of any other
 * shop's schedule, unlike the old global calendar-anchored formula.
 * If the period's escalation terms are unresolved (percent/interval
 * both null, per NNM's instruction to flag rather than guess), the
 * base rent is returned flat with isUnresolved=true so callers can
 * surface a review warning instead of silently trusting an unescalated figure.
 */
export function calculateRentFromPeriod(period: ShopRentEscalationPeriodRow, forMonth: YearMonth): { rent: number; isUnresolved: boolean } {
  const base = num(period.base_rent);
  if (period.escalation_percent === null || period.escalation_interval_years === null) {
    return { rent: base, isUnresolved: true };
  }
  const startYM = dateToYearMonth(period.period_start_date);
  const monthsElapsed = Math.max(0, monthsDiff(startYM, forMonth));
  const intervalsElapsed = Math.floor(monthsElapsed / (period.escalation_interval_years * 12));
  const pct = num(period.escalation_percent) / 100;
  return { rent: base * Math.pow(1 + pct, intervalsElapsed), isUnresolved: false };
}

// --- Rent escalation schedule (confirmed with NNM) ---
// pre-2019-20 rate -> 2019-20: +25%
// 2019-20 rate -> 2020-21 through 2023-24: +50% further (so 1.875x the original)
// 2024-25 onwards: +5%, compounding every 3 years, starting from the
// 2020-21 rate as the anchor (2024-25 through 2026-27 unchanged, first
// step at 2027-28, next at 2030-31, etc.)
const RATE_2019_20_MULTIPLIER = 1.25;
const RATE_2020_21_MULTIPLIER = 1.5; // applied on top of the 2019-20 rate
const RATE_TRIENNIAL_STEP = 1.05;
const RATE_CONSISTENCY_TOLERANCE_RUPEES = 1;

export interface ResolvedRentPeriods {
  prePeriod: number;
  period2019_20: number;
  period2020_21Onwards: number;
  isConsistent: boolean;
  inconsistencyNote: string | null;
}

/**
 * The core resolution logic, taking raw values directly rather than a
 * ShopAgreementRow — reused for both a live agreement (via
 * resolveRentPeriods below) and a PENDING proposal not yet applied to
 * any row (see shopAgreement.service.ts's change-request detail, which
 * needs to flag an inconsistency to the reviewer BEFORE approval, not
 * only after).
 */
export function resolveRentPeriodsFromValues(
  prePeriodRaw: number | string | null | undefined,
  period201920Raw: number | string | null | undefined,
  period202021OnwardsRaw: number | string | null | undefined,
): ResolvedRentPeriods | null {
  const pre = prePeriodRaw !== null && prePeriodRaw !== undefined ? num(prePeriodRaw) : null;
  const y1920 = period201920Raw !== null && period201920Raw !== undefined ? num(period201920Raw) : null;
  const y2021on = period202021OnwardsRaw !== null && period202021OnwardsRaw !== undefined ? num(period202021OnwardsRaw) : null;

  const candidates: { pre: number; y1920: number; y2021on: number }[] = [];
  if (pre !== null) {
    candidates.push({ pre, y1920: pre * RATE_2019_20_MULTIPLIER, y2021on: pre * RATE_2019_20_MULTIPLIER * RATE_2020_21_MULTIPLIER });
  }
  if (y1920 !== null) {
    candidates.push({ pre: y1920 / RATE_2019_20_MULTIPLIER, y1920, y2021on: y1920 * RATE_2020_21_MULTIPLIER });
  }
  if (y2021on !== null) {
    candidates.push({ pre: y2021on / RATE_2020_21_MULTIPLIER / RATE_2019_20_MULTIPLIER, y1920: y2021on / RATE_2020_21_MULTIPLIER, y2021on });
  }

  if (candidates.length === 0) return null;

  const resolved = candidates[0]!;
  let isConsistent = true;
  for (const c of candidates.slice(1)) {
    if (
      Math.abs(c.pre - resolved.pre) > RATE_CONSISTENCY_TOLERANCE_RUPEES ||
      Math.abs(c.y1920 - resolved.y1920) > RATE_CONSISTENCY_TOLERANCE_RUPEES ||
      Math.abs(c.y2021on - resolved.y2021on) > RATE_CONSISTENCY_TOLERANCE_RUPEES
    ) {
      isConsistent = false;
      break;
    }
  }

  return {
    prePeriod: resolved.pre,
    period2019_20: resolved.y1920,
    period2020_21Onwards: resolved.y2021on,
    isConsistent,
    inconsistencyNote: isConsistent
      ? null
      : "The entered period rates don't match the standard escalation formula (25% at 2019-20, a further 50% from 2020-21) — please verify against the paper register before final approval.",
  };
}

/**
 * The migrated shop data has rent figures from many different periods
 * — not uniformly "the original pre-2019 rate" — so each of the three
 * regime rates is stored and enterable independently
 * (rent_pre_2019 / rent_2019_20 / rent_2020_21_onwards). Whichever ONE
 * is filled in, the other two are derived automatically via the fixed
 * ratios above. If MORE than one is filled and they don't agree with
 * what the formula predicts (within a ₹1 rounding tolerance), that's
 * flagged as an inconsistency rather than silently picking one — see
 * shopAgreement.service.ts, which surfaces this specifically at the
 * Deputy Municipal Commissioner review stage.
 */
/**
 * base_monthly_rent falls back into the "2020-21 onwards" slot when
 * that specific legacy field isn't set - base_monthly_rent is the
 * PRIMARY field an operator fills in for a normal, new agreement (the
 * three rent_pre_2019/2019_20/2020_21_onwards fields exist
 * specifically for reconstructing OLD migrated agreements' history,
 * not for everyday new entries). Without this fallback, a completely
 * ordinary new agreement with only base_monthly_rent filled in would
 * resolve to "no rent on file at all", since resolveRentPeriodsFromValues
 * only ever looked at those three legacy fields. Any back-derived
 * pre-2019/2019-20 figures from this fallback are harmless for a new
 * agreement - calculateEffectiveMonthlyRent never applies them to a
 * month before those years exist.
 */
export function resolveRentPeriods(agreement: ShopAgreementRow): ResolvedRentPeriods | null {
  return resolveRentPeriodsFromValues(agreement.rent_pre_2019, agreement.rent_2019_20, agreement.rent_2020_21_onwards ?? agreement.base_monthly_rent);
}

function fyStartYear(ym: YearMonth): number {
  return ym.month >= 4 ? ym.year : ym.year - 1;
}

/**
 * The effective monthly rent for a given calendar month. If the shop
 * has manually-entered escalation periods on file (the accurate,
 * per-agreement system), those take priority - see
 * findApplicablePeriod. Only when no period covers forMonth (most
 * commonly: no periods have been entered for this shop at all yet)
 * does this fall back to the old fixed municipality-wide formula
 * below, which assumes every shop followed the same 2019-20/2020-21/
 * triennial-5% schedule. Returns 0 if neither source has anything on file.
 */
export function calculateEffectiveMonthlyRent(
  agreement: ShopAgreementRow,
  forMonth: YearMonth,
  escalationPeriods: ShopRentEscalationPeriodRow[] = [],
): number {
  if (escalationPeriods.length > 0) {
    const applicable = findApplicablePeriod(escalationPeriods, forMonth);
    if (applicable) return calculateRentFromPeriod(applicable, forMonth).rent;
  }

  const resolved = resolveRentPeriods(agreement);
  if (!resolved) return 0;

  const fy = fyStartYear(forMonth);

  if (fy < 2019) return resolved.prePeriod;
  if (fy === 2019) return resolved.period2019_20;
  if (fy < 2024) return resolved.period2020_21Onwards;

  const stepsElapsed = Math.floor((fy - 2024) / 3);
  return resolved.period2020_21Onwards * Math.pow(RATE_TRIENNIAL_STEP, stepsElapsed);
}

export interface AgreementCompletenessCheck {
  isComplete: boolean;
  missingFields: string[];
}

/**
 * What's needed to generate a meaningful rent demand - checked lazily
 * right before generation, NOT at data-entry or approval time (see
 * migration 043's header comment: nothing is mandatory to enter, but
 * a specific action can require specific fields and say so clearly).
 * Without this check, a shop with no base_monthly_rent on file and no
 * escalation periods would silently generate a ₹0 demand rather than
 * being blocked with a clear explanation.
 */
export function checkAgreementCompletenessForDemand(
  agreement: ShopAgreementRow,
  escalationPeriods: ShopRentEscalationPeriodRow[] = [],
): AgreementCompletenessCheck {
  const missing: string[] = [];
  if (!agreement.holder_name) missing.push("Tenant/holder name");

  const hasResolvableRent = escalationPeriods.length > 0 || resolveRentPeriods(agreement) !== null;
  if (!hasResolvableRent) missing.push("Base monthly rent (or at least one escalation period)");

  if (!agreement.agreement_start_date && !agreement.rent_paid_till_month) {
    missing.push("Agreement start date or rent-paid-till month (needed to know which months are pending)");
  }

  return { isComplete: missing.length === 0, missingFields: missing };
}

const PENALTY_RATE = 0.02; // 2%, compounded per full year overdue

/**
 * No penalty at all until a month's rent has been overdue for a full
 * year. Once it crosses that mark, penalty compounds 2% per full year
 * elapsed (not pro-rated for partial years) — e.g. 18 months overdue =
 * 1 full year = ~2%; 30 months overdue = 2 full years = ~4.04%.
 */
export function calculatePenaltyForMonth(baseRent: number, monthsOverdue: number): number {
  const yearsOverdue = Math.floor(monthsOverdue / 12);
  if (yearsOverdue < 1) return 0;
  return baseRent * (Math.pow(1 + PENALTY_RATE, yearsOverdue) - 1);
}

export interface PendingRentMonth {
  month: string; // YYYY-MM
  baseRent: number;
  penalty: number;
  total: number;
  /** True if this month's rent came from an escalation period whose percent/interval aren't known yet - the base rent shown is accurate as of that period's start, but whether it should have escalated further by this month is unverified. Surfaced per-month since a shop's later periods may be resolved even if an earlier one wasn't. */
  isUnresolved: boolean;
}

export interface PendingRentSummary {
  pendingMonths: PendingRentMonth[];
  totalBase: number;
  totalPenalty: number;
  totalPending: number;
  note: string;
  rentPeriodsInconsistent: boolean;
  /** True if ANY pending month relied on an unresolved escalation period - a review-needed signal at the summary level, independent of rentPeriodsInconsistent (which is about the OLD legacy fields disagreeing with each other, a different kind of problem). */
  hasUnresolvedEscalation: boolean;
}

/**
 * Same "never trust a stored balance, always derive fresh from
 * paid-till + today" principle as summarizeArrears() for property tax.
 * Every month from rent_paid_till_month+1 through the current month
 * (inclusive — this month's rent is already due) gets its own
 * schedule-adjusted base rent and its own penalty, evaluated against
 * how long THAT specific month has been outstanding.
 */
export function summarizePendingRent(
  agreement: ShopAgreementRow,
  asOfDate: Date = new Date(),
  escalationPeriods: ShopRentEscalationPeriodRow[] = [],
): PendingRentSummary {
  const paidTill = parseYearMonth(agreement.rent_paid_till_month);
  const startDate = agreement.agreement_start_date ? new Date(agreement.agreement_start_date) : null;
  const startMonth: YearMonth | null = startDate ? { year: startDate.getFullYear(), month: startDate.getMonth() + 1 } : null;
  const nowMonth = currentYearMonth(asOfDate);
  const resolved = resolveRentPeriods(agreement);

  const rawPendingStart = paidTill ? { year: paidTill.year, month: paidTill.month + 1 } : startMonth;
  if (!rawPendingStart) {
    return {
      pendingMonths: [],
      totalBase: 0,
      totalPenalty: 0,
      totalPending: 0,
      note: "Neither rent-paid-till nor agreement start date is on file — cannot determine pending rent. Please complete this agreement's details.",
      rentPeriodsInconsistent: false,
      hasUnresolvedEscalation: false,
    };
  }
  const normalizedStart =
    rawPendingStart.month > 12 ? { year: rawPendingStart.year + 1, month: rawPendingStart.month - 12 } : rawPendingStart;

  if (monthsDiff(normalizedStart, nowMonth) < 0) {
    return {
      pendingMonths: [],
      totalBase: 0,
      totalPenalty: 0,
      totalPending: 0,
      note: "Rent paid up to date.",
      rentPeriodsInconsistent: resolved ? !resolved.isConsistent : false,
      hasUnresolvedEscalation: false,
    };
  }

  const months = monthRange(normalizedStart, nowMonth);
  const pendingMonths: PendingRentMonth[] = months.map((m) => {
    const applicable = escalationPeriods.length > 0 ? findApplicablePeriod(escalationPeriods, m) : null;
    const baseRent = calculateEffectiveMonthlyRent(agreement, m, escalationPeriods);
    const isUnresolved = applicable ? calculateRentFromPeriod(applicable, m).isUnresolved : false;
    const monthsOverdue = Math.max(0, monthsDiff(m, nowMonth));
    const penalty = calculatePenaltyForMonth(baseRent, monthsOverdue);
    return { month: formatYearMonth(m), baseRent, penalty, total: baseRent + penalty, isUnresolved };
  });

  const totalBase = pendingMonths.reduce((sum, m) => sum + m.baseRent, 0);
  const totalPenalty = pendingMonths.reduce((sum, m) => sum + m.penalty, 0);
  const hasUnresolvedEscalation = pendingMonths.some((m) => m.isUnresolved);

  return {
    pendingMonths,
    totalBase,
    totalPenalty,
    totalPending: totalBase + totalPenalty,
    note:
      `${pendingMonths.length} month(s) pending, from ${formatYearMonth(normalizedStart)} to ${formatYearMonth(nowMonth)}.` +
      (totalPenalty > 0 ? ` Includes penalty for months overdue more than a year.` : ""),
    rentPeriodsInconsistent: resolved ? !resolved.isConsistent : false,
    hasUnresolvedEscalation,
  };
}