import type { Request, Response } from "express";
import { listSpacedHoldings, bulkDeleteSpacedHoldings, removeDuplicateFloors } from "../services/propertyBulkCleanup.service";
import { asyncHandler } from "../middleware/asyncHandler";

/** GET /api/v1/admin/properties/spaced-holdings - commissioner only. Preview of every holding whose holding_no currently contains a space, before bulk-deleting them. */
export const getSpacedHoldings = asyncHandler(async (_req: Request, res: Response) => {
  const holdings = await listSpacedHoldings();
  res.status(200).json({ holdings });
});

/** POST /api/v1/admin/properties/spaced-holdings/delete-all - commissioner only. Bulk-deletes every holding whose holding_no currently contains a space; skips (does not delete) any with an actual payment on file. */
export const postDeleteSpacedHoldings = asyncHandler(async (req: Request, res: Response) => {
  const result = await bulkDeleteSpacedHoldings(req.admin!.displayName);
  res.status(200).json(result);
});

/** POST /api/v1/admin/properties/remove-duplicate-floors - commissioner only. Removes exact-duplicate floor rows left over from a re-uploaded bulk import. */
export const postRemoveDuplicateFloors = asyncHandler(async (_req: Request, res: Response) => {
  const result = await removeDuplicateFloors();
  res.status(200).json(result);
});
