import fs from "node:fs";
import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { fieldReportPhotoFile } from "../services/fieldReport.service";

/** GET /api/v1/admin/field-report-photos/:photoId */
export const getFieldReportPhoto = asyncHandler(async (req: Request, res: Response) => {
  const id = z.string().regex(/^\d{1,18}$/).safeParse(req.params.photoId);
  if (!id.success) throw ApiError.notFound("Photo not found.");
  const f = await fieldReportPhotoFile(id.data);
  if (!fs.existsSync(f.fullPath)) throw ApiError.notFound("The photo is missing from storage.");
  res.setHeader("Content-Type", f.mime);
  res.setHeader("X-Content-Type-Options", "nosniff");
  fs.createReadStream(f.fullPath).pipe(res);
});
