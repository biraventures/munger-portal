import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";
import {
  apply,
  approve,
  bookingDetail,
  cancel,
  createHall,
  listBookings,
  listHalls,
  publicBooking,
  publicHalls,
  recordOfficePayment,
  reject,
  settleDeposit,
  startOnlinePayment,
  updateHall,
} from "../services/communityHall.service";

function parse<S extends z.ZodTypeAny>(schema: S, data: unknown, msg?: string): z.output<S> {
  const r = schema.safeParse(data);
  if (!r.success) throw ApiError.badRequest(msg ?? r.error.issues[0]?.message ?? "Invalid input");
  return r.data;
}
const id = (v: unknown) => parse(z.coerce.number().int().positive(), v, "Invalid id");
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the dates");
const phone = z
  .string()
  .trim()
  .regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number");
const bookingNo = z.string().trim().min(5).max(24);

const hallBody = z.object({
  name: z.string().trim().min(2, "Enter the hall's name").max(150),
  nameHi: z.string().trim().max(150).nullish(),
  address: z.string().trim().max(500).nullish(),
  capacity: z.coerce.number().int().positive().max(100000).nullish(),
  facilities: z.string().trim().max(1000).nullish(),
  options: z
    .array(
      z.object({
        id: z.coerce.number().int().positive().optional(),
        name: z.string().trim().min(2, "Enter the name of each rate option (e.g. Big hall, Garden only)").max(100),
        nameHi: z.string().trim().max(100).nullish(),
        fullDayRent: z.coerce.number().min(0).max(10000000),
        halfDayRent: z.coerce.number().min(0).max(10000000).nullish(),
        securityDeposit: z.coerce.number().min(0).max(10000000),
      }),
    )
    .min(1, "Add at least one rate option")
    .max(20),
  active: z.boolean().optional(),
});

// ---------- public ----------
export const getPublicHalls = asyncHandler(async (_req: Request, res: Response) => {
  res.json(await publicHalls());
});
export const postApplication = asyncHandler(async (req: Request, res: Response) => {
  const b = parse(
    z.object({
      hallId: z.coerce.number().int().positive(),
      rateOptionId: z.coerce.number().int().positive({ message: "Choose a booking option" }),
      slot: z.enum(["full_day", "morning", "evening"]).optional(),
      fromDate: day,
      toDate: day,
      applicantName: z.string().trim().min(2, "Enter your name").max(150),
      applicantPhone: phone,
      applicantAddress: z.string().trim().min(5, "Enter your address").max(500),
      purpose: z.string().trim().min(3, "Enter the purpose / function").max(200),
      expectedGuests: z.coerce.number().int().positive().max(100000).nullish(),
    }),
    req.body,
  );
  res.status(201).json(await apply(b));
});
export const getPublicBooking = asyncHandler(async (req: Request, res: Response) => {
  const q = parse(
    z.object({
      no: bookingNo,
      sig: z
        .string()
        .regex(/^[0-9a-f]{32}$/i)
        .optional(),
      phone: phone.optional(),
    }),
    req.query,
    "Enter the booking number and your mobile number.",
  );
  if (!q.sig && !q.phone) throw ApiError.badRequest("Enter the booking number and your mobile number.");
  res.json({ booking: await publicBooking(q.no, { sig: q.sig?.toLowerCase(), phone: q.phone }) });
});
export const postOnlinePayment = asyncHandler(async (req: Request, res: Response) => {
  const b = parse(z.object({ no: bookingNo, phone }), req.body);
  res.json(await startOnlinePayment(b.no, b.phone));
});

// ---------- office ----------
export const getHalls = asyncHandler(async (req: Request, res: Response) => {
  res.json({ halls: await listHalls(req.admin!) });
});
export const postHall = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await createHall(req.admin!, parse(hallBody, req.body)));
});
export const putHall = asyncHandler(async (req: Request, res: Response) => {
  await updateHall(req.admin!, id(req.params.id), parse(hallBody, req.body));
  res.json({ ok: true });
});
export const getBookings = asyncHandler(async (req: Request, res: Response) => {
  const q = parse(
    z.object({
      status: z.string().max(16).optional(),
      hallId: z.coerce.number().int().positive().optional(),
      q: z.string().max(100).optional(),
    }),
    req.query,
  );
  res.json(await listBookings(req.admin!, q));
});
export const getBooking = asyncHandler(async (req: Request, res: Response) => {
  res.json(await bookingDetail(req.admin!, id(req.params.id)));
});
export const postApprove = asyncHandler(async (req: Request, res: Response) => {
  const b = parse(z.object({ remarks: z.string().trim().max(500).nullish() }), req.body ?? {});
  res.json(await approve(req.admin!, id(req.params.id), b.remarks ?? null));
});
export const postReject = asyncHandler(async (req: Request, res: Response) => {
  const b = parse(z.object({ reason: z.string().trim().min(3, "Write the reason").max(500) }), req.body);
  await reject(req.admin!, id(req.params.id), b.reason);
  res.json({ ok: true });
});
export const postPayment = asyncHandler(async (req: Request, res: Response) => {
  const b = parse(
    z.object({
      mode: z.enum(["cash", "pos_card", "pos_upi", "dd"], { message: "Choose how it was paid" }),
      reference: z.string().trim().max(80).nullish(),
    }),
    req.body,
  );
  await recordOfficePayment(req.admin!, id(req.params.id), b.mode, b.reference ?? null);
  res.json({ ok: true });
});
export const postCancel = asyncHandler(async (req: Request, res: Response) => {
  const b = parse(z.object({ reason: z.string().trim().min(3, "Write the reason").max(500) }), req.body);
  await cancel(req.admin!, id(req.params.id), b.reason);
  res.json({ ok: true });
});
export const postSettleDeposit = asyncHandler(async (req: Request, res: Response) => {
  const b = parse(z.object({ deducted: z.coerce.number().min(0), remarks: z.string().trim().max(500).nullish() }), req.body);
  await settleDeposit(req.admin!, id(req.params.id), b.deducted, b.remarks ?? null);
  res.json({ ok: true });
});
