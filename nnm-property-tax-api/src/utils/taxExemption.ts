import { parseYearStartOrNull } from "./assessmentYear";
import type { PropertyRow } from "../types/property.types";
import type { TaxExemptionInput } from "../types/propertySave.types";

/**
 * Holding tax exemption rules (migration 118) - the ONE place that decides
 * which years of a holding are exempt. Used by calculateTax (current year)
 * and arrears.service (past years). The solid waste user charge is never
 * affected by any of this.
 */
export const TAX_EXEMPTION_CATEGORIES = [
  "Government order",
  "Religious institution",
  "Charitable / educational institution",
  "Government / public building",
  "Other",
] as const;

type ExemptionFields = Pick<PropertyRow, "is_tax_exempt" | "tax_exempt_from_year">;

/** First assessment year (start number, e.g. 2023 for "2023-2024") the holding is exempt from, or null when it is not exempt. */
export function taxExemptFromYearNum(property: Partial<ExemptionFields>): number | null {
  if (!property.is_tax_exempt) return null;
  return parseYearStartOrNull(property.tax_exempt_from_year);
}

/** Is holding tax for this assessment year (start number) waived? */
export function isTaxExemptForYear(property: Partial<ExemptionFields>, yearStartNum: number): boolean {
  const from = taxExemptFromYearNum(property);
  return from !== null && yearStartNum >= from;
}

/** One-line reason for bills and receipts, e.g. "Exempt from holding tax: Religious institution (Order No. 12/2023 dated 2023-05-04, from 2023-2024)". */
export function taxExemptionReason(property: Partial<PropertyRow>): string {
  const category = property.tax_exempt_category || "Exempt";
  const order = [property.tax_exempt_order_no ? `Order No. ${property.tax_exempt_order_no}` : null, property.tax_exempt_order_date ? `dated ${property.tax_exempt_order_date}` : null]
    .filter(Boolean)
    .join(" ");
  const bits = [order, property.tax_exempt_from_year ? `from ${property.tax_exempt_from_year}` : null].filter(Boolean).join(", ");
  return `Exempt from holding tax: ${category}${bits ? ` (${bits})` : ""}`;
}

/**
 * The exemption columns a draft PropertyRow should carry for a tax preview or an
 * apply: the submitted exemption when given, otherwise whatever is stored.
 */
export function exemptionDraftFields(input: TaxExemptionInput | undefined, existing: Partial<PropertyRow> | null): Partial<PropertyRow> {
  if (input === undefined) {
    return {
      is_tax_exempt: Boolean(existing?.is_tax_exempt),
      tax_exempt_category: existing?.tax_exempt_category ?? null,
      tax_exempt_order_no: existing?.tax_exempt_order_no ?? null,
      tax_exempt_order_date: existing?.tax_exempt_order_date ?? null,
      tax_exempt_from_year: existing?.tax_exempt_from_year ?? null,
      tax_exempt_remarks: existing?.tax_exempt_remarks ?? null,
      tax_exempt_order_doc_id: existing?.tax_exempt_order_doc_id ?? null,
    };
  }
  if (!input.isExempt) return { is_tax_exempt: false };
  return {
    is_tax_exempt: true,
    tax_exempt_category: input.category ?? null,
    tax_exempt_order_no: input.orderNo ?? null,
    tax_exempt_order_date: input.orderDate ?? null,
    tax_exempt_from_year: input.fromYear ?? null,
    tax_exempt_remarks: input.remarks ?? null,
    tax_exempt_order_doc_id: input.orderDocId ?? null,
  };
}

/** Does this submission change the holding's exemption (marking, removing, or changing any order detail)? */
export function exemptionChanged(existing: Partial<PropertyRow>, input: TaxExemptionInput | undefined): boolean {
  if (input === undefined) return false;
  const wasExempt = Boolean(existing.is_tax_exempt);
  if (input.isExempt !== wasExempt) return true;
  if (!input.isExempt) return false;
  const same = (a: unknown, b: unknown) => String(a ?? "").trim() === String(b ?? "").trim();
  return !(
    same(input.category, existing.tax_exempt_category) &&
    same(input.orderNo, existing.tax_exempt_order_no) &&
    same(input.orderDate, existing.tax_exempt_order_date) &&
    same(input.fromYear, existing.tax_exempt_from_year) &&
    same(input.remarks, existing.tax_exempt_remarks) &&
    same(input.orderDocId, existing.tax_exempt_order_doc_id)
  );
}
