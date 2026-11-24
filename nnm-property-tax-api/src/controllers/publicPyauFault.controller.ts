import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { verifyToken } from "../services/publicLightFault.service";
import { myReports, PROBLEMS, reportFault,
  reportFaultByLocation, ward, wards } from "../services/publicPyauFault.service";

// The same holding number + mobile session as the public streetlight page (POST /public/streetlights/session).
const session = (req: Request) => verifyToken(req.header("authorization"));

/** GET /api/v1/public/submersibles/wards */
export const getPyauWards = asyncHandler(async (req: Request, res: Response) => {
  session(req);
  res.status(200).json({ wards: await wards() });
});

/** GET /api/v1/public/submersibles/wards/:id */
export const getPyauWard = asyncHandler(async (req: Request, res: Response) => {
  session(req);
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!id.success) throw ApiError.notFound("Not found.");
  res.status(200).json({ pyaus: await ward(id.data) });
});

/** POST /api/v1/public/submersibles/faults { pyauId, nonFunctionalSince, problem, remarks } */
export const postPyauFault = asyncHandler(async (req: Request, res: Response) => {
  const s = session(req);
  const b = z
    .object({
      pyauId: z.coerce.number().int().positive(),
      nonFunctionalSince: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the date it stopped working."),
      problem: z.enum(PROBLEMS, { errorMap: () => ({ message: "Choose the problem you saw." }) }),
      remarks: z.string().trim().max(500).nullish(),
    })
    .safeParse(req.body);
  if (!b.success) throw ApiError.badRequest(b.error.issues[0]?.message ?? "Check the details.");
  res.status(201).json(await reportFault(s, b.data));
});

/** GET /api/v1/public/submersibles/my-reports */
export const getPyauMyReports = asyncHandler(async (req: Request, res: Response) => {
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

/** POST /api/v1/public/submersibles/faults-by-location - a submersible the citizen cannot find in the list, by GPS location. */
export const postPyauFaultByLocation = asyncHandler(async (req: Request, res: Response) => {
  const s = session(req);
  const b = z
    .object({ ...locationFields, problem: z.enum(PROBLEMS, { errorMap: () => ({ message: "Choose the problem you saw." }) }) })
    .safeParse(req.body);
  if (!b.success) throw ApiError.badRequest(b.error.issues[0]?.message ?? "Check the details.");
  if (b.data.latitude === 0 && b.data.longitude === 0) throw ApiError.badRequest("The location was not read - capture it again.");
  res.status(201).json(await reportFaultByLocation(s, b.data));
});
