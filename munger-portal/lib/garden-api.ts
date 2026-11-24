import { getAdminToken } from "./admin-auth";

/** Garden entry tickets: counter, gate, officers and the public pages (garden.service.ts). */

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

export type PaymentMode = "cash" | "pos_card" | "pos_upi" | "online";

export interface Ticket {
  id: number;
  ticketNo: string;
  gardenId: number;
  gardenName: string;
  gardenNameHi: string | null;
  visitDate: string;
  issuedAt: string;
  issuedAtText: string;
  persons: number;
  feePerPerson: number;
  amount: number;
  channel: "counter" | "online";
  paymentMode: PaymentMode;
  paymentModeLabel: string;
  posReference: string | null;
  status: "pending_payment" | "paid" | "failed" | "cancelled";
  soldBy: string | null;
  usedAt: string | null;
  usedAtText: string | null;
  usedBy: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  url: string;
}

export interface CounterToday {
  garden: { id: number; name: string; nameHi: string | null; feePerPerson: number; maxPersons: number; active: boolean };
  today: { tickets: number; persons: number; amount: number; cash: number; posCard: number; posUpi: number; cancelled: number };
  tickets: Ticket[];
}

export interface Garden {
  id: number;
  name: string;
  name_hi: string | null;
  code: string;
  fee_per_person: number;
  max_persons_per_ticket: number;
  active: boolean;
  staff: { username: string; name: string; active: boolean }[];
  publicUrl: string;
}

export interface CounterLogin {
  username: string;
  display_name: string;
  active: boolean;
  garden_id: number | null;
  garden_name: string | null;
}

export interface GardenReport {
  totals: { tickets: number; persons: number; amount: number; used: number };
  byDay: { day: string; tickets: number; persons: number; amount: number }[];
  byMode: { mode: PaymentMode; label: string; tickets: number; persons: number; amount: number }[];
  bySeller: { seller: string; garden: string; tickets: number; persons: number; amount: number; cash: number | null }[];
  byGarden: { garden: string; tickets: number; persons: number; amount: number }[];
  cancelled: number;
  tickets: Ticket[];
}

// counter / gate
export const fetchCounterToday = () => call<CounterToday>("/garden/counter/today");
export const sellTicket = (body: {
  persons: number;
  paymentMode: Exclude<PaymentMode, "online">;
  posReference?: string | null;
  admitNow: boolean;
}) => call<Ticket>("/garden/counter/tickets", { method: "POST", body: JSON.stringify(body) }, true, "Could not issue the ticket.");
export const cancelTicket = (id: number, reason: string) =>
  call(`/garden/tickets/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason }) }, true, "Could not cancel.");
export const admitTicket = (scanned: string) =>
  call<{ admitted: boolean; reason: string | null; ticket: Ticket }>(
    "/garden/gate/admit",
    { method: "POST", body: JSON.stringify({ scanned }) },
    true,
    "Could not check the ticket.",
  );

// officers
export const fetchGardens = () => call<{ gardens: Garden[] }>("/garden/gardens").then((r) => r.gardens);
export const saveGarden = (g: {
  id?: number;
  name: string;
  nameHi: string | null;
  feePerPerson: number;
  maxPersonsPerTicket: number;
  active: boolean;
}) =>
  call(
    g.id ? `/garden/gardens/${g.id}` : "/garden/gardens",
    { method: g.id ? "PUT" : "POST", body: JSON.stringify(g) },
    true,
    "Could not save the garden.",
  );
export const fetchCounterLogins = () => call<{ logins: CounterLogin[] }>("/garden/counter-logins").then((r) => r.logins);
export const assignCounter = (username: string, gardenId: number | null) =>
  call(
    `/garden/counter-logins/${encodeURIComponent(username)}`,
    { method: "PUT", body: JSON.stringify({ gardenId }) },
    true,
    "Could not assign.",
  );
export const fetchGardenReport = (from: string, to: string, gardenId?: number) =>
  call<GardenReport>(`/garden/report?from=${from}&to=${to}${gardenId ? `&gardenId=${gardenId}` : ""}`);

// public
export interface PublicGarden {
  name: string;
  name_hi: string | null;
  fee_per_person: number;
  max_persons_per_ticket: number;
  active: boolean;
  onlinePayment: boolean;
}
export const fetchPublicGarden = (code: string) =>
  call<PublicGarden>(`/public/gardens/${encodeURIComponent(code)}`, {}, false, "Garden not found.");
export const fetchPublicTicket = (ticketNo: string, sig: string) =>
  call<Ticket>(`/public/gardens/ticket/${encodeURIComponent(ticketNo)}?sig=${encodeURIComponent(sig)}`, {}, false, "Ticket not found.");
export const startPurchase = (code: string, persons: number) =>
  call<{ redirectUrl?: string }>(
    `/public/gardens/${encodeURIComponent(code)}/purchase`,
    { method: "POST", body: JSON.stringify({ persons }) },
    false,
    "Could not start the payment.",
  );

export const rupees = (n: number) => `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
export const todayIst = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
export const dmy = (iso: string) => iso.split("-").reverse().join("-");
