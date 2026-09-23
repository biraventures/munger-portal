import { fieldStaffAttendanceRepository } from "../repositories/fieldStaffAttendance.repository";
import { fieldDriverAttendanceRepository } from "../repositories/fieldDriverAttendance.repository";
import { fieldAssistantAttendanceRepository } from "../repositories/fieldAssistantAttendance.repository";
import { attendanceWardRepository } from "../repositories/attendanceWard.repository";
import { csvRow } from "../utils/csv";
import type { AttendanceStatus } from "../types/attendance.types";

const STATUS_CODE: Record<AttendanceStatus, string> = {
  present: "P",
  half_day: "HD",
  absent_informed: "AI",
  absent_not_informed: "AN",
  absent: "A",
};

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate(); // month is 1-indexed here; day 0 of next month = last day of this one
}

/**
 * The pg driver parses a SQL DATE column as a JS Date object (UTC
 * midnight of that calendar date), not a string - but a query built
 * with string concatenation, or a different pg type-parser
 * configuration, could hand back a plain "yyyy-MM-dd" string
 * instead. Handle both rather than assuming one.
 */
function dayOfMonthFrom(date: string | Date): number {
  if (date instanceof Date) return date.getUTCDate();
  return parseInt(date.slice(8, 10), 10);
}

function monthDateRange(year: number, month: number): { fromDate: string; toDate: string; days: number } {
  const days = daysInMonth(year, month);
  const mm = String(month).padStart(2, "0");
  return {
    fromDate: `${year}-${mm}-01`,
    toDate: `${year}-${mm}-${String(days).padStart(2, "0")}`,
    days,
  };
}

/**
 * Port of the monthly matrix report - one row per staff member, one
 * column per day of the month, cell = status code (P/HD/AI/AN/A) or
 * blank if nothing was recorded that day for that person (e.g. they
 * joined partway through the month).
 */
export async function buildStaffMonthlyCsv(year: number, month: number): Promise<string> {
  const { fromDate, toDate, days } = monthDateRange(year, month);
  const [attendance, wards] = await Promise.all([
    fieldStaffAttendanceRepository.listForDateRange(fromDate, toDate),
    attendanceWardRepository.listAll(),
  ]);
  const wardNameById = new Map(wards.map((w) => [w.id, w.ward_name]));

  const byStaff = new Map<number, { name: string; wardId: number; byDay: Map<number, string> }>();
  for (const a of attendance) {
    let entry = byStaff.get(a.staff_id);
    if (!entry) {
      entry = { name: a.staff_name, wardId: a.ward_id, byDay: new Map() };
      byStaff.set(a.staff_id, entry);
    }
    const dayNum = dayOfMonthFrom(a.date);
    entry.byDay.set(dayNum, STATUS_CODE[a.status]);
  }

  const header = ["Staff Name", "Ward", ...Array.from({ length: days }, (_, i) => String(i + 1))];
  const lines = [csvRow(header)];

  const sortedStaff = Array.from(byStaff.entries()).sort((a, b) => a[1].name.localeCompare(b[1].name));
  for (const [, entry] of sortedStaff) {
    const dayCells = Array.from({ length: days }, (_, i) => entry.byDay.get(i + 1) ?? "");
    lines.push(csvRow([entry.name, wardNameById.get(entry.wardId) ?? "", ...dayCells]));
  }

  return lines.join("\n");
}

/** Same idea, for drivers. */
export async function buildDriverMonthlyCsv(year: number, month: number): Promise<string> {
  const { fromDate, toDate, days } = monthDateRange(year, month);
  const [attendance, wards] = await Promise.all([
    fieldDriverAttendanceRepository.listForReport({ fromDate, toDate }),
    attendanceWardRepository.listAll(),
  ]);
  const wardNameById = new Map(wards.map((w) => [w.id, w.ward_name]));

  const byDriver = new Map<number, { name: string; wardId: number; byDay: Map<number, string> }>();
  for (const a of attendance) {
    let entry = byDriver.get(a.driver_id);
    if (!entry) {
      entry = { name: a.driver_name, wardId: a.ward_id, byDay: new Map() };
      byDriver.set(a.driver_id, entry);
    }
    const dayNum = dayOfMonthFrom(a.date);
    entry.byDay.set(dayNum, STATUS_CODE[a.status]);
  }

  const header = ["Driver Name", "Ward", ...Array.from({ length: days }, (_, i) => String(i + 1))];
  const lines = [csvRow(header)];

  const sortedDrivers = Array.from(byDriver.entries()).sort((a, b) => a[1].name.localeCompare(b[1].name));
  for (const [, entry] of sortedDrivers) {
    const dayCells = Array.from({ length: days }, (_, i) => entry.byDay.get(i + 1) ?? "");
    lines.push(csvRow([entry.name, wardNameById.get(entry.wardId) ?? "", ...dayCells]));
  }

  return lines.join("\n");
}

/** Same idea, for driver assistants - fully missing from reports until now. */
export async function buildAssistantMonthlyCsv(year: number, month: number): Promise<string> {
  const { fromDate, toDate, days } = monthDateRange(year, month);
  const [attendance, wards] = await Promise.all([
    fieldAssistantAttendanceRepository.listForReport({ fromDate, toDate }),
    attendanceWardRepository.listAll(),
  ]);
  const wardNameById = new Map(wards.map((w) => [w.id, w.ward_name]));

  const byAssistant = new Map<number, { name: string; wardId: number; byDay: Map<number, string> }>();
  for (const a of attendance) {
    let entry = byAssistant.get(a.assistant_id);
    if (!entry) {
      entry = { name: a.assistant_name, wardId: a.ward_id, byDay: new Map() };
      byAssistant.set(a.assistant_id, entry);
    }
    const dayNum = dayOfMonthFrom(a.date);
    entry.byDay.set(dayNum, STATUS_CODE[a.status]);
  }

  const header = ["Assistant Name", "Ward", ...Array.from({ length: days }, (_, i) => String(i + 1))];
  const lines = [csvRow(header)];

  const sortedAssistants = Array.from(byAssistant.entries()).sort((a, b) => a[1].name.localeCompare(b[1].name));
  for (const [, entry] of sortedAssistants) {
    const dayCells = Array.from({ length: days }, (_, i) => entry.byDay.get(i + 1) ?? "");
    lines.push(csvRow([entry.name, wardNameById.get(entry.wardId) ?? "", ...dayCells]));
  }

  return lines.join("\n");
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}
