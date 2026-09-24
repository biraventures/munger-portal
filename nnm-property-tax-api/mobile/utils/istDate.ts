/**
 * The original Apps Script system did everything in Asia/Kolkata
 * (TZ = 'Asia/Kolkata'). Field staff mark in/out during the working day
 * in that timezone, so "today" and shift-start comparisons need to be
 * computed in IST regardless of what timezone the server itself runs
 * in - never assume the server's local time is IST.
 */
const IST_OFFSET_MINUTES = 5 * 60 + 30;

/** Returns "yyyy-MM-dd" for the given instant, as a date in IST. */
export function istDateString(d: Date = new Date()): string {
  const istMs = d.getTime() + IST_OFFSET_MINUTES * 60000;
  const ist = new Date(istMs);
  const yyyy = ist.getUTCFullYear();
  const mm = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(ist.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Returns "HH:mm:ss" for the given instant, as a time in IST. */
export function istTimeString(d: Date): string {
  const istMs = d.getTime() + IST_OFFSET_MINUTES * 60000;
  const ist = new Date(istMs);
  const hh = String(ist.getUTCHours()).padStart(2, "0");
  const mm = String(ist.getUTCMinutes()).padStart(2, "0");
  const ss = String(ist.getUTCSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/** Combines today's IST date with a "HH:mm" or "HH:mm:ss" shift-start string, returning the equivalent instant (a real Date, safe to compare against `new Date()`). */
export function istShiftStartToday(shiftStartStr: string, now: Date = new Date()): Date {
  const parts = shiftStartStr.split(":").map((n) => parseInt(n, 10));
  const hh = parts[0] ?? 0;
  const mm = parts[1] ?? 0;
  const todayIst = istDateString(now);
  // Construct the instant by taking today's IST calendar date and the
  // shift's HH:mm, treated as IST wall-clock time, then converting back
  // to a UTC instant by subtracting the IST offset.
  const dateParts = todayIst.split("-").map((n) => parseInt(n, 10));
  const y = dateParts[0]!;
  const mo = dateParts[1]!;
  const da = dateParts[2]!;
  const asIfUtc = Date.UTC(y, mo - 1, da, hh, mm, 0);
  return new Date(asIfUtc - IST_OFFSET_MINUTES * 60000);
}
