import { getAdminToken } from "./admin-auth";
import { blobToBase64, prepareUpload } from "./upload-limits";

/** Historical part payments on old holdings: Tax Daroga records, City Manager approves (historicalPayment.service.ts). */

const API_BASE_URL = process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";

function headers(json = true): HeadersInit {
  const token = getAdminToken();
  if (!token) throw new Error("Not logged in - please log in again.");
  return json ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { Authorization: `Bearer ${token}` };
}

async function call<T>(path: string, init: RequestInit = {}, fallback = "Something went wrong."): Promise<T> {
  const res = await fetch(`${API_BASE_URL}/admin/historical-payments${path}`, { ...init, headers: headers() });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 413) throw new Error("The file is too large for the server.");
    throw new Error(body.error || `${fallback} (error ${res.status}).`);
  }
  return body as T;
}

export interface OldPayment {
  paidOn: string;
  amount: number;
  reference: string;
  remarks?: string | null;
}

export interface StatementYear {
  year: number;
  label: string;
  tax: number;
  paid: number;
  balance: number;
  from: { index: number; amount: number }[];
}

export interface Settlement {
  startYear: number;
  startLabel: string;
  previousTaxPaidTillYear: string | null;
  totalPaid: number;
  totalSettled: number;
  excess: number;
  statement: StatementYear[];
  paidTillYearAfter: string | null;
  partial: { year: number; label: string; paid: number; balance: number } | null;
  dueAfter: number;
  dueBefore: number;
}

export interface SavedSettlement {
  id: string;
  holding_no: string;
  status: "pending" | "approved" | "returned";
  previous_tax_paid_till_year: string | null;
  start_year: number;
  total_paid: string;
  statement: StatementYear[];
  paid_till_year_after: string | null;
  partial_year: number | null;
  partial_paid: string | null;
  partial_balance: string | null;
  remarks: string | null;
  entered_by_name: string | null;
  entered_at: string;
  decided_by_name: string | null;
  decided_at: string | null;
  decision_remarks: string | null;
  payments: { id: number; paidOn: string; amount: number; reference: string; remarks: string | null; hasProof: boolean }[];
}

export interface HoldingLookup {
  holding: {
    holdingNo: string;
    ownerName: string | null;
    ward: string | null;
    address: string | null;
    oldHoldingNo: string | null;
    holdingCreationYear: string | null;
    taxPaidTillYear: string | null;
  };
  dueFrom: string | null;
  dueBefore: number | null;
  blocked: string | null;
  settlements: SavedSettlement[];
}

export interface PendingSettlement {
  id: string;
  holding_no: string;
  owner_name: string | null;
  ward: string | null;
  total_paid: number;
  paid_till_year_after: string | null;
  partial_year: number | null;
  partial_balance: number | null;
  entered_by_name: string | null;
  entered_at: string;
  payments: number;
}

export const lookupHistoricalHolding = (holdingNo: string) =>
  call<HoldingLookup>(`/holding/${encodeURIComponent(holdingNo.trim())}`, {}, "Could not load the holding.");
export const previewSettlement = (holdingNo: string, payments: OldPayment[]) =>
  call<Settlement>("/preview", { method: "POST", body: JSON.stringify({ holdingNo, payments }) }, "Could not settle.");
export const createSettlement = (holdingNo: string, payments: OldPayment[], remarks: string | null) =>
  call<{ id: number; settlement: Settlement }>(
    "",
    { method: "POST", body: JSON.stringify({ holdingNo, payments, remarks }) },
    "Could not save.",
  );
export const fetchPendingSettlements = () => call<{ settlements: PendingSettlement[] }>("/pending").then((r) => r.settlements);
export const fetchSettlementPendingCount = () => call<{ pending: number }>("/pending-count").then((r) => r.pending);
export const approveSettlement = (id: string, remarks: string | null) =>
  call<{ approved: boolean; taxPaidTillYear: string | null; noticesClosed: number }>(
    `/${id}/approve`,
    { method: "POST", body: JSON.stringify({ remarks }) },
    "Could not approve.",
  );
export const returnSettlement = (id: string, reason: string) =>
  call(`/${id}/return`, { method: "POST", body: JSON.stringify({ reason }) }, "Could not send back.");

export async function uploadPaymentProof(paymentId: number, file: File): Promise<void> {
  const ready = await prepareUpload(file);
  if (!["image/jpeg", "image/png", "application/pdf"].includes(ready.type)) throw new Error("Choose a photo (JPG / PNG) or a PDF.");
  const base64 = await blobToBase64(ready.blob);
  await call(
    `/payment/${paymentId}/proof`,
    { method: "PUT", body: JSON.stringify({ file: { base64, mime: ready.type } }) },
    "Could not upload.",
  );
}

export async function openPaymentProof(paymentId: number): Promise<void> {
  const win = window.open("", "_blank");
  const res = await fetch(`${API_BASE_URL}/admin/historical-payments/payment/${paymentId}/proof`, { headers: headers(false) });
  if (!res.ok) {
    win?.close();
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not open the proof.");
  }
  const url = URL.createObjectURL(await res.blob());
  if (win) win.location.href = url;
  else window.location.href = url;
}

export const inr = (n: number | string | null | undefined) =>
  `₹${Number(n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
