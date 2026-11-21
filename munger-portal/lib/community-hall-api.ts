import { getAdminToken } from "./admin-auth";

/** Community hall bookings: public applications / booking status, and the office (communityHall.service.ts). */

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

export interface Hall {
  id: number;
  name: string;
  name_hi: string | null;
  address: string | null;
  capacity: number | null;
  facilities: string | null;
  daily_rent: number;
  security_deposit: number;
  active: boolean;
}
export interface PublicHall extends Hall {
  taken: { from: string; to: string }[];
}
export interface PublicHalls {
  halls: PublicHall[];
  minDate: string;
  maxDate: string;
  maxDays: number;
  onlinePayment: boolean;
}

export interface HallBooking {
  id: number;
  bookingNo: string;
  hallId: number;
  hallName: string;
  hallNameHi: string | null;
  hallAddress: string | null;
  fromDate: string;
  toDate: string;
  days: number;
  applicantName: string;
  applicantPhone: string;
  applicantAddress: string;
  purpose: string;
  expectedGuests: number | null;
  dailyRent: number;
  rentAmount: number;
  depositAmount: number;
  totalAmount: number;
  status: "applied" | "approved" | "confirmed" | "rejected" | "cancelled" | "expired";
  statusLabel: string;
  decidedAt: string | null;
  decidedByName: string | null;
  decisionRemarks: string | null;
  paymentDueDate: string | null;
  paidAt: string | null;
  paymentChannel: string | null;
  paymentMode: string | null;
  paymentModeLabel: string | null;
  paymentReference: string | null;
  paymentRecordedBy: string | null;
  cancelledAt: string | null;
  cancelledByName: string | null;
  cancelReason: string | null;
  depositStatus: "none" | "held" | "settled";
  depositRefunded: number | null;
  depositDeducted: number | null;
  depositRemarks: string | null;
  depositSettledAt: string | null;
  depositSettledBy: string | null;
  eventOver: boolean;
  events?: { at: string; action: string; by: string; role: string; note: string | null }[];
  appliedAt: string;
}
export interface PublicBooking extends HallBooking {
  link: string;
  onlinePayment: boolean;
}

// ---------- public ----------
export const fetchPublicHalls = () => call<PublicHalls>("/public/community-halls", {}, false, "Could not load the halls");
export interface HallApplicationInput {
  hallId: number;
  fromDate: string;
  toDate: string;
  applicantName: string;
  applicantPhone: string;
  applicantAddress: string;
  purpose: string;
  expectedGuests?: number | null;
}
export const applyForHall = (input: HallApplicationInput) =>
  call<{ bookingNo: string; link: string }>(
    "/public/community-halls/applications",
    { method: "POST", body: JSON.stringify(input) },
    false,
    "Could not submit the application",
  );
export function fetchPublicBooking(no: string, auth: { sig?: string; phone?: string }) {
  const p = new URLSearchParams({ no });
  if (auth.sig) p.set("sig", auth.sig);
  if (auth.phone) p.set("phone", auth.phone);
  return call<{ booking: PublicBooking }>(`/public/community-halls/booking?${p}`, {}, false, "Could not find the booking").then(
    (r) => r.booking,
  );
}
export const payHallOnline = (no: string, phone: string) =>
  call<{ redirectUrl?: string }>(
    "/public/community-halls/booking/pay",
    { method: "POST", body: JSON.stringify({ no, phone }) },
    false,
    "Online payment failed",
  );

// ---------- office ----------
export const fetchHalls = () => call<{ halls: Hall[] }>("/community-halls/halls").then((r) => r.halls);
export interface HallInput {
  name: string;
  nameHi?: string | null;
  address?: string | null;
  capacity?: number | null;
  facilities?: string | null;
  dailyRent: number;
  securityDeposit: number;
  active?: boolean;
}
export const createHall = (h: HallInput) =>
  call<{ id: number }>("/community-halls/halls", { method: "POST", body: JSON.stringify(h) }, true, "Could not save");
export const updateHall = (id: number, h: HallInput) =>
  call<{ ok: true }>(`/community-halls/halls/${id}`, { method: "PUT", body: JSON.stringify(h) }, true, "Could not save");
export interface BookingList {
  bookings: HallBooking[];
  counts: { applied: number; approved: number; upcoming: number; deposit: number };
  canDecide: boolean;
}
export function fetchBookings(f: { status?: string; hallId?: number; q?: string }) {
  const p = new URLSearchParams();
  if (f.status) p.set("status", f.status);
  if (f.hallId) p.set("hallId", String(f.hallId));
  if (f.q?.trim()) p.set("q", f.q.trim());
  return call<BookingList>(`/community-halls/bookings?${p}`);
}
export const fetchBooking = (id: number) =>
  call<{
    booking: HallBooking;
    overlapping: { booking_no: string; applicant_name: string; status: string; from_date: string; to_date: string }[];
    canDecide: boolean;
  }>(`/community-halls/bookings/${id}`);
const post = (id: number, action: string, body: object) =>
  call<Record<string, unknown>>(
    `/community-halls/bookings/${id}/${action}`,
    { method: "POST", body: JSON.stringify(body) },
    true,
    "Could not save",
  );
export const approveBooking = (id: number, remarks: string) => post(id, "approve", { remarks });
export const rejectBooking = (id: number, reason: string) => post(id, "reject", { reason });
export const recordHallPayment = (id: number, mode: string, reference: string) => post(id, "payment", { mode, reference });
export const cancelBooking = (id: number, reason: string) => post(id, "cancel", { reason });
export const settleHallDeposit = (id: number, deducted: number, remarks: string) => post(id, "deposit", { deducted, remarks });

export const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
export const dmy = (d: string) => d.split("-").reverse().join("-");
export const range = (from: string, to: string) => (from === to ? dmy(from) : `${dmy(from)} to ${dmy(to)}`);
