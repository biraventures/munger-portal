import { getOperatorToken } from "./auth";
import { getAdminToken } from "./admin-auth";
import { blobToBase64, prepareUpload } from "./upload-limits";

const API_BASE_URL = process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";

export type ExemptionLogin = "operator" | "admin";

/** What a property change carries (see the API's TaxExemptionInput). */
export interface TaxExemptionInput {
  isExempt: boolean;
  category?: string | null;
  orderNo?: string | null;
  orderDate?: string | null;
  fromYear?: string | null;
  remarks?: string | null;
  orderDocId?: string | null;
}

/** Form state for the exemption section - the input plus a newly chosen order file, if any. */
export interface TaxExemptionFormState {
  isExempt: boolean;
  category: string;
  orderNo: string;
  orderDate: string;
  fromYear: string;
  remarks: string;
  orderDocId: string;
  newOrderFile: File | null;
}

export interface TaxExemptionOptions {
  categories: string[];
  allowedExtensions: string[];
  maxFileBytes: number;
}

export function blankExemption(): TaxExemptionFormState {
  return { isExempt: false, category: "", orderNo: "", orderDate: "", fromYear: "", remarks: "", orderDocId: "", newOrderFile: null };
}

/** From a stored property row (snake_case columns). */
export function exemptionFromProperty(p: Record<string, unknown>): TaxExemptionFormState {
  const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  return {
    isExempt: Boolean(p.is_tax_exempt),
    category: s(p.tax_exempt_category),
    orderNo: s(p.tax_exempt_order_no),
    orderDate: s(p.tax_exempt_order_date),
    fromYear: s(p.tax_exempt_from_year),
    remarks: s(p.tax_exempt_remarks),
    orderDocId: s(p.tax_exempt_order_doc_id),
    newOrderFile: null,
  };
}

/** From a change request's proposed data (camelCase), e.g. when correcting a reverted request. */
export function exemptionFromInput(e: TaxExemptionInput | undefined | null): TaxExemptionFormState | null {
  if (!e) return null;
  return {
    isExempt: Boolean(e.isExempt),
    category: e.category ?? "",
    orderNo: e.orderNo ?? "",
    orderDate: e.orderDate ?? "",
    fromYear: e.fromYear ?? "",
    remarks: e.remarks ?? "",
    orderDocId: e.orderDocId ? String(e.orderDocId) : "",
    newOrderFile: null,
  };
}

function token(as: ExemptionLogin): string {
  const t = as === "admin" ? getAdminToken() : getOperatorToken();
  if (!t) throw new Error("Not logged in - please log in again.");
  return t;
}

async function fail(res: Response, fallback: string): Promise<Error> {
  const body = await res.json().catch(() => ({}));
  return new Error(body.error || fallback);
}

export async function fetchTaxExemptionOptions(as: ExemptionLogin = "operator"): Promise<TaxExemptionOptions> {
  const res = await fetch(`${API_BASE_URL}/properties/tax-exemption/options`, { headers: { Authorization: `Bearer ${token(as)}` } });
  if (!res.ok) throw await fail(res, "Could not load exemption options.");
  return res.json();
}


export async function uploadExemptionOrder(holdingNo: string, file: File, as: ExemptionLogin = "operator"): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/properties/${encodeURIComponent(holdingNo)}/exemption-order`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token(as)}`, "Content-Type": "application/json" },
    body: JSON.stringify(await (async () => { const u = await prepareUpload(file); return { fileName: u.name, fileDataBase64: await blobToBase64(u.blob) }; })()),
  });
  if (!res.ok) throw await fail(res, "Could not upload the order copy.");
  return String((await res.json()).document.id);
}

/** Opens the scanned order in a new tab (the file endpoint needs the Bearer header, so it is fetched as a blob). */
export async function openExemptionOrder(docId: string, as: ExemptionLogin): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/properties/tax-exemption/orders/${encodeURIComponent(docId)}/file`, { headers: { Authorization: `Bearer ${token(as)}` } });
  if (!res.ok) throw await fail(res, "Could not open the order copy.");
  const url = URL.createObjectURL(await res.blob());
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Turns the form state into what the save carries, uploading a newly chosen order
 * file first. Throws a readable error when marking exempt without the required details.
 */
export async function finalizeExemption(holdingNo: string, s: TaxExemptionFormState, as: ExemptionLogin = "operator"): Promise<TaxExemptionInput> {
  if (!s.isExempt) return { isExempt: false };
  const missing = [
    !s.category && "category",
    !s.orderNo.trim() && "order number",
    !s.orderDate && "order date",
    !s.fromYear && "exempt-from year",
    s.category === "Other" && !s.remarks.trim() && "remarks (required for Other)",
    !s.newOrderFile && !s.orderDocId && "a copy of the order",
  ].filter(Boolean);
  if (missing.length) throw new Error(`Holding tax exemption: please give ${missing.join(", ")}.`);
  const orderDocId = s.newOrderFile ? await uploadExemptionOrder(holdingNo, s.newOrderFile, as) : s.orderDocId;
  return {
    isExempt: true,
    category: s.category,
    orderNo: s.orderNo.trim(),
    orderDate: s.orderDate,
    fromYear: s.fromYear,
    remarks: s.remarks.trim() || null,
    orderDocId,
  };
}
