import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";
import {
  approveRecords,
  deleteLegacy,
  editRecord,
  getRecord,
  legacyPreview,
  listAllRecords,
  listFieldRecords,
  setAside,
  takeUp,
} from "../services/migRecord.service";

function parse<S extends z.ZodTypeAny>(schema: S, data: unknown, msg?: string): z.output<S> {
  const r = schema.safeParse(data);
  if (!r.success) throw ApiError.badRequest(msg ?? r.error.issues[0]?.message ?? "Invalid input");
  return r.data;
}
const id = (v: unknown) => parse(z.coerce.number().int().positive(), v, "Invalid record");
const opt = z.string().trim().max(200).nullish();

// ---------- Commissioner ----------
export const getAllRecords = asyncHandler(async (req: Request, res: Response) => {
  const q = parse(
    z.object({
      status: z.string().max(12).optional(),
      ward: z.string().max(16).optional(),
      issues: z.enum(["blocking", "warning", "none", "any"]).optional(),
      q: z.string().max(100).optional(),
      page: z.coerce.number().int().min(1).max(100000).optional(),
    }),
    req.query,
  );
  res.json(await listAllRecords(req.admin!, q));
});
export const putRecord = asyncHandler(async (req: Request, res: Response) => {
  const b = parse(
    z.object({
      ward: z.string().trim().max(16),
      oldHoldingNo: opt,
      oldPid: opt,
      ownerName: z.string().trim().max(200),
      relation: z.string().trim().max(8).nullish(),
      relativeName: opt,
      holdingCreationYear: z.string().trim().max(20).nullish(),
      lastPaymentYear: z.string().trim().max(20).nullish(),
      taxStatus: opt,
      remarks: z.string().trim().max(1000).nullish(),
    }),
    req.body,
  );
  await editRecord(req.admin!, id(req.params.id), {
    ward: b.ward,
    oldHoldingNo: b.oldHoldingNo ?? null,
    oldPid: b.oldPid ?? null,
    ownerName: b.ownerName,
    relation: b.relation ?? null,
    relativeName: b.relativeName ?? null,
    holdingCreationYear: b.holdingCreationYear ?? null,
    lastPaymentYear: b.lastPaymentYear ?? null,
    taxStatus: b.taxStatus ?? null,
    remarks: b.remarks ?? null,
  });
  res.json({ ok: true });
});
export const postApprove = asyncHandler(async (req: Request, res: Response) => {
  const b = parse(
    z.object({
      ids: z.array(z.coerce.number().int().positive()).max(5000).optional(),
      allPending: z.object({ ward: z.string().max(16).optional() }).optional(),
    }),
    req.body,
  );
  res.json(await approveRecords(req.admin!, b));
});
export const postSetAside = asyncHandler(async (req: Request, res: Response) => {
  const b = parse(z.object({ reason: z.string().trim().min(3, "Write the reason").max(500) }), req.body);
  await setAside(req.admin!, id(req.params.id), b.reason);
  res.json({ ok: true });
});
export const postRestore = asyncHandler(async (req: Request, res: Response) => {
  await setAside(req.admin!, id(req.params.id), null);
  res.json({ ok: true });
});
export const getLegacy = asyncHandler(async (req: Request, res: Response) => {
  res.json(await legacyPreview(req.admin!));
});
export const postDeleteLegacy = asyncHandler(async (req: Request, res: Response) => {
  const b = parse(z.object({ confirm: z.string().max(40) }), req.body);
  res.json(await deleteLegacy(req.admin!, b.confirm));
});

// ---------- field staff ----------
export const getFieldRecords = asyncHandler(async (req: Request, res: Response) => {
  const q = parse(
    z.object({
      show: z.enum(["approved", "taken_up", "all"]).optional(),
      ward: z.string().max(16).optional(),
      q: z.string().max(100).optional(),
      page: z.coerce.number().int().min(1).max(100000).optional(),
    }),
    req.query,
  );
  res.json(await listFieldRecords(req.admin!, q));
});
export const getOneRecord = asyncHandler(async (req: Request, res: Response) => {
  res.json({ record: await getRecord(req.admin!, id(req.params.id)) });
});
export const postTakeUp = asyncHandler(async (req: Request, res: Response) => {
  res.json(await takeUp(req.admin!, id(req.params.id)));
});
