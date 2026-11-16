import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";
import {
  admit,
  assignCounter,
  cancelTicket,
  counterToday,
  createGarden,
  listCounterLogins,
  listGardens,
  publicGarden,
  publicTicket,
  report,
  sellTicket,
  startOnlinePurchase,
  updateGarden,
} from "../services/garden.service";

function parse<S extends z.ZodTypeAny>(schema: S, data: unknown, msg: string): z.output<S> {
  const r = schema.safeParse(data);
  if (!r.success) throw ApiError.badRequest(msg);
  return r.data;
}
const id = (v: unknown) => parse(z.coerce.number().int().positive(), v, "Invalid id");
const gardenBody = z.object({
  name: z.string().trim().min(2).max(150),
  nameHi: z.string().trim().max(150).nullish(),
  feePerPerson: z.coerce.number().min(0).max(10000),
  maxPersonsPerTicket: z.coerce.number().int().min(1).max(500).optional(),
  active: z.boolean().optional(),
});
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// ---------- officers ----------
export const getGardens = asyncHandler(async (req: Request, res: Response) => {
  res.json({ gardens: await listGardens(req.admin!) });
});
export const postGarden = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await createGarden(req.admin!, parse(gardenBody, req.body, "Enter the garden name and the fee per person.")));
});
export const putGarden = asyncHandler(async (req: Request, res: Response) => {
  await updateGarden(req.admin!, id(req.params.id), parse(gardenBody, req.body, "Enter the garden name and the fee per person."));
  res.json({ ok: true });
});
export const getCounterLogins = asyncHandler(async (req: Request, res: Response) => {
  res.json({ logins: await listCounterLogins(req.admin!) });
});
export const putCounterAssignment = asyncHandler(async (req: Request, res: Response) => {
  const b = parse(z.object({ gardenId: z.coerce.number().int().positive().nullable() }), req.body, "Choose the garden.");
  await assignCounter(req.admin!, parse(z.string().trim().min(1).max(64), req.params.username, "Invalid username"), b.gardenId);
  res.json({ ok: true });
});
export const getGardenReport = asyncHandler(async (req: Request, res: Response) => {
  const q = parse(
    z.object({ from: day, to: day, gardenId: z.coerce.number().int().positive().optional() }),
    req.query,
    "Choose the dates.",
  );
  res.json(await report(req.admin!, q));
});

// ---------- counter ----------
export const getCounterToday = asyncHandler(async (req: Request, res: Response) => {
  res.json(await counterToday(req.admin!));
});
export const postCounterTicket = asyncHandler(async (req: Request, res: Response) => {
  const b = parse(
    z.object({
      persons: z.coerce.number().int(),
      paymentMode: z.enum(["cash", "pos_card", "pos_upi"]),
      posReference: z.string().trim().max(60).nullish(),
      admitNow: z.boolean().optional(),
    }),
    req.body,
    "Enter the number of persons and the payment mode.",
  );
  res.status(201).json(await sellTicket(req.admin!, b));
});
export const postCancelTicket = asyncHandler(async (req: Request, res: Response) => {
  const b = parse(z.object({ reason: z.string().trim().min(3).max(300) }), req.body, "Give the reason for cancelling.");
  await cancelTicket(req.admin!, id(req.params.id), b.reason);
  res.json({ ok: true });
});
export const postAdmit = asyncHandler(async (req: Request, res: Response) => {
  const b = parse(z.object({ scanned: z.string().trim().min(5).max(500) }), req.body, "Scan the ticket.");
  res.json(await admit(req.admin!, b.scanned));
});

// ---------- public ----------
export const getPublicGarden = asyncHandler(async (req: Request, res: Response) => {
  res.json(await publicGarden(parse(z.string().trim().min(4).max(16), req.params.code, "Invalid garden link")));
});
export const getPublicTicket = asyncHandler(async (req: Request, res: Response) => {
  const ticketNo = parse(z.string().trim().min(5).max(24), req.params.ticketNo, "Invalid ticket");
  const sig = parse(
    z
      .string()
      .trim()
      .regex(/^[0-9a-f]{32}$/i),
    req.query.sig,
    "Invalid ticket link",
  );
  res.json(await publicTicket(ticketNo, sig.toLowerCase()));
});
export const postPublicPurchase = asyncHandler(async (req: Request, res: Response) => {
  const b = parse(z.object({ persons: z.coerce.number().int() }), req.body, "Enter the number of persons.");
  res.json(await startOnlinePurchase(parse(z.string().trim().min(4).max(16), req.params.code, "Invalid garden link"), b.persons));
});
