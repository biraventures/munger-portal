import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { verifyToken } from "../services/publicLightFault.service";
import { myReports, PROBLEMS, reportFault, ward, wards } from "../services/publicPyauFault.service";

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
