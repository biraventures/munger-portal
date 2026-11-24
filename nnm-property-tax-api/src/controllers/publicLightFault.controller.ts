import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { myReports, openSession, reportFault, reportFaultByLocation, segmentLights, verifyToken, ward, wards } from "../services/publicLightFault.service";

const session = (req: Request) => verifyToken(req.header("authorization"));
const idParam = (v: unknown) => {
  const r = z.coerce.number().int().positive().safeParse(v);
  if (!r.success) throw ApiError.notFound("Not found.");
  return r.data;
};

/** POST /api/v1/public/streetlights/session { holdingNo, mobile } */
export const postSession = asyncHandler(async (req: Request, res: Response) => {
  const b = z.object({ holdingNo: z.string().trim().min(1, "Enter your holding number.").max(32), mobile: z.string().trim().min(10, "Enter your mobile number.").max(20) }).safeParse(req.body);
  if (!b.success) throw ApiError.badRequest(b.error.issues[0]?.message ?? "Check the details.");
  const r = await openSession(b.data.holdingNo, b.data.mobile);
  res.locals.sessionOk = true;
  res.status(200).json(r);
});

/** GET /api/v1/public/streetlights/wards?type=high_mast|streetlight */
export const getWards = asyncHandler(async (req: Request, res: Response) => {
  session(req);
  const t = z.enum(["streetlight", "high_mast"]).optional().safeParse(req.query.type || undefined);
  res.status(200).json({ wards: await wards(t.success ? t.data : undefined) });
});

/** GET /api/v1/public/streetlights/wards/:id - streets and High Mast lights of one ward. */
export const getWard = asyncHandler(async (req: Request, res: Response) => {
  session(req);
  res.status(200).json(await ward(idParam(req.params.id)));
});

/** GET /api/v1/public/streetlights/segments/:id/lights */
export const getSegmentLights = asyncHandler(async (req: Request, res: Response) => {
  session(req);
  res.status(200).json({ lights: await segmentLights(idParam(req.params.id)) });
});

/** POST /api/v1/public/streetlights/faults { lightId, nonFunctionalSince, switchStatus, remarks } */
export const postFault = asyncHandler(async (req: Request, res: Response) => {
  const s = session(req);
  const b = z
    .object({
      lightId: z.coerce.number().int().positive(),
      nonFunctionalSince: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the date it stopped working."),
      switchStatus: z.enum(["working", "not_working", "automatic", "joint", "unknown"], { errorMap: () => ({ message: "Choose the switch status." }) }),
      remarks: z.string().trim().max(500).nullish(),
    })
    .safeParse(req.body);
  if (!b.success) throw ApiError.badRequest(b.error.issues[0]?.message ?? "Check the details.");
  res.status(201).json(await reportFault(s, b.data));
});

/** GET /api/v1/public/streetlights/my-reports */
export const getMyReports = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json({ reports: await myReports(session(req)) });
});

const locationFields = {
  wardId: z.coerce.number().int().positive({ message: "Choose the ward." }),
  latitude: z.number({ message: "Capture the location - stand at it and press \"Capture location\"." }).min(-90).max(90),
  longitude: z.number({ message: "Capture the location." }).min(-180).max(180),
  accuracyM: z.number().min(0).max(100000).nullish().transform((v) => v ?? null),
  landmark: z.string().trim().min(3, "Describe where it is - a landmark, the house or shop near it.").max(300),
  nonFunctionalSince: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the date it stopped working."),
  remarks: z.string().trim().max(500).nullish(),
};

/** POST /api/v1/public/streetlights/faults-by-location - a light the citizen cannot find in the list, by GPS location. */
export const postFaultByLocation = asyncHandler(async (req: Request, res: Response) => {
  const s = session(req);
  const b = z
    .object({
      ...locationFields,
      lightKind: z.enum(["streetlight", "high_mast"], { errorMap: () => ({ message: "Choose streetlight or High Mast." }) }),
      switchStatus: z.enum(["working", "not_working", "automatic", "joint", "unknown"], { errorMap: () => ({ message: "Choose the switch status." }) }),
    })
    .safeParse(req.body);
  if (!b.success) throw ApiError.badRequest(b.error.issues[0]?.message ?? "Check the details.");
  if (b.data.latitude === 0 && b.data.longitude === 0) throw ApiError.badRequest("The location was not read - capture it again.");
  res.status(201).json(await reportFaultByLocation(s, b.data));
});
