import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";
import {
  advanceRecords,
  deleteLegacy,
  editRecord,
  getRecord,
  legacyPreview,
  listAllRecords,
  listFieldRecords,
  myPendingCount,
  sendBack,
  setAside,
  type MigActor,
  takeUp,
} from "../services/migRecord.service";

function parse<S extends z.ZodTypeAny>(schema: S, data: unknown, msg?: string): z.output<S> {
  const r = schema.safeParse(data);
  if (!r.success) throw ApiError.badRequest(msg ?? r.error.issues[0]?.message ?? "Invalid input");
  return r.data;
}
const id = (v: unknown) => parse(z.coerce.number().int().positive(), v, "Invalid record");
const opt = z.string().trim().max(200).nullish();

/** The login acting on the approvals screen: an admin (its role) or a Nagar Nigam operator. */
function actor(req: Request): MigActor {
  if (req.admin) return { role: req.admin.role, name: req.admin.displayName };
  if (req.operator) return { role: "operator", name: `${req.operator.displayName} (Operator)` };
  throw new ApiError(401, "Please log in again.");
}

// ---------- approvals (Operator -> Tax Daroga -> City Manager; Commissioner any step; DMC views) ----------
export const getAllRecords = asyncHandler(async (req: Request, res: Response) => {
  const q = parse(
    z.object({
      status: z.string().max(12).optional(),
      stage: z.enum(["operator", "tax_daroga", "city_manager"]).optional(),
      ward: z.string().max(16).optional(),
      issues: z.enum(["blocking", "warning", "none", "any"]).optional(),
      q: z.string().max(100).optional(),
      page: z.coerce.number().int().min(1).max(100000).optional(),
    }),
    req.query,
  );
  res.json(await listAllRecords(actor(req), q));
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
  await editRecord(actor(req), id(req.params.id), {
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
export const getMyCount = asyncHandler(async (req: Request, res: Response) => {
  res.json(await myPendingCount(actor(req)));
});
export const postAdvance = asyncHandler(async (req: Request, res: Response) => {
  const b = parse(
    z.object({
      ids: z.array(z.coerce.number().int().positive()).max(5000).optional(),
      allMine: z.object({ ward: z.string().max(16).optional() }).optional(),
    }),
    req.body,
  );
  res.json(await advanceRecords(actor(req), b));
});
export const postSendBack = asyncHandler(async (req: Request, res: Response) => {
  const b = parse(z.object({ note: z.string().trim().min(3, "Write what is to be checked / corrected").max(500) }), req.body);
  res.json(await sendBack(actor(req), id(req.params.id), b.note));
});
export const postSetAside = asyncHandler(async (req: Request, res: Response) => {
  const b = parse(z.object({ reason: z.string().trim().min(3, "Write the reason").max(500) }), req.body);
  await setAside(actor(req), id(req.params.id), b.reason);
  res.json({ ok: true });
});
export const postRestore = asyncHandler(async (req: Request, res: Response) => {
  await setAside(actor(req), id(req.params.id), null);
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
