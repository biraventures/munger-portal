/** "yyyy-mm-dd" (HTML date input format) -> "dd-mm-yyyy" (this app's display format). Returns the input unchanged if it doesn't match. */
export function formatYmdToDmy(ymd: string): string {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd;
  return `${m[3]}-${m[2]}-${m[1]}`;
}
