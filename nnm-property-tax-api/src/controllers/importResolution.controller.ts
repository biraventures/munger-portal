import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { decide, heldItems, itemDetail, propose, waitingForMe } from "../services/importResolution.service";

const batchId = (v: unknown) => {
  const r = z.coerce.number().int().positive().safeParse(v);
  if (!r.success) throw ApiError.badRequest("Invalid upload");
  return r.data;
};
const ref = (v: unknown) => {
  const r = z
    .string()
    .regex(/^[sr]\d+$/)
    .safeParse(v);
  if (!r.success) throw ApiError.badRequest("Invalid item");
  return r.data;
};

/** GET /admin/property-imports/:id/held - kept out / blocked / failed / not staged, with their resolutions. */
export const getHeldItems = asyncHandler(async (req: Request, res: Response) => {
  res.json(await heldItems(req.admin!, batchId(req.params.id)));
});

/** GET /admin/property-imports/:id/held/:ref */
export const getHeldItem = asyncHandler(async (req: Request, res: Response) => {
  res.json(await itemDetail(req.admin!, batchId(req.params.id), ref(req.params.ref)));
});

/** POST /admin/property-imports/:id/held/:ref/resolution { action, masterChanges?, floors?, remarks } - Tax Daroga */
export const postResolution = asyncHandler(async (req: Request, res: Response) => {
  const b = z
    .object({
      action: z.enum(["correct_import", "import_as_is", "drop", "merge"]),
      masterChanges: z.record(z.string().max(80), z.string().max(2000)).nullish(),
      floors: z
        .array(z.record(z.string().max(80), z.string().max(2000)))
        .max(200)
        .nullish(),
      mergePlan: z
        .object({
          fields: z.record(z.string().max(80), z.enum(["live", "uploaded"])),
          floors: z.enum(["keep_live", "use_uploaded"]),
          addReceipts: z.array(z.string().max(100)).max(5000),
          addNotices: z.array(z.string().max(100)).max(5000),
          addStages: z.array(z.string().max(100)).max(500),
          appendHistory: z.boolean(),
        })
        .nullish(),
      remarks: z.string().trim().max(2000),
    })
    .safeParse(req.body);
  if (!b.success) throw ApiError.badRequest("Choose what to do and write the remarks.");
  res.status(201).json(await propose(req.admin!, batchId(req.params.id), { ref: ref(req.params.ref), ...b.data }));
});

/** POST /admin/import-resolutions/:caseId/decide { decision: forward | approve | revert, comment } */
export const postResolutionDecision = asyncHandler(async (req: Request, res: Response) => {
  const b = z
    .object({ decision: z.enum(["forward", "approve", "revert"]), comment: z.string().trim().max(2000).nullish() })
    .safeParse(req.body);
  if (!b.success) throw ApiError.badRequest("Choose the decision.");
  res.json(await decide(req.admin!, batchId(req.params.caseId), b.data.decision, b.data.comment ?? null));
});

/** GET /admin/import-resolutions/waiting - resolutions waiting for this login. */
export const getResolutionsWaiting = asyncHandler(async (req: Request, res: Response) => {
  res.json(await waitingForMe(req.admin!));
});
