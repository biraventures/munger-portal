/**
 * Notional ARV of vacant land = vacant-land tax x 100/9 (display only; the tax
 * itself is levied directly). Notices frozen before this was introduced carry
 * no `vacant.arv` and an `arv` that is built-up only, so both are derived here.
 */
interface VacantCalc {
  arv: string;
  vacant: { tax: string; arv?: string };
}

export function vacantArv(calc: VacantCalc): string {
  if (calc.vacant.arv !== undefined) return calc.vacant.arv;
  return ((Number(calc.vacant.tax) * 100) / 9).toFixed(2);
}

export function totalArv(calc: VacantCalc): string {
  if (calc.vacant.arv !== undefined) return calc.arv;
  return (Number(calc.arv) + Number(vacantArv(calc))).toFixed(2);
}
