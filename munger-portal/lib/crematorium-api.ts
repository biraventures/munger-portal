import { getAdminToken } from "./admin-auth";

/** Electric crematorium tickets: counter, Prabhari / officers, and the public check of a printed ticket (crematorium.service.ts). */

const API_BASE_URL = process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";

async function call<T>(path: string, init: RequestInit = {}, auth = true, fallback = "Something went wrong."): Promise<T> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) {
    const token = getAdminToken();
    if (!token) throw new Error("Not logged in - please log in again.");
    h.Authorization = `Bearer ${token}`;
  }
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers: h });
  } catch {
    throw new Error("No connection - check the internet and try again.");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `${fallback} (error ${res.status}).`);
  return body as T;
}

export type CremationPaymentMode = "cash" | "pos_card" | "pos_upi";

export interface CremationTicket {
  id: number;
  ticketNo: string;
  deceasedName: string;
  informantName: string;
  informantRelation: string;
  informantAddress: string;
  informantPhone: string;
  cremationDate: string;
  cremationTime: string;
  remarks: string | null;
  amount: number;
  paymentMode: CremationPaymentMode;
  paymentModeLabel: string;
  posReference: string | null;
  status: "issued" | "cancelled";
  issuedBy: string;
  issuedByName: string | null;
  issuedAt: string;
  issuedAtText: string;
  cancelledAtText: string | null;
  cancelledByName: string | null;
  cancelReason: string | null;
  verifyUrl: string;
}

export interface CounterToday {
  fee: number | null;
  cancelWindowMinutes: number;
  today: { tickets: number; amount: number; cash: number; posCard: number; posUpi: number; cancelled: number };
  tickets: CremationTicket[];
}

export interface CremationTicketInput {
  deceasedName: string;
  informantName: string;
  informantRelation: string;
  informantAddress: string;
  informantPhone: string;
  cremationDate: string;
  cremationTime: string;
  remarks?: string | null;
  paymentMode: CremationPaymentMode;
  posReference?: string | null;
}

export const fetchCounterToday = () => call<CounterToday>("/crematorium/counter/today");
export const cutCremationTicket = (input: CremationTicketInput) =>
  call<{ ticket: CremationTicket }>(
    "/crematorium/tickets",
    { method: "POST", body: JSON.stringify(input) },
    true,
    "Could not cut the ticket",
  ).then((r) => r.ticket);
export const fetchCremationTicket = (id: number) => call<{ ticket: CremationTicket }>(`/crematorium/tickets/${id}`).then((r) => r.ticket);
export const cancelCremationTicket = (id: number, reason: string) =>
  call<{ ok: true }>(`/crematorium/tickets/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason }) }, true, "Could not cancel");

export interface CremationReport {
  fee: { amount: number; setAt: string; setByName: string | null } | null;
  totals: { tickets: number; amount: number; cash: number; posCard: number; posUpi: number; cancelled: number };
  byCounter: { username: string; name: string | null; tickets: number; amount: number; cash: number; pos: number }[];
  counters: { username: string; display_name: string; active: boolean }[];
  tickets: CremationTicket[];
  truncated: boolean;
}
export function fetchCremationReport(opts: { from: string; to: string; q?: string; counter?: string }) {
  const p = new URLSearchParams({ from: opts.from, to: opts.to });
  if (opts.q?.trim()) p.set("q", opts.q.trim());
  if (opts.counter) p.set("counter", opts.counter);
  return call<CremationReport>(`/crematorium/report?${p}`);
}
export const fetchCremationFees = () =>
  call<{ history: { amount: number; remarks: string | null; set_by_name: string | null; set_at: string }[] }>("/crematorium/fees").then(
    (r) => r.history,
  );
export const setCremationFee = (amount: number, remarks: string) =>
  call<{ ok: true }>("/crematorium/fee", { method: "PUT", body: JSON.stringify({ amount, remarks }) }, true, "Could not save the fee");

export interface VerifiedCremation {
  ticketNo: string;
  deceasedName: string;
  cremationDate: string;
  cremationTime: string;
  amount: number;
  status: "issued" | "cancelled";
  issuedAtText: string;
}
export const verifyCremationTicket = (ticketNo: string, sig: string) =>
  call<VerifiedCremation>(
    `/public/crematorium/tickets/${encodeURIComponent(ticketNo)}?sig=${encodeURIComponent(sig)}`,
    {},
    false,
    "Could not check the ticket",
  );

export const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
/** YYYY-MM-DD -> DD-MM-YYYY */
export const dmy = (d: string) => d.split("-").reverse().join("-");
export function todayIst(): string {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
}
export function nowTimeIst(): string {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(11, 16);
}
