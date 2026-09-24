import type { Request, Response } from "express";
import { z } from "zod";
import { importPropertiesXlsx } from "../services/propertyBulkImport.service";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

const uploadSchema = z.object({
  fileDataBase64: z.string().min(1, "File data is required"),
});

/**
 * POST /api/v1/admin/properties/bulk-upload - commissioner only.
 * Imports all 6 sheets (Master, Floors, Transactions, PropertyHistory,
 * DemandNotices, TaxHistoryStages) from a Google-Sheets-backup-style
 * .xlsx file - see propertyBulkImport.service.ts for the exact
 * expected format.
 */
export const uploadPropertiesXlsxHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = uploadSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Invalid input", parsed.error.flatten().fieldErrors);

  let fileBuffer: Buffer;
  try {
    fileBuffer = Buffer.from(parsed.data.fileDataBase64, "base64");
  } catch {
    throw ApiError.badRequest("Could not decode the uploaded file.");
  }
  if (fileBuffer.length === 0) throw ApiError.badRequest("The uploaded file is empty.");

  const result = await importPropertiesXlsx(fileBuffer, req.admin!.displayName);
  res.status(200).json(result);
});
