import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";
import {
  cancelTicket,
  counterToday,
  cutTicket,
  feeHistory,
  report,
  setFee,
  ticketById,
  verifyTicket,
} from "../services/crematorium.service";

function parse<S extends z.ZodTypeAny>(schema: S, data: unknown, msg?: string): z.output<S> {
  const r = schema.safeParse(data);
  if (!r.success) throw ApiError.badRequest(msg ?? r.error.issues[0]?.message ?? "Invalid input");
  return r.data;
}
const id = (v: unknown) => parse(z.coerce.number().int().positive(), v, "Invalid ticket");
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date");

const ticketBody = z.object({
  deceasedName: z.string().trim().min(2, "Enter the name of the deceased").max(150),
  informantName: z.string().trim().min(2, "Enter the informant's name").max(150),
  informantRelation: z.string().trim().min(2, "Enter the informant's relation with the deceased").max(60),
  informantAddress: z.string().trim().min(5, "Enter the informant's address").max(500),
  informantPhone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, "Enter the informant's 10-digit mobile number"),
  cremationDate: day,
  cremationTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter the time of cremation"),
  remarks: z.string().trim().max(500).nullish(),
  paymentMode: z.enum(["cash", "pos_card", "pos_upi"], { message: "Choose cash, card or UPI" }),
  posReference: z.string().trim().max(60).nullish(),
});

export const getCounterToday = asyncHandler(async (req: Request, res: Response) => {
  res.json(await counterToday(req.admin!));
});
export const postTicket = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json({ ticket: await cutTicket(req.admin!, parse(ticketBody, req.body)) });
});
export const getTicket = asyncHandler(async (req: Request, res: Response) => {
  res.json({ ticket: await ticketById(req.admin!, id(req.params.id)) });
});
export const postCancel = asyncHandler(async (req: Request, res: Response) => {
  const b = parse(z.object({ reason: z.string().trim().min(3, "Write the reason for cancelling").max(500) }), req.body);
  await cancelTicket(req.admin!, id(req.params.id), b.reason);
  res.json({ ok: true });
});
export const getReport = asyncHandler(async (req: Request, res: Response) => {
  const q = parse(
    z.object({ from: day, to: day, q: z.string().trim().max(100).optional(), counter: z.string().trim().max(64).optional() }),
    req.query,
    "Choose the dates",
  );
  res.json(await report(req.admin!, q.from, q.to, q.q ?? null, q.counter || null));
});
export const getFees = asyncHandler(async (req: Request, res: Response) => {
  res.json({ history: await feeHistory(req.admin!) });
});
export const putFee = asyncHandler(async (req: Request, res: Response) => {
  const b = parse(
    z.object({ amount: z.coerce.number().min(0).max(100000), remarks: z.string().trim().max(300).nullish() }),
    req.body,
    "Enter the fee.",
  );
  await setFee(req.admin!, b.amount, b.remarks ?? null);
  res.json({ ok: true });
});
// Public: the QR on a printed ticket.
export const getVerify = asyncHandler(async (req: Request, res: Response) => {
  const sig = parse(z.string().regex(/^[0-9a-f]{32}$/i), req.query.sig, "Invalid link");
  res.json(await verifyTicket(String(req.params.ticketNo), sig.toLowerCase()));
});
