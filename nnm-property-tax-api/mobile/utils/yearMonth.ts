/** "YYYY-MM" <-> a simple {year, month} pair, month is 1-12. */
export interface YearMonth {
  year: number;
  month: number; // 1-12
}

export function parseYearMonth(value: string | null | undefined): YearMonth | null {
  if (!value) return null;
  const match = String(value).trim().match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = parseInt(match[1]!, 10);
  const month = parseInt(match[2]!, 10);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

export function formatYearMonth(ym: YearMonth): string {
  return `${ym.year}-${String(ym.month).padStart(2, "0")}`;
}

export function currentYearMonth(asOfDate: Date = new Date()): YearMonth {
  return { year: asOfDate.getFullYear(), month: asOfDate.getMonth() + 1 };
}

/** Total months between two YearMonths (b - a), can be negative. */
export function monthsDiff(a: YearMonth, b: YearMonth): number {
  return (b.year - a.year) * 12 + (b.month - a.month);
}

export function addMonths(ym: YearMonth, n: number): YearMonth {
  const total = ym.year * 12 + (ym.month - 1) + n;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

/** Every YearMonth from start to end inclusive, in order. Empty if start is after end. */
export function monthRange(start: YearMonth, end: YearMonth): YearMonth[] {
  const result: YearMonth[] = [];
  let cursor = start;
  while (monthsDiff(cursor, end) >= 0) {
    result.push(cursor);
    cursor = addMonths(cursor, 1);
  }
  return result;
}